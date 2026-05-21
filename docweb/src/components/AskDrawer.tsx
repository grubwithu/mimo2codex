import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Collapse,
  Drawer,
  Grid,
  Image,
  message as antdMessage,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import {
  ArrowDownOutlined,
  ClearOutlined,
  CloseCircleFilled,
  ExclamationCircleOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  RobotOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Bubble, Prompts, Sender, XStream } from "@ant-design/x";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { askEndpoint, askHeaders } from "../api/client";
import { useLanguage } from "../contexts/LanguageContext";
import { hasSlug } from "../docs/loader";
import { getClientId } from "../utils/clientId";
import { compressImageFile } from "../utils/image";
import MarkdownText from "./MarkdownText";

type WorkflowStep = {
  id: string;
  name: string;
  arguments: string;
  resultSlugs?: string[];
  resultError?: string;
  pending: boolean;
};

interface UserMessage {
  key: string;
  role: "user";
  content: string;
  /** Data URLs of images the user attached to this message. */
  images?: string[];
}
interface AssistantMessage {
  key: string;
  role: "assistant";
  content: string;
  thinking?: string;
  workflow?: WorkflowStep[];
  docs?: string[];
  errored?: boolean;
}
type Message = UserMessage | AssistantMessage;

interface AskDrawerProps {
  open: boolean;
  onClose: () => void;
}

const MAX_IMAGES = 4;

function historyKey(): string {
  return `docweb:askHistory:${getClientId()}`;
}

function loadHistory(): Message[] {
  try {
    const raw = window.localStorage.getItem(historyKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-40) as Message[];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    window.localStorage.setItem(historyKey(), JSON.stringify(messages.slice(-40)));
  } catch {
    // localStorage full or blocked — skip persistence silently.
  }
}

// AskDrawer is the right-side AI-chat panel rendered globally. It opens an
// SSE stream against POST /api/ask whose frames are JSON objects keyed by
// event kind: { docs }, { thinking }, { tool_call }, { tool_result },
// { delta }, { done }, { error }. The backend drives a real tool-calling
// agent loop over the docs corpus; we visualize each search step as a
// workflow row above the answer body. Users can attach config screenshots
// (mimo-v2.5 multi-modal) — images are compressed to JPEG ≤1280px before
// upload to keep request payloads small.
export default function AskDrawer({ open, onClose }: AskDrawerProps) {
  const { t } = useTranslation("ideas");
  const { lang } = useLanguage();
  const screens = Grid.useBreakpoint();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  // We control Sender's text value ourselves so we can guarantee a clear on
  // submit. antd-x's Sender auto-clears in the simple text-only case but
  // misbehaves when an image attachment is also present (text lingers in the
  // textarea after the message ships).
  const [senderValue, setSenderValue] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Scroll tracking for the message list. We manage scroll ourselves (instead
  // of relying on Bubble.List's autoScroll) because the scroll surface is the
  // outer wrapper, not the bubble list itself — autoScroll on the list does
  // nothing in that arrangement.
  //
  //   - atBottom (state): drives the "back to bottom" button visibility.
  //   - wasAtBottomRef: captured in onScroll, read inside the messages effect.
  //     A ref avoids re-firing the effect just because the boolean flipped.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const wasAtBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const at = distance < 32; // 32px tolerance — counts as "at bottom"
    setAtBottom(at);
    wasAtBottomRef.current = at;
  }, []);

  const scrollListToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollContainerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [],
  );

  // Follow streaming output: when messages grow and the user was at the
  // bottom before, keep them at the bottom. We use 'auto' (instant) here so
  // the scroll keeps up with rapidly-arriving SSE deltas without animating
  // jerkily 30+ times a second.
  useEffect(() => {
    if (messages.length === 0) return;
    if (wasAtBottomRef.current) {
      scrollListToBottom("auto");
    }
  }, [messages, scrollListToBottom]);

  useEffect(() => {
    if (open) setMessages(loadHistory());
  }, [open]);

  useEffect(() => {
    if (messages.length > 0) saveHistory(messages);
  }, [messages]);

  const samplePrompts = useMemo(
    () => [
      { key: "firstTime", label: t("floats.samples.firstTime") },
      { key: "proxy", label: t("floats.samples.proxy") },
      { key: "generic", label: t("floats.samples.generic") },
    ],
    [t],
  );

  const handleSlugClick = useCallback(
    (slug: string) => {
      if (!hasSlug(slug)) return;
      navigate(`/docs/${slug}`);
      onClose();
    },
    [navigate, onClose],
  );

  // ── Attachment intake ────────────────────────────────────────────────
  // Three entry points feed into the same compress-then-buffer pipeline:
  // file picker (Upload), drag-drop (Upload beforeUpload), and paste
  // (Sender.onPasteFile). The shared helper enforces the per-message cap
  // and surfaces an inline antd `message` toast on failure.
  const ingestImageFile = useCallback(
    async (file: File): Promise<boolean> => {
      if (!file.type.startsWith("image/")) {
        antdMessage.warning(t("floats.imageInvalid"));
        return false;
      }
      try {
        const dataUrl = await compressImageFile(file);
        setPendingImages((prev) => {
          if (prev.length >= MAX_IMAGES) {
            antdMessage.warning(t("floats.imageMaxCount"));
            return prev;
          }
          return [...prev, dataUrl];
        });
        return true;
      } catch {
        antdMessage.error(t("floats.imageInvalid"));
        return false;
      }
    },
    [t],
  );

  const removePendingImage = useCallback((idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if ((!q && pendingImages.length === 0) || loading) return;

      const attached = pendingImages;
      setPendingImages([]);
      // Clear the text input. With the Sender controlled via senderValue we
      // own this — guarantees the textarea empties even when the message
      // carried image attachments alongside text.
      setSenderValue("");

      const userKey = `u-${Date.now()}`;
      const asstKey = `a-${Date.now() + 1}`;
      setMessages((m) => [
        ...m,
        {
          key: userKey,
          role: "user",
          content: q || "",
          images: attached.length > 0 ? attached : undefined,
        },
        {
          key: asstKey,
          role: "assistant",
          content: "",
          docs: [],
          thinking: "",
          workflow: [],
        },
      ]);
      setLoading(true);

      // User just submitted — override prior scroll position and snap to the
      // newly-appended messages. Setting wasAtBottomRef=true also opts the
      // user into streaming follow for this round.
      wasAtBottomRef.current = true;
      requestAnimationFrame(() => scrollListToBottom("smooth"));

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const labelError = (msg: string) =>
        setMessages((prev) =>
          updateAssistant(prev, asstKey, (m) => ({
            ...m,
            content: msg,
            errored: true,
          })),
        );

      try {
        const res = await fetch(askEndpoint(), {
          method: "POST",
          headers: askHeaders(),
          body: JSON.stringify({
            question: q,
            lang,
            clientId: getClientId(),
            images: attached.length > 0 ? attached : undefined,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          const msg =
            res.status === 429
              ? t("floats.rateLimited")
              : `${t("floats.errorPrefix")}${res.status}`;
          labelError(msg);
          return;
        }
        if (!res.body) {
          labelError(`${t("floats.errorPrefix")}no response body`);
          return;
        }

        for await (const chunk of XStream({ readableStream: res.body })) {
          if (!chunk.data) continue;
          let evt:
            | {
                delta?: string;
                thinking?: string;
                docs?: string[];
                tool_call?: { id: string; name: string; arguments: string };
                tool_result?: {
                  id: string;
                  name: string;
                  result: { slugs?: string[]; error?: string };
                };
                done?: boolean;
                error?: string;
              }
            | null = null;
          try {
            evt = JSON.parse(chunk.data as string);
          } catch {
            continue;
          }
          if (!evt) continue;

          if (evt.error) {
            labelError(`${t("floats.errorPrefix")}${evt.error}`);
            return;
          }
          if (evt.done) return;
          if (Array.isArray(evt.docs)) {
            const slugs = evt.docs;
            setMessages((prev) =>
              updateAssistant(prev, asstKey, (m) => ({ ...m, docs: slugs })),
            );
            continue;
          }
          if (evt.tool_call) {
            const tc = evt.tool_call;
            setMessages((prev) =>
              updateAssistant(prev, asstKey, (m) => ({
                ...m,
                workflow: [
                  ...(m.workflow ?? []),
                  {
                    id: tc.id,
                    name: tc.name,
                    arguments: tc.arguments,
                    pending: true,
                  },
                ],
              })),
            );
            continue;
          }
          if (evt.tool_result) {
            const tr = evt.tool_result;
            setMessages((prev) =>
              updateAssistant(prev, asstKey, (m) => ({
                ...m,
                workflow: (m.workflow ?? []).map((step) =>
                  step.id === tr.id
                    ? {
                        ...step,
                        pending: false,
                        resultSlugs: tr.result.slugs,
                        resultError: tr.result.error,
                      }
                    : step,
                ),
              })),
            );
            continue;
          }
          if (typeof evt.thinking === "string") {
            const t2 = evt.thinking;
            setMessages((prev) =>
              updateAssistant(prev, asstKey, (m) => ({
                ...m,
                thinking: (m.thinking ?? "") + t2,
              })),
            );
            continue;
          }
          if (typeof evt.delta === "string") {
            const d = evt.delta;
            setMessages((prev) =>
              updateAssistant(prev, asstKey, (m) => ({
                ...m,
                content: m.content + d,
              })),
            );
          }
        }
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
        labelError(`${t("floats.errorPrefix")}${(err as Error).message}`);
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [lang, loading, pendingImages, t],
  );

  const clearHistory = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setPendingImages([]);
    setSenderValue("");
    setLoading(false);
    try {
      window.localStorage.removeItem(historyKey());
    } catch {
      // ignore
    }
  }, []);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const drawerWidth = screens.md ? 520 : "100%";

  const bubbleItems = messages.map((m) => {
    if (m.role === "user") {
      return {
        key: m.key,
        role: "user" as const,
        content: m,
      };
    }
    const assistant = m;
    const isStreaming = loading && assistant === messages[messages.length - 1];
    return {
      key: assistant.key,
      role: "assistant" as const,
      content: assistant,
      loading:
        isStreaming &&
        assistant.content === "" &&
        !assistant.thinking &&
        (assistant.workflow?.length ?? 0) === 0,
    };
  });

  const senderHeader =
    pendingImages.length > 0 ? (
      <Sender.Header
        title={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            <PaperClipOutlined style={{ marginRight: 6 }} />
            {t("floats.attachImage")} · {pendingImages.length}/{MAX_IMAGES}
          </Typography.Text>
        }
      >
        <Space size={8} wrap>
          {pendingImages.map((url, idx) => (
            <PendingThumb
              key={idx}
              url={url}
              removeLabel={t("floats.removeImage")}
              onRemove={() => removePendingImage(idx)}
            />
          ))}
        </Space>
      </Sender.Header>
    ) : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={drawerWidth}
      destroyOnClose
      title={
        <Space>
          <RobotOutlined style={{ color: "#1677ff" }} />
          {t("floats.askTitle")}
        </Space>
      }
      extra={
        messages.length > 0 ? (
          <Tooltip title={t("floats.clearHistory")}>
            <Button
              type="text"
              size="small"
              icon={<ClearOutlined />}
              onClick={clearHistory}
            >
              {t("floats.clearHistory")}
            </Button>
          </Tooltip>
        ) : null
      }
      styles={{ body: { display: "flex", flexDirection: "column", padding: 16 } }}
    >
      <Alert
        type="info"
        showIcon
        message={t("floats.askDisclaimer")}
        style={{ marginBottom: 12 }}
      />

      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
        >
        {messages.length === 0 ? (
          <div style={{ padding: "24px 4px", textAlign: "center" }}>
            <RobotOutlined
              style={{ fontSize: 44, color: "#1677ff", marginBottom: 12 }}
            />
            <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 6 }}>
              {t("floats.welcomeTitle")}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 10 }}>
              {t("floats.welcomeDesc")}
            </Typography.Paragraph>
            <Typography.Paragraph
              type="secondary"
              style={{ fontSize: 12, marginBottom: 18 }}
            >
              <PaperClipOutlined style={{ marginRight: 4 }} />
              {t("floats.attachHint")}
            </Typography.Paragraph>
            <Prompts
              items={samplePrompts}
              styles={{
                list: { flexDirection: "column", gap: 8 },
                item: { width: "100%" },
              }}
              onItemClick={(info) => {
                const text =
                  typeof info.data.label === "string" ? info.data.label : "";
                if (text) void send(text);
              }}
            />
          </div>
        ) : (
          <Bubble.List
            autoScroll
            roles={{
              user: {
                placement: "end",
                variant: "filled",
                messageRender: (raw) => {
                  const m = raw as unknown as UserMessage;
                  return <UserBody message={m} />;
                },
              },
              assistant: {
                placement: "start",
                variant: "outlined",
                messageRender: (raw) => {
                  const m = raw as unknown as AssistantMessage;
                  return (
                    <AssistantBody
                      message={m}
                      onSlugClick={handleSlugClick}
                      labels={{
                        workflowTitle: t("floats.workflowTitle"),
                        searchPrefix: t("floats.searchPrefix"),
                        foundPrefix: t("floats.foundPrefix"),
                        retrievedDocs: t("floats.retrievedDocs"),
                        thinkingTitle: t("floats.thinkingTitle"),
                        thinkingHint: t("floats.thinkingHint"),
                        emptyAnswer: t("floats.emptyAnswer"),
                      }}
                    />
                  );
                },
              },
            }}
            items={bubbleItems}
          />
        )}
        </div>
        {!atBottom && messages.length > 0 && (
          <Tooltip title={t("floats.scrollToBottom")} placement="left">
            <Button
              type="default"
              shape="circle"
              size="small"
              icon={<ArrowDownOutlined />}
              onClick={() => scrollListToBottom("smooth")}
              style={{
                position: "absolute",
                right: 16,
                bottom: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                zIndex: 10,
              }}
              aria-label={t("floats.scrollToBottom")}
            />
          </Tooltip>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <Sender
          value={senderValue}
          onChange={(v) => setSenderValue(v)}
          loading={loading}
          onSubmit={(v) => void send(v)}
          onCancel={stop}
          placeholder={t("floats.askPlaceholder")}
          autoSize={{ minRows: 1, maxRows: 4 }}
          header={senderHeader}
          prefix={
            <Upload
              accept="image/*"
              multiple
              showUploadList={false}
              beforeUpload={(file) => {
                void ingestImageFile(file);
                return false;
              }}
            >
              <Tooltip title={t("floats.attachImage")}>
                <Button
                  type="text"
                  icon={<PaperClipOutlined />}
                  disabled={pendingImages.length >= MAX_IMAGES}
                />
              </Tooltip>
            </Upload>
          }
          onPasteFile={(_first, files) => {
            for (const f of Array.from(files)) {
              if (f.type.startsWith("image/")) {
                void ingestImageFile(f);
              }
            }
          }}
        />
        {/* Footer disclaimer — small centered note under the input so it's
            visible but doesn't compete with content. Matches the "AI 生成内容
            可能不准确" line ChatGPT puts under its composer. */}
        <Typography.Text
          type="secondary"
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 11,
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          {t("floats.poweredBy")}
        </Typography.Text>
      </div>
    </Drawer>
  );
}

interface PendingThumbProps {
  url: string;
  removeLabel: string;
  onRemove: () => void;
}

// PendingThumb renders one yet-to-send image with an overlay close button.
// Sized for the Sender.Header strip — not a full preview surface.
function PendingThumb({ url, removeLabel, onRemove }: PendingThumbProps) {
  return (
    <div
      style={{
        position: "relative",
        width: 56,
        height: 56,
        borderRadius: 6,
        overflow: "hidden",
        border: "1px solid #e8e8e8",
        background: "#fafafa",
      }}
    >
      <img
        src={url}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <Tooltip title={removeLabel}>
        <button
          type="button"
          onClick={onRemove}
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            lineHeight: 1,
          }}
          aria-label={removeLabel}
        >
          <CloseCircleFilled
            style={{ fontSize: 16, color: "rgba(0,0,0,0.55)" }}
          />
        </button>
      </Tooltip>
    </div>
  );
}

function updateAssistant(
  prev: Message[],
  key: string,
  fn: (m: AssistantMessage) => AssistantMessage,
): Message[] {
  return prev.map((m) =>
    m.role === "assistant" && m.key === key ? fn(m) : m,
  );
}

interface UserBodyProps {
  message: UserMessage;
}

// UserBody renders a sent user message: its text plus a row of attached
// image thumbnails. Each thumbnail is wrapped in antd `Image` so clicking
// opens the full-size preview overlay.
function UserBody({ message }: UserBodyProps) {
  return (
    <div>
      {message.content && (
        <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
      )}
      {message.images && message.images.length > 0 && (
        <Space
          size={6}
          wrap
          style={{ marginTop: message.content ? 8 : 0 }}
        >
          <Image.PreviewGroup>
            {message.images.map((url, i) => (
              <Image
                key={i}
                src={url}
                width={80}
                height={80}
                style={{ objectFit: "cover", borderRadius: 4 }}
              />
            ))}
          </Image.PreviewGroup>
        </Space>
      )}
    </div>
  );
}

interface AssistantBodyProps {
  message: AssistantMessage;
  onSlugClick: (slug: string) => void;
  labels: {
    workflowTitle: string;
    searchPrefix: string;
    foundPrefix: string;
    retrievedDocs: string;
    thinkingTitle: string;
    thinkingHint: string;
    emptyAnswer: string;
  };
}

function AssistantBody({ message, onSlugClick, labels }: AssistantBodyProps) {
  const { workflow, docs, thinking, content, errored } = message;
  const hasWorkflow = (workflow?.length ?? 0) > 0;
  const hasDocs = (docs?.length ?? 0) > 0;
  const hasThinking = !!(thinking && thinking.trim().length > 0);
  const hasContent = content.length > 0;

  // Thinking panel UX:
  //   - default OPEN while the model is still thinking (no answer body yet)
  //   - auto-CLOSE as soon as the first answer delta arrives (per user request:
  //     "思考结束后自动收拢")
  //   - user can still manually toggle either way; we don't fight their click
  // Lazy init covers historical messages re-rendered with content already
  // present — they start collapsed instead of flashing open then closing.
  const [thinkingOpen, setThinkingOpen] = useState(() => !hasContent);
  const userTouchedRef = useRef(false);
  useEffect(() => {
    if (!userTouchedRef.current && hasContent) {
      setThinkingOpen(false);
    }
  }, [hasContent]);

  return (
    <div>
      {hasWorkflow && (
        <div style={{ marginBottom: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            <SearchOutlined style={{ marginRight: 4 }} />
            {labels.workflowTitle}
          </Typography.Text>
          <div style={{ marginTop: 6, paddingLeft: 4 }}>
            {workflow!.map((step) => (
              <WorkflowRow
                key={step.id}
                step={step}
                searchPrefix={labels.searchPrefix}
                foundPrefix={labels.foundPrefix}
                onSlugClick={onSlugClick}
              />
            ))}
          </div>
        </div>
      )}

      {hasDocs && !hasWorkflow && (
        <div style={{ marginBottom: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            <FileTextOutlined style={{ marginRight: 4 }} />
            {labels.retrievedDocs}
          </Typography.Text>
          <div style={{ marginTop: 4 }}>
            <Space size={[4, 4]} wrap>
              {docs!.map((slug) => (
                <Tag
                  key={slug}
                  color={hasSlug(slug) ? "blue" : "default"}
                  style={{ cursor: hasSlug(slug) ? "pointer" : "default" }}
                  onClick={() => hasSlug(slug) && onSlugClick(slug)}
                >
                  {slug}
                </Tag>
              ))}
            </Space>
          </div>
        </div>
      )}

      {hasThinking && (
        <Collapse
          size="small"
          ghost
          style={{ marginBottom: 4 }}
          activeKey={thinkingOpen ? ["thinking"] : []}
          onChange={(keys) => {
            userTouchedRef.current = true;
            const arr = Array.isArray(keys) ? keys : [keys];
            setThinkingOpen(arr.includes("thinking"));
          }}
          items={[
            {
              key: "thinking",
              label: (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {labels.thinkingTitle} {labels.thinkingHint}
                </Typography.Text>
              ),
              children: (
                <Typography.Paragraph
                  type="secondary"
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    margin: 0,
                    maxHeight: 240,
                    overflowY: "auto",
                  }}
                >
                  {thinking}
                </Typography.Paragraph>
              ),
            },
          ]}
        />
      )}

      {content ? (
        errored ? (
          <Alert type="error" showIcon message={content} />
        ) : (
          <MarkdownText content={content} />
        )
      ) : (
        !hasThinking && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            <LoadingOutlined style={{ marginRight: 4 }} />
            {labels.emptyAnswer}
          </Typography.Text>
        )
      )}
    </div>
  );
}

interface WorkflowRowProps {
  step: WorkflowStep;
  searchPrefix: string;
  foundPrefix: string;
  onSlugClick: (slug: string) => void;
}

function WorkflowRow({ step, searchPrefix, foundPrefix, onSlugClick }: WorkflowRowProps) {
  const argsSummary = useMemo(() => summariseArgs(step.arguments), [step.arguments]);
  return (
    <div style={{ marginBottom: 6, fontSize: 12, lineHeight: 1.5 }}>
      <Typography.Text style={{ fontSize: 12 }}>
        {step.pending ? (
          <LoadingOutlined style={{ marginRight: 6, color: "#1677ff" }} />
        ) : (
          <SearchOutlined style={{ marginRight: 6, color: "#52c41a" }} />
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {searchPrefix}
        </Typography.Text>{" "}
        <Typography.Text code style={{ fontSize: 12 }}>
          {argsSummary}
        </Typography.Text>
      </Typography.Text>
      {step.resultError && (
        <div style={{ marginTop: 2, paddingLeft: 20 }}>
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            <ExclamationCircleOutlined style={{ marginRight: 4 }} />
            {step.resultError}
          </Typography.Text>
        </div>
      )}
      {step.resultSlugs && step.resultSlugs.length > 0 && (
        <div style={{ marginTop: 2, paddingLeft: 20 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
            {foundPrefix}
          </Typography.Text>
          <Space size={[4, 4]} wrap>
            {step.resultSlugs.map((slug) => (
              <Tag
                key={slug}
                color={hasSlug(slug) ? "blue" : "default"}
                style={{
                  cursor: hasSlug(slug) ? "pointer" : "default",
                  margin: 0,
                }}
                onClick={() => hasSlug(slug) && onSlugClick(slug)}
              >
                {slug}
              </Tag>
            ))}
          </Space>
        </div>
      )}
    </div>
  );
}

function summariseArgs(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "search_docs()";
  try {
    const obj = JSON.parse(trimmed) as { keywords?: string[]; slugs?: string[] };
    const parts: string[] = [];
    if (obj.keywords && obj.keywords.length > 0) {
      parts.push(`keywords=[${obj.keywords.join(", ")}]`);
    }
    if (obj.slugs && obj.slugs.length > 0) {
      parts.push(`slugs=[${obj.slugs.join(", ")}]`);
    }
    return parts.length > 0 ? parts.join(" ") : "search_docs()";
  } catch {
    return trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
  }
}
