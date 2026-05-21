import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Form,
  Input,
  List,
  Space,
  Tag,
  Typography,
} from "antd";
import { UserOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  listComments,
  submitComment,
  type PublicComment,
} from "../api/client";

interface CommentSectionProps {
  ideaId: number;
  initialCount: number;
  onCountChanged?: (next: number) => void;
}

const PAGE_SIZE = 20;

// CommentSection is the expandable comment thread under each public idea card.
// Nickname input was removed in v2 — identity is the per-browser clientId
// stored in localStorage and shipped via X-Client-Id. The backend uses it for
// moderation and flags rows you posted with `mine: true` so the UI can mark
// them — but other users only see uniform "匿名 / Anonymous" labels.
export default function CommentSection({
  ideaId,
  initialCount,
  onCountChanged,
}: CommentSectionProps) {
  const { t } = useTranslation("ideas");

  const [items, setItems] = useState<PublicComment[]>([]);
  const [total, setTotal] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [form] = Form.useForm<{ body: string }>();

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await listComments(ideaId, p, PAGE_SIZE);
        setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(p);
      } catch {
        setLoadError(t("comments.loadError"));
      } finally {
        setLoading(false);
      }
    },
    [ideaId, t],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  async function onSubmit() {
    const values = await form.validateFields();
    const body = (values.body ?? "").trim();
    if (!body) {
      setPostError(t("comments.validationError"));
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      const res = await submitComment(ideaId, { body });
      const created: PublicComment = {
        id: res.id,
        createdAt: new Date().toISOString(),
        body,
        mine: true,
      };
      setItems((prev) => [...prev, created]);
      const nextTotal = total + 1;
      setTotal(nextTotal);
      onCountChanged?.(nextTotal);
      form.resetFields(["body"]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setPostError(t("comments.rateLimited"));
      } else if (err instanceof ApiError && err.status === 400) {
        setPostError(t("comments.validationError"));
      } else {
        setPostError((err as Error).message);
      }
    } finally {
      setPosting(false);
    }
  }

  const canLoadMore = items.length < total;
  const hasItems = items.length > 0;

  return (
    <div style={{ paddingTop: 12 }}>
      {loadError && (
        <Alert
          type="warning"
          message={loadError}
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}

      {hasItems && (
        <List
          itemLayout="horizontal"
          dataSource={items}
          renderItem={(c) => (
            <List.Item key={c.id} style={{ paddingLeft: 0, paddingRight: 0 }}>
              <List.Item.Meta
                avatar={
                  <Avatar
                    style={{
                      backgroundColor: c.mine ? "#1677ff" : "#bfbfbf",
                    }}
                    icon={<UserOutlined />}
                  />
                }
                title={
                  <Space size={8}>
                    <Typography.Text strong>{t("list.anonymous")}</Typography.Text>
                    {c.mine && (
                      <Tag color="blue" style={{ marginInlineStart: 0 }}>
                        {t("comments.mine")}
                      </Tag>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(c.createdAt).toLocaleString()}
                    </Typography.Text>
                  </Space>
                }
                description={
                  <Typography.Paragraph
                    style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
                  >
                    {c.body}
                  </Typography.Paragraph>
                }
              />
            </List.Item>
          )}
        />
      )}

      {canLoadMore && (
        <Button
          type="link"
          loading={loading}
          onClick={() => void fetchPage(page + 1)}
          style={{ paddingLeft: 0 }}
        >
          {t("list.loadMore")}
        </Button>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f0f0" }}
      >
        <Form.Item
          name="body"
          rules={[{ required: true, message: t("comments.validationError") }]}
        >
          <Input.TextArea
            rows={3}
            placeholder={t("comments.bodyPlaceholder")}
            maxLength={1000}
            showCount
          />
        </Form.Item>
        {postError && (
          <Alert
            type="error"
            message={postError}
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}
        <Button type="primary" htmlType="submit" loading={posting}>
          {posting ? t("comments.sending") : t("comments.send")}
        </Button>
      </Form>
    </div>
  );
}
