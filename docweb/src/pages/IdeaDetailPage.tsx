import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Button, Card, Result, Skeleton, Space, Tag, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import { ApiError, getIdea, type PublicIdea } from "../api/client";
import CommentSection from "../components/CommentSection";
import MarkdownText from "../components/MarkdownText";

// IdeaDetailPage renders the full body of a single idea (as markdown) and
// hosts the comment thread inline. v3 of the UI uses this as the only place
// comments are visible — the list page no longer expands them inline.
export default function IdeaDetailPage() {
  const { t } = useTranslation("ideas");
  const params = useParams<{ id: string }>();
  const id = Number(params.id ?? 0);

  const [idea, setIdea] = useState<PublicIdea | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id || Number.isNaN(id)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setErrorMsg(null);
    (async () => {
      try {
        const res = await getIdea(id);
        if (!cancelled) setIdea(res);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          setNotFound(true);
        } else {
          setErrorMsg(t("detail.loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  return (
    <div style={{ padding: "32px 24px 80px", maxWidth: 880, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/ideas">
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>
            {t("detail.back")}
          </Button>
        </Link>
      </div>

      {loading && (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      )}

      {!loading && notFound && (
        <Result
          status="404"
          title="404"
          subTitle={t("detail.notFound")}
          extra={
            <Link to="/ideas">
              <Button type="primary">{t("detail.back")}</Button>
            </Link>
          }
        />
      )}

      {!loading && !notFound && errorMsg && (
        <Alert type="warning" showIcon message={errorMsg} />
      )}

      {!loading && !notFound && idea && (
        <>
          <Card style={{ marginBottom: 24 }}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Space align="center" wrap>
                <Typography.Title level={2} style={{ margin: 0 }}>
                  {idea.title}
                </Typography.Title>
                {idea.background && <Tag color="geekblue">{idea.background}</Tag>}
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t("detail.submittedAt")} · {new Date(idea.createdAt).toLocaleString()}
              </Typography.Text>
              <MarkdownText content={idea.body} />
            </Space>
          </Card>

          <Card title={t("comments.label_other", { count: idea.commentCount })}>
            <CommentSection ideaId={idea.id} initialCount={idea.commentCount} />
          </Card>
        </>
      )}
    </div>
  );
}
