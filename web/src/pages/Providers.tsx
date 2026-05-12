import { useEffect, useMemo, useState } from "react";
import {
  api,
  type GenericProviderModelSpec,
  type GenericProviderSpec,
  type GenericProvidersResponse,
} from "../api/client";

// Built-in provider ids — the user cannot create generics with these.
const RESERVED_IDS = new Set(["mimo", "deepseek"]);

type FormState = GenericProviderSpec & {
  // wireApi is optional in the wire type, but we always render a value
  wireApiDisplay: "chat" | "responses";
};

function emptyForm(): FormState {
  return {
    id: "",
    shortcut: "",
    displayName: "",
    baseUrl: "",
    envKey: "",
    defaultModel: "",
    wireApi: "chat",
    wireApiDisplay: "chat",
    models: [],
    features: { forceParallelToolCalls: false, webSearch: false },
    docsUrl: "",
  };
}

function specToForm(spec: GenericProviderSpec): FormState {
  return {
    ...spec,
    shortcut: spec.shortcut ?? "",
    displayName: spec.displayName ?? "",
    wireApi: spec.wireApi ?? "chat",
    wireApiDisplay: spec.wireApi ?? "chat",
    models: spec.models ? spec.models.map((m) => ({ ...m })) : [],
    features: {
      forceParallelToolCalls: !!spec.features?.forceParallelToolCalls,
      webSearch: !!spec.features?.webSearch,
    },
    docsUrl: spec.docsUrl ?? "",
  };
}

// Strip empty optional fields so the persisted JSON stays tidy.
function formToSpec(form: FormState): GenericProviderSpec {
  const out: GenericProviderSpec = {
    id: form.id.trim(),
    baseUrl: form.baseUrl.trim(),
    envKey: form.envKey.trim(),
    defaultModel: form.defaultModel.trim(),
  };
  if (form.shortcut?.trim()) out.shortcut = form.shortcut.trim();
  if (form.displayName?.trim()) out.displayName = form.displayName.trim();
  if (form.wireApiDisplay === "responses") out.wireApi = "responses";
  const models = (form.models ?? [])
    .map((m) => ({ ...m, id: m.id.trim() }))
    .filter((m) => m.id);
  if (models.length > 0) out.models = models;
  const features: Record<string, boolean> = {};
  if (form.features?.forceParallelToolCalls) features.forceParallelToolCalls = true;
  if (form.features?.webSearch) features.webSearch = true;
  if (Object.keys(features).length > 0) out.features = features;
  if (form.docsUrl?.trim()) out.docsUrl = form.docsUrl.trim();
  return out;
}

function validateForm(form: FormState, allSpecs: GenericProviderSpec[], originalId: string | null):
  | { ok: true }
  | { ok: false; error: string } {
  const id = form.id.trim();
  if (!id) return { ok: false, error: "id 不能为空" };
  if (RESERVED_IDS.has(id))
    return { ok: false, error: `id "${id}" 与内置 provider 冲突，请改用其他 id` };
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id))
    return {
      ok: false,
      error: `id "${id}" 必须以字母数字开头，只允许字母数字 / - / _，不能含空格`,
    };
  for (const other of allSpecs) {
    if (other.id === id && other.id !== originalId) {
      return { ok: false, error: `已存在 id "${id}" 的 provider，请改用其他 id` };
    }
  }
  if (!form.baseUrl.trim()) return { ok: false, error: "baseUrl 不能为空" };
  if (!form.envKey.trim()) return { ok: false, error: "envKey 不能为空" };
  if (!form.defaultModel.trim()) return { ok: false, error: "defaultModel 不能为空" };
  return { ok: true };
}

export function Providers() {
  const [data, setData] = useState<GenericProvidersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<
    | { mode: "create"; form: FormState }
    | { mode: "edit"; originalId: string; form: FormState }
    | null
  >(null);
  const [rawEditor, setRawEditor] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const resp = await api.genericProviders();
      setData(resp);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(updated: GenericProviderSpec[]) {
    try {
      setError(null);
      setSuccess(null);
      const resp = await api.saveGenericProviders(updated);
      setSuccess(
        resp.restartRequired
          ? `已保存到 ${resp.path} — 重启 mimo2codex 让配置生效`
          : `已保存到 ${resp.path}`
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startCreate() {
    setEditing({ mode: "create", form: emptyForm() });
  }
  function startEdit(spec: GenericProviderSpec) {
    setEditing({ mode: "edit", originalId: spec.id, form: specToForm(spec) });
  }
  function cancelEdit() {
    setEditing(null);
  }

  async function commitForm() {
    if (!editing || !data) return;
    const validation = validateForm(
      editing.form,
      data.specs,
      editing.mode === "edit" ? editing.originalId : null
    );
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    const next = formToSpec(editing.form);
    const merged =
      editing.mode === "create"
        ? [...data.specs, next]
        : data.specs.map((s) => (s.id === editing.originalId ? next : s));
    setEditing(null);
    await save(merged);
  }

  async function remove(id: string) {
    if (!data) return;
    if (!confirm(`删除 provider "${id}"？`)) return;
    await save(data.specs.filter((s) => s.id !== id));
  }

  async function commitRawJson() {
    if (rawEditor == null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawEditor);
    } catch (err) {
      setError(`JSON 解析失败：${(err as Error).message}`);
      return;
    }
    if (typeof parsed !== "object" || parsed === null) {
      setError("JSON 必须是对象");
      return;
    }
    const obj = parsed as { providers?: unknown };
    if (!Array.isArray(obj.providers)) {
      setError("JSON 顶层必须包含 providers 数组");
      return;
    }
    setRawEditor(null);
    await save(obj.providers as GenericProviderSpec[]);
  }

  return (
    <div>
      <h2>通用 Provider</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
        在这里管理 <code>providers.json</code> 里的通用 OpenAI 兼容 / Responses 直透 provider。
        修改后需要 <strong>重启 mimo2codex</strong> 让运行时 registry 加载新配置。
        详细字段说明见{" "}
        <a href="https://github.com/7as0nch/mimo2codex/blob/main/doc/generic-providers.zh.md" target="_blank" rel="noreferrer">
          generic-providers 文档
        </a>
        。
      </p>

      {error && (
        <div className="banner err">
          <span className="ic">!</span>
          <div className="body">{error}</div>
        </div>
      )}
      {success && (
        <div className="banner warn">
          <span className="ic">⟳</span>
          <div className="body">{success}</div>
        </div>
      )}

      {data && (
        <>
          <div className="banner info">
            <span className="ic">i</span>
            <div className="body">
              <div>
                <strong>文件位置：</strong>
                <code>{data.path ?? "(unavailable)"}</code>{" "}
                {data.source === "explicit" && (
                  <span className="tag">通过 MIMO2CODEX_PROVIDERS_FILE 指定</span>
                )}
                {!data.exists && data.path && (
                  <span className="tag warn">尚未创建——保存后自动新建</span>
                )}
                {!data.editable && (
                  <span className="tag err">不可编辑：{data.notice}</span>
                )}
              </div>
              {data.error && (
                <div style={{ marginTop: 8, color: "var(--err)" }}>
                  当前文件有问题：{data.error}（仍可在 UI 里重写覆盖）
                </div>
              )}
            </div>
          </div>

          <div className="row" style={{ marginBottom: 12 }}>
            <button onClick={startCreate} disabled={!data.editable}>
              + 添加 Provider
            </button>
            <button
              className="secondary"
              onClick={() =>
                setRawEditor(JSON.stringify({ providers: data.specs }, null, 2))
              }
              disabled={!data.editable}
            >
              编辑原始 JSON
            </button>
            <button className="secondary" onClick={() => void load()}>
              刷新
            </button>
          </div>

          {data.specs.length === 0 ? (
            <div className="empty">
              还没有通用 provider。点击「+ 添加 Provider」开始。
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>显示名</th>
                  <th>baseUrl</th>
                  <th>默认模型</th>
                  <th>wireApi</th>
                  <th>声明模型</th>
                  <th style={{ textAlign: "right" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.specs.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong className="mono">{s.id}</strong>
                      {s.shortcut && s.shortcut !== s.id && (
                        <>
                          {" "}
                          <span className="tag muted">短码 {s.shortcut}</span>
                        </>
                      )}
                    </td>
                    <td>{s.displayName ?? s.id}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {s.baseUrl}
                    </td>
                    <td className="mono">{s.defaultModel}</td>
                    <td>
                      <span className={`tag ${s.wireApi === "responses" ? "ok" : "muted"}`}>
                        {s.wireApi ?? "chat"}
                      </span>
                    </td>
                    <td>
                      {s.models && s.models.length > 0 ? (
                        <span className="tag">{s.models.length} 个</span>
                      ) : (
                        <span className="tag muted">任意透传</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="secondary"
                        onClick={() => startEdit(s)}
                        disabled={!data.editable}
                      >
                        编辑
                      </button>{" "}
                      <button
                        className="danger"
                        onClick={() => void remove(s.id)}
                        disabled={!data.editable}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {editing && (
        <FormModal
          mode={editing.mode}
          form={editing.form}
          setForm={(form) => setEditing({ ...editing, form } as typeof editing)}
          onCancel={cancelEdit}
          onSubmit={() => void commitForm()}
        />
      )}

      {rawEditor != null && (
        <RawJsonModal
          value={rawEditor}
          setValue={setRawEditor}
          onCancel={() => setRawEditor(null)}
          onSubmit={() => void commitRawJson()}
        />
      )}
    </div>
  );
}

function FormModal({
  mode,
  form,
  setForm,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  form: FormState;
  setForm: (f: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm({ ...form, [key]: value });
  }
  function updateModel(idx: number, patch: Partial<GenericProviderModelSpec>) {
    const next = (form.models ?? []).map((m, i) => (i === idx ? { ...m, ...patch } : m));
    update("models", next);
  }
  function addModel() {
    update("models", [...(form.models ?? []), { id: "" }]);
  }
  function removeModel(idx: number) {
    update(
      "models",
      (form.models ?? []).filter((_, i) => i !== idx)
    );
  }

  return (
    <ModalShell
      title={mode === "create" ? "添加 Provider" : `编辑 ${form.id || "Provider"}`}
      onCancel={onCancel}
      footer={<ModalFooter onCancel={onCancel} onSubmit={onSubmit} submitLabel="保存" />}
    >
      <FormField label="ID" required>
        <input
          value={form.id}
          onChange={(e) => update("id", e.target.value)}
          placeholder="qwen / kimi / my-vllm"
          disabled={mode === "edit"}
        />
        <div className="hint">仅字母数字 / - / _，不能与内置 mimo / deepseek 冲突</div>
      </FormField>

      <FormField label="显示名">
        <input
          value={form.displayName ?? ""}
          onChange={(e) => update("displayName", e.target.value)}
          placeholder="留空则用 id"
        />
      </FormField>

      <FormField label="shortcut">
        <input
          value={form.shortcut ?? ""}
          onChange={(e) => update("shortcut", e.target.value)}
          placeholder="留空则用 id"
        />
        <div className="hint">
          CLI 启动时用 <code>--model &lt;shortcut&gt;</code> 切换默认 provider
        </div>
      </FormField>

      <FormField label="baseUrl" required>
        <input
          value={form.baseUrl}
          onChange={(e) => update("baseUrl", e.target.value)}
          placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
        />
        <div className="hint">
          上游 base URL；<strong>不要</strong>带 <code>/chat/completions</code> 后缀
        </div>
      </FormField>

      <FormField label="envKey" required>
        <input
          value={form.envKey}
          onChange={(e) => update("envKey", e.target.value)}
          placeholder="QWEN_API_KEY"
        />
        <div className="hint">从哪个环境变量读取 API key</div>
      </FormField>

      <FormField label="defaultModel" required>
        <input
          value={form.defaultModel}
          onChange={(e) => update("defaultModel", e.target.value)}
          placeholder="qwen3-max"
        />
      </FormField>

      <FormField label="wireApi">
        <div className="form-options">
          <label
            className={`opt ${form.wireApiDisplay === "chat" ? "checked" : ""}`}
            onClick={() => update("wireApiDisplay", "chat")}
          >
            <input
              type="radio"
              name="wireApi"
              checked={form.wireApiDisplay === "chat"}
              onChange={() => update("wireApiDisplay", "chat")}
            />
            <div>
              <div className="opt-title">chat</div>
              <div className="opt-sub">默认 · 翻译为 Chat Completions</div>
            </div>
          </label>
          <label
            className={`opt ${form.wireApiDisplay === "responses" ? "checked" : ""}`}
            onClick={() => update("wireApiDisplay", "responses")}
          >
            <input
              type="radio"
              name="wireApi"
              checked={form.wireApiDisplay === "responses"}
              onChange={() => update("wireApiDisplay", "responses")}
            />
            <div>
              <div className="opt-title">responses</div>
              <div className="opt-sub">直透 · 不做协议翻译</div>
            </div>
          </label>
        </div>
      </FormField>

      <FormField label="features">
        <div className="form-options">
          <label
            className={`opt ${form.features?.forceParallelToolCalls ? "checked" : ""}`}
          >
            <input
              type="checkbox"
              checked={!!form.features?.forceParallelToolCalls}
              onChange={(e) =>
                update("features", {
                  ...form.features,
                  forceParallelToolCalls: e.target.checked,
                })
              }
            />
            <div>
              <div className="opt-title">forceParallelToolCalls</div>
              <div className="opt-sub">一回合多个工具调用，缓解 agentic 编程</div>
            </div>
          </label>
          <label className={`opt ${form.features?.webSearch ? "checked" : ""}`}>
            <input
              type="checkbox"
              checked={!!form.features?.webSearch}
              onChange={(e) =>
                update("features", {
                  ...form.features,
                  webSearch: e.target.checked,
                })
              }
            />
            <div>
              <div className="opt-title">webSearch</div>
              <div className="opt-sub">仅对支持 builtin web_search 的上游有意义</div>
            </div>
          </label>
        </div>
      </FormField>

      <FormField label="docsUrl">
        <input
          value={form.docsUrl ?? ""}
          onChange={(e) => update("docsUrl", e.target.value)}
          placeholder="https://..."
        />
        <div className="hint">可选——缺 key 错误提示里的获取链接</div>
      </FormField>

      <div className="form-section">
        <h4>声明模型（可选）</h4>
        <p className="section-hint">
          不填则<strong>任意透传</strong>——客户端发什么 model id 就转发什么。
          填了的话只有列在这里的 id（含别名）才会被 byClientModel 路由到此 provider；
          声明 contextWindow / maxOutputTokens 能让 <code>print-config</code> 输出正确的 toml 字段。
        </p>
        {(form.models ?? []).map((m, idx) => (
          <div key={idx} className="model-card">
            <div className="grid">
              <input
                placeholder="model id（必填，如 qwen3-max）"
                value={m.id}
                onChange={(e) => updateModel(idx, { id: e.target.value })}
              />
              <input
                type="number"
                placeholder="contextWindow"
                value={m.contextWindow ?? ""}
                onChange={(e) =>
                  updateModel(idx, {
                    contextWindow: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <input
                type="number"
                placeholder="maxOutputTokens"
                value={m.maxOutputTokens ?? ""}
                onChange={(e) =>
                  updateModel(idx, {
                    maxOutputTokens: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <button
                className="danger"
                onClick={() => removeModel(idx)}
                style={{ padding: "6px 10px" }}
              >
                删除
              </button>
            </div>
            <div className="meta">
              <label>
                <input
                  type="checkbox"
                  checked={!!m.supportsImages}
                  onChange={(e) => updateModel(idx, { supportsImages: e.target.checked })}
                />
                vision
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!m.supportsReasoning}
                  onChange={(e) => updateModel(idx, { supportsReasoning: e.target.checked })}
                />
                reasoning
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!m.supportsWebSearch}
                  onChange={(e) => updateModel(idx, { supportsWebSearch: e.target.checked })}
                />
                web search
              </label>
            </div>
          </div>
        ))}
        <button className="secondary" onClick={addModel}>
          + 添加模型
        </button>
      </div>
    </ModalShell>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="form-field">
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
    </div>
  );
}

function RawJsonModal({
  value,
  setValue,
  onCancel,
  onSubmit,
}: {
  value: string;
  setValue: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const valid = useMemo(() => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }, [value]);

  return (
    <ModalShell
      title="原始 JSON 编辑"
      onCancel={onCancel}
      footer={
        <ModalFooter
          onCancel={onCancel}
          onSubmit={onSubmit}
          submitLabel="保存"
          submitDisabled={!valid}
        />
      }
    >
      <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 0 }}>
        直接编辑 <code>providers.json</code> 全文。校验失败时保存按钮会禁用。
      </p>
      <textarea
        className="code"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          width: "100%",
          background: "var(--panel-2)",
          color: "var(--fg)",
          border: `1px solid ${valid ? "var(--border)" : "var(--err)"}`,
          borderRadius: 6,
          padding: 12,
        }}
      />
      <div
        style={{
          fontSize: 11,
          color: valid ? "var(--ok)" : "var(--err)",
          marginTop: 6,
        }}
      >
        {valid ? "✓ JSON 语法正确" : "✗ JSON 语法错误"}
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onCancel,
  children,
  footer,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function ModalFooter({
  onCancel,
  onSubmit,
  submitLabel,
  submitDisabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
}) {
  return (
    <>
      <button className="secondary" onClick={onCancel}>
        取消
      </button>
      <button onClick={onSubmit} disabled={submitDisabled}>
        {submitLabel}
      </button>
    </>
  );
}
