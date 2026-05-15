import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  api,
  type AliasRow,
  type ModelRow,
  type ProviderInfo,
} from "../api/client";

export function Models() {
  const { t } = useTranslation("models");
  const [modal, modalCtx] = Modal.useModal();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [active, setActive] = useState<string>("mimo");
  const [models, setModels] = useState<ModelRow[]>([]);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newModel, setNewModel] = useState({ upstream_id: "", display_name: "" });
  const [newAlias, setNewAlias] = useState({ alias: "", upstream_id: "" });

  async function load() {
    try {
      setError(null);
      const [p, m, a] = await Promise.all([
        api.providers(),
        api.modelsFor(active),
        api.aliases(),
      ]);
      setProviders(p.providers);
      setModels(m.models);
      setAliases(a.aliases);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function addModel() {
    if (!newModel.upstream_id) return;
    try {
      await api.createModel(active, newModel);
      setNewModel({ upstream_id: "", display_name: "" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function removeModel(row: ModelRow) {
    modal.confirm({
      title: t("deleteConfirm"),
      icon: <DeleteOutlined />,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.deleteModel(row.id);
          await load();
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });
  }

  async function addAlias() {
    if (!newAlias.alias || !newAlias.upstream_id) return;
    try {
      await api.upsertAlias({
        alias: newAlias.alias,
        provider_id: active,
        upstream_id: newAlias.upstream_id,
      });
      setNewAlias({ alias: "", upstream_id: "" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function removeAlias(alias: string) {
    modal.confirm({
      title: t("alias.deleteConfirm", { alias }),
      icon: <DeleteOutlined />,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.deleteAlias(alias);
          await load();
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });
  }

  const aliasesForActive = useMemo(
    () => aliases.filter((a) => a.provider_id === active),
    [aliases, active]
  );

  const modelColumns: ColumnsType<ModelRow> = useMemo(
    () => [
      {
        title: t("list.columns.upstreamId"),
        dataIndex: "upstream_id",
        key: "upstream_id",
        render: (v: string) => <code>{v}</code>,
      },
      {
        title: t("list.columns.displayName"),
        dataIndex: "display_name",
        key: "display_name",
        render: (v: string | null) => v ?? "—",
      },
      {
        title: t("list.columns.capabilities"),
        key: "capabilities",
        render: (_, m) => (
          <Space size={4} wrap>
            {m.supports_images ? <Tag>{t("list.capability.vision")}</Tag> : null}
            {m.supports_reasoning ? (
              <Tag>{t("list.capability.reasoning")}</Tag>
            ) : null}
            {m.supports_web_search ? (
              <Tag>{t("list.capability.webSearch")}</Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: t("list.columns.context"),
        dataIndex: "context_window",
        key: "context_window",
        render: (v: number | null) => v?.toLocaleString() ?? "—",
      },
      {
        title: t("list.columns.source"),
        dataIndex: "is_builtin",
        key: "is_builtin",
        render: (v: number) =>
          v ? (
            <Tag>{t("list.source.builtin")}</Tag>
          ) : (
            <Tag color="success">{t("list.source.custom")}</Tag>
          ),
      },
      {
        title: t("list.columns.deprecated"),
        dataIndex: "deprecated_after",
        key: "deprecated_after",
        render: (v: string | null) =>
          v ? <Tag color="warning">{v}</Tag> : "—",
      },
      {
        title: t("list.columns.ops"),
        key: "ops",
        align: "right",
        render: (_, m) =>
          m.is_builtin ? (
            <Tag>{t("list.readonly")}</Tag>
          ) : (
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeModel(m)}
            >
              {t("list.columns.ops")}
            </Button>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const aliasColumns: ColumnsType<AliasRow> = useMemo(
    () => [
      {
        title: t("alias.columns.alias"),
        dataIndex: "alias",
        key: "alias",
        render: (v: string) => <code>{v}</code>,
      },
      {
        title: t("alias.columns.mapTo"),
        dataIndex: "upstream_id",
        key: "upstream_id",
        render: (v: string) => <code>{v}</code>,
      },
      {
        key: "ops",
        align: "right",
        render: (_, a) => (
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeAlias(a.alias)}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  return (
    <>
      {modalCtx}
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {t("title")}
      </Typography.Title>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card style={{ marginBottom: 16 }}>
        <Segmented<string>
          value={active}
          onChange={setActive}
          options={providers.map((p) => ({
            value: p.id,
            label: (
              <Space>
                {p.display_name}
                <Tag color={p.enabled ? "success" : "default"}>
                  {p.enabled
                    ? t("providerStatus.enabled")
                    : t("providerStatus.missingKey")}
                </Tag>
              </Space>
            ),
          }))}
        />
      </Card>

      <Card title={t("list.title")} style={{ marginBottom: 16 }}>
        <Table<ModelRow>
          rowKey="id"
          dataSource={models}
          columns={modelColumns}
          pagination={false}
          size="middle"
        />
      </Card>

      <Card title={t("create.title")} style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: "100%" }}>
          <Input
            placeholder={t("create.upstreamPlaceholder")}
            value={newModel.upstream_id}
            onChange={(e) =>
              setNewModel({ ...newModel, upstream_id: e.target.value })
            }
            style={{ width: 280 }}
          />
          <Input
            placeholder={t("create.displayNamePlaceholder")}
            value={newModel.display_name}
            onChange={(e) =>
              setNewModel({ ...newModel, display_name: e.target.value })
            }
            style={{ width: 220 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => void addModel()}
            disabled={!newModel.upstream_id}
          >
            {t("create.submit")}
          </Button>
        </Space>
      </Card>

      <Card title={t("alias.title")}>
        <Table<AliasRow>
          rowKey="alias"
          dataSource={aliasesForActive}
          columns={aliasColumns}
          pagination={false}
          size="middle"
          locale={{ emptyText: t("alias.empty") }}
        />
        <Form layout="inline" style={{ marginTop: 12 }} onFinish={() => void addAlias()}>
          <Form.Item>
            <Input
              placeholder={t("alias.namePlaceholder")}
              value={newAlias.alias}
              onChange={(e) => setNewAlias({ ...newAlias, alias: e.target.value })}
              style={{ width: 240 }}
            />
          </Form.Item>
          <Form.Item>
            <Select
              placeholder={t("alias.upstreamPlaceholder")}
              value={newAlias.upstream_id || undefined}
              onChange={(v) => setNewAlias({ ...newAlias, upstream_id: v })}
              style={{ width: 260 }}
              options={models.map((m) => ({
                value: m.upstream_id,
                label: m.upstream_id,
              }))}
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<PlusOutlined />}
              disabled={!newAlias.alias || !newAlias.upstream_id}
            >
              {t("alias.submit")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
