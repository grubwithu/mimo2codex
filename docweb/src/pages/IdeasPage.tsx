import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Badge,
  Card,
  Empty,
  List,
  Pagination,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  BulbOutlined,
  CommentOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  UserOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import { listIdeas, type PublicIdea } from "../api/client";

const PAGE_SIZE = 10;

// IdeasPage is the public board. v3 of the UI strips it down to a plain
// paginated list — submission moved to a float-triggered modal, and per-row
// comments moved to /ideas/:id detail pages. This page now exists solely to
// surface the existing public ideas in a scannable form.
export default function IdeasPage() {
  const { t } = useTranslation("ideas");

  const [items, setItems] = useState<PublicIdea[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await listIdeas(p, PAGE_SIZE);
        setItems(res.items);
        setTotal(res.total);
        setPage(p);
      } catch {
        setLoadError(t("list.loadError"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perks = useMemo(
    () => [
      { icon: <ToolOutlined />, key: "noCode" as const },
      { icon: <UserOutlined />, key: "anonymous" as const },
      { icon: <CheckCircleOutlined />, key: "build" as const },
      { icon: <TeamOutlined />, key: "cooperate" as const },
    ],
    [],
  );

  return (
    <div style={{ padding: "32px 24px 80px", maxWidth: 880, margin: "0 auto" }}>
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <Card
        variant="borderless"
        styles={{
          body: {
            background: "linear-gradient(135deg, #fff7e6 0%, #e6f4ff 100%)",
            borderRadius: 12,
            padding: 28,
          },
        }}
        style={{ marginBottom: 24 }}
      >
        <Space align="start" size={16}>
          <BulbOutlined style={{ fontSize: 32, color: "#faad14", marginTop: 4 }} />
          <div>
            <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 8 }}>
              {t("page.title")}
            </Typography.Title>
            <Typography.Paragraph style={{ fontSize: 15, marginBottom: 14 }}>
              {t("page.subtitle")}
            </Typography.Paragraph>
            <Space wrap>
              {perks.map((p) => (
                <Tag key={p.key} icon={p.icon} color="blue" style={{ padding: "3px 9px" }}>
                  {t(`page.perks.${p.key}`)}
                </Tag>
              ))}
            </Space>
          </div>
        </Space>
      </Card>

      {/* ─── List ─────────────────────────────────────────────────────── */}
      <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 16 }}>
        {t("list.heading")}
      </Typography.Title>

      {loadError && (
        <Alert
          type="warning"
          showIcon
          message={loadError}
          style={{ marginBottom: 16 }}
        />
      )}

      <Spin spinning={loading}>
        {items.length === 0 && !loading && !loadError ? (
          <Empty description={t("list.empty")} style={{ padding: "40px 0" }} />
        ) : (
          <List
            itemLayout="vertical"
            dataSource={items}
            split
            renderItem={(idea) => (
              <List.Item
                key={idea.id}
                style={{ padding: "16px 8px" }}
                extra={
                  <Badge
                    count={idea.commentCount}
                    showZero
                    overflowCount={999}
                    style={{ backgroundColor: "#1677ff" }}
                  >
                    <CommentOutlined style={{ fontSize: 18, color: "#8c8c8c" }} />
                  </Badge>
                }
              >
                <List.Item.Meta
                  title={
                    <Space size={8} wrap>
                      <Link to={`/ideas/${idea.id}`}>
                        <Typography.Text strong style={{ fontSize: 16 }}>
                          {idea.title}
                        </Typography.Text>
                      </Link>
                      {idea.background && (
                        <Tag color="geekblue" style={{ marginInlineStart: 0 }}>
                          {idea.background}
                        </Tag>
                      )}
                    </Space>
                  }
                  description={
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(idea.createdAt).toLocaleString()}
                    </Typography.Text>
                  }
                />
                <Link to={`/ideas/${idea.id}`} style={{ color: "inherit" }}>
                  <Typography.Paragraph
                    style={{
                      whiteSpace: "pre-wrap",
                      marginBottom: 0,
                      color: "rgba(0, 0, 0, 0.75)",
                    }}
                    ellipsis={{ rows: 2 }}
                  >
                    {idea.body}
                  </Typography.Paragraph>
                </Link>
              </List.Item>
            )}
          />
        )}
      </Spin>

      {total > PAGE_SIZE && (
        <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            showSizeChanger={false}
            onChange={(p) => {
              void fetchPage(p);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>
      )}
    </div>
  );
}
