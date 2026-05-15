import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  api,
  type CodexBackupPair,
  type CodexState,
  type CodexTarget,
  type CodexTargetsResponse,
} from "../api/client";

type Busy = null | {
  kind: "apply" | "override" | "restore" | "clear" | "delete-backup";
  key: string;
};

export function CodexEnable() {
  const { t } = useTranslation("codexEnable");
  const { t: tCommon } = useTranslation("common");
  const [modal, modalCtx] = Modal.useModal();
  const [state, setState] = useState<CodexState | null>(null);
  const [targetsResp, setTargetsResp] = useState<CodexTargetsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  async function load() {
    try {
      setError(null);
      const [s, ts] = await Promise.all([api.codexState(), api.codexTargets()]);
      setState(s);
      setTargetsResp(ts);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function rowKey(target: CodexTarget): string {
    return `${target.providerId}::${target.modelId}`;
  }

  async function doApply(target: CodexTarget) {
    setBusy({ kind: "apply", key: rowKey(target) });
    setError(null);
    setSuccess(null);
    try {
      const resp = await api.codexApply({
        providerId: target.providerId,
        modelId: target.modelId,
      });
      let note = "";
      if (resp.preserved) {
        note = t("msg.appliedPreserved", { ts: resp.backupTs });
      } else if (resp.authBackup || resp.tomlBackup) {
        note = t("msg.appliedBackedUp", { ts: resp.backupTs });
      }
      setSuccess(
        t("msg.applied", {
          provider: target.providerDisplayName,
          model: target.modelId,
          note,
        })
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function onApplyClick(target: CodexTarget) {
    if (state?.authJsonOwner === "external") {
      modal.confirm({
        width: 540,
        title: t("confirm.applyTitle"),
        okButtonProps: { danger: true },
        okText: t("confirm.applyConfirmBtn"),
        cancelText: tCommon("cancel"),
        content: (
          <div>
            <p>{t("confirm.applyP1")}</p>
            <p>{t("confirm.applyP2")}</p>
            <p>
              {t("confirm.applyTarget")}:{" "}
              <strong>{target.providerDisplayName}</strong> /{" "}
              <code>{target.modelId}</code>
            </p>
          </div>
        ),
        onOk: () => doApply(target),
      });
      return;
    }
    void doApply(target);
  }

  async function doOverride(target: CodexTarget) {
    setBusy({ kind: "override", key: rowKey(target) });
    setError(null);
    setSuccess(null);
    try {
      await api.setActiveOverride({
        providerId: target.providerId,
        modelId: target.modelId,
      });
      setSuccess(
        t("msg.overrideSet", {
          provider: target.providerDisplayName,
          model: target.modelId,
        })
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function doClearOverride() {
    setBusy({ kind: "clear", key: "" });
    setError(null);
    setSuccess(null);
    try {
      await api.clearActiveOverride();
      setSuccess(t("msg.overrideCleared"));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function onRestoreClick(b: CodexBackupPair) {
    const missing: string[] = [];
    if (!b.authBackup) missing.push(t("confirm.restoreMissingAuth"));
    if (!b.tomlBackup) missing.push(t("confirm.restoreMissingToml"));
    const detail =
      missing.length > 0
        ? `\n${t("confirm.restoreMissingPrefix")}${missing.join("; ")}.`
        : "";
    modal.confirm({
      title: t("confirm.restoreTitle", { ts: b.ts }),
      content: <div style={{ whiteSpace: "pre-wrap" }}>{t("confirm.restoreBody") + detail}</div>,
      okText: t("backup.restore"),
      cancelText: tCommon("cancel"),
      onOk: async () => {
        setBusy({ kind: "restore", key: String(b.ts) });
        setError(null);
        setSuccess(null);
        try {
          await api.codexRestore(b.ts);
          setSuccess(t("msg.restored", { ts: b.ts }));
          await load();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(null);
        }
      },
    });
  }

  function onDeleteBackupClick(b: CodexBackupPair) {
    const text = b.preserved
      ? t("confirm.deletePreserved")
      : t("confirm.deleteNormal", { ts: b.ts });
    modal.confirm({
      title: t("backup.delete"),
      content: <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>,
      okButtonProps: { danger: true },
      okText: t("backup.delete"),
      cancelText: tCommon("cancel"),
      onOk: async () => {
        setBusy({ kind: "delete-backup", key: String(b.ts) });
        setError(null);
        setSuccess(null);
        try {
          await api.deleteCodexBackup(b.ts, b.preserved);
          setSuccess(t("msg.backupDeleted", { ts: b.ts }));
          await load();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(null);
        }
      },
    });
  }

  const grouped = useMemo(() => {
    if (!targetsResp) return new Map<string, CodexTarget[]>();
    const m = new Map<string, CodexTarget[]>();
    for (const target of targetsResp.targets) {
      const arr = m.get(target.providerId) ?? [];
      arr.push(target);
      m.set(target.providerId, arr);
    }
    return m;
  }, [targetsResp]);

  return (
    <>
      {modalCtx}
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {t("title")}
      </Typography.Title>
      <Typography.Paragraph type="secondary">{t("intro")}</Typography.Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        description={
          <Space direction="vertical" size={6}>
            <Trans i18nKey="modesInfo.applyFile" ns="codexEnable">
              <strong>placeholder</strong>placeholder<strong>placeholder</strong>placeholder
            </Trans>
            <Trans i18nKey="modesInfo.runtimeOverride" ns="codexEnable">
              <strong>placeholder</strong>placeholder<strong>placeholder</strong>placeholder
            </Trans>
          </Space>
        }
        message={null}
      />

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
      {success && (
        <Alert
          type="success"
          showIcon
          message={success}
          closable
          onClose={() => setSuccess(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {state && <CurrentStateCard state={state} />}

      {state && (
        <Card title={t("targets.title")} style={{ marginBottom: 16 }}>
          {state.authJsonOwner === "external" && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={t("targets.externalWarn")}
            />
          )}
          {targetsResp && targetsResp.targets.length === 0 ? (
            <Typography.Text type="secondary">{t("targets.empty")}</Typography.Text>
          ) : (
            Array.from(grouped.entries()).map(([providerId, list]) => (
              <ProviderBlock
                key={providerId}
                providerDisplayName={list[0].providerDisplayName}
                targets={list}
                busy={busy}
                onApply={onApplyClick}
                onOverride={doOverride}
              />
            ))
          )}
        </Card>
      )}

      {state && (
        <RuntimeOverrideCard state={state} busy={busy} onClear={doClearOverride} />
      )}

      {state && (
        <BackupCard
          state={state}
          busy={busy}
          onRestore={onRestoreClick}
          onDelete={onDeleteBackupClick}
        />
      )}
    </>
  );
}

function CurrentStateCard({ state }: { state: CodexState }) {
  const { t } = useTranslation("codexEnable");
  const ownerTag =
    state.authJsonOwner === "mimo2codex" ? (
      <Tag color="success">{t("state.owner.mimo2codex")}</Tag>
    ) : state.authJsonOwner === "external" ? (
      <Tag color="warning">{t("state.owner.external")}</Tag>
    ) : (
      <Tag>{t("state.owner.missing")}</Tag>
    );
  const currentToml = parseConfigToml(state.configTomlText);

  return (
    <Card title={t("state.title")} style={{ marginBottom: 16 }}>
      <Descriptions
        column={1}
        bordered
        size="small"
        labelStyle={{ width: 160 }}
        items={[
          {
            key: "codexDir",
            label: t("state.codexDir"),
            children: <code>{state.codexDir}</code>,
          },
          {
            key: "auth",
            label: t("state.authJson"),
            children: (
              <Space>
                {ownerTag}
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  <code>{state.authPath}</code>
                </Typography.Text>
              </Space>
            ),
          },
          {
            key: "toml",
            label: t("state.configToml"),
            children: state.configTomlExists ? (
              <Space wrap>
                {currentToml.provider && (
                  <Tag>
                    {t("state.tomlProvider")}=<code>{currentToml.provider}</code>
                  </Tag>
                )}
                {currentToml.model && (
                  <Tag>
                    {t("state.tomlModel")}=<code>{currentToml.model}</code>
                  </Tag>
                )}
                {!currentToml.provider && !currentToml.model && (
                  <Tag>{t("state.tomlUnknown")}</Tag>
                )}
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  <code>{state.tomlPath}</code>
                </Typography.Text>
              </Space>
            ) : (
              <Tag>{t("state.owner.missing")}</Tag>
            ),
          },
          {
            key: "override",
            label: t("state.override"),
            children: state.activeOverride ? (
              <Tag color="success">
                <code>
                  {state.activeOverride.providerId} /{" "}
                  {state.activeOverride.modelId}
                </code>
              </Tag>
            ) : (
              <Tag>{t("state.overrideNone")}</Tag>
            ),
          },
        ]}
      />
    </Card>
  );
}

function ProviderBlock({
  providerDisplayName,
  targets,
  busy,
  onApply,
  onOverride,
}: {
  providerDisplayName: string;
  targets: CodexTarget[];
  busy: Busy;
  onApply: (t: CodexTarget) => void;
  onOverride: (t: CodexTarget) => Promise<void>;
}) {
  const { t } = useTranslation("codexEnable");
  const hasKey = targets[0]?.hasKey ?? false;

  const columns: ColumnsType<CodexTarget> = [
    {
      title: t("targets.columns.model"),
      key: "model",
      render: (_, row) => (
        <Space>
          <strong>
            <code>{row.modelId}</code>
          </strong>
          {row.displayName && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.displayName}
            </Typography.Text>
          )}
          {row.isCurrentOverride && (
            <Tag color="success">{t("targets.activeOverride")}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: t("targets.columns.source"),
      dataIndex: "source",
      key: "source",
      render: (v: CodexTarget["source"]) =>
        v === "builtin" ? (
          <Tag>{t("targets.source.builtin")}</Tag>
        ) : (
          <Tag color="success">{t("targets.source.custom")}</Tag>
        ),
    },
    {
      title: t("targets.columns.context"),
      dataIndex: "contextWindow",
      key: "contextWindow",
      render: (v: number | null) => (v ? v.toLocaleString() : "—"),
    },
    {
      title: t("targets.columns.ops"),
      key: "ops",
      align: "right",
      width: 320,
      render: (_, row) => {
        const key = `${row.providerId}::${row.modelId}`;
        const applyBusy = busy?.kind === "apply" && busy.key === key;
        const overrideBusy = busy?.kind === "override" && busy.key === key;
        return (
          <Space>
            <Button
              type="primary"
              onClick={() => onApply(row)}
              loading={applyBusy}
              disabled={!!busy && !applyBusy}
              title={t("targets.applyTitle")}
            >
              {applyBusy ? t("targets.applyBusy") : t("targets.applyBtn")}
            </Button>
            <Button
              onClick={() => void onOverride(row)}
              loading={overrideBusy}
              disabled={(!!busy && !overrideBusy) || !hasKey}
              title={
                hasKey
                  ? t("targets.overrideTitle")
                  : t("targets.overrideDisabledTitle")
              }
            >
              {overrideBusy ? t("targets.overrideBusy") : t("targets.overrideBtn")}
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
        {providerDisplayName}{" "}
        {hasKey ? (
          <Tag color="success">{t("targets.hasKey")}</Tag>
        ) : (
          <Tag color="warning">{t("targets.missingKey")}</Tag>
        )}
      </Typography.Title>
      <Table<CodexTarget>
        rowKey={(r) => `${r.providerId}::${r.modelId}`}
        dataSource={targets}
        columns={columns}
        pagination={false}
        size="middle"
      />
    </div>
  );
}

function RuntimeOverrideCard({
  state,
  busy,
  onClear,
}: {
  state: CodexState;
  busy: Busy;
  onClear: () => Promise<void>;
}) {
  const { t } = useTranslation("codexEnable");
  return (
    <Card title={t("override.title")} style={{ marginBottom: 16 }}>
      {state.activeOverride ? (
        <Space direction="vertical" style={{ width: "100%" }}>
          <div>
            {t("override.current")}:{" "}
            <code>
              {state.activeOverride.providerId} / {state.activeOverride.modelId}
            </code>
          </div>
          <Button
            onClick={() => void onClear()}
            loading={busy?.kind === "clear"}
          >
            {busy?.kind === "clear" ? t("override.clearBusy") : t("override.clear")}
          </Button>
        </Space>
      ) : (
        <Typography.Text type="secondary">{t("override.empty")}</Typography.Text>
      )}
    </Card>
  );
}

function BackupCard({
  state,
  busy,
  onRestore,
  onDelete,
}: {
  state: CodexState;
  busy: Busy;
  onRestore: (b: CodexBackupPair) => void;
  onDelete: (b: CodexBackupPair) => void;
}) {
  const { t } = useTranslation("codexEnable");

  const columns: ColumnsType<CodexBackupPair> = [
    {
      title: t("backup.columns.ts"),
      dataIndex: "ts",
      key: "ts",
      render: (v: number) => <code style={{ fontSize: 11 }}>{v}</code>,
    },
    {
      title: t("backup.columns.time"),
      dataIndex: "ts",
      key: "time",
      render: (v: number) => new Date(v).toLocaleString(),
    },
    {
      title: t("backup.columns.type"),
      key: "type",
      render: (_, b) =>
        b.preserved ? (
          <Tag color="success" title={t("backup.type.preservedTitle")}>
            {t("backup.type.preserved")}
          </Tag>
        ) : b.authBackupOwner === "mimo2codex" ? (
          <Tag>{t("backup.type.snapshotMimo")}</Tag>
        ) : (
          <Tag>{t("backup.type.snapshot")}</Tag>
        ),
    },
    {
      title: t("backup.columns.providerModel"),
      key: "providerModel",
      render: (_, b) =>
        b.provider || b.model ? (
          <code style={{ fontSize: 12 }}>
            {b.provider ?? "?"} / {b.model ?? "?"}
          </code>
        ) : (
          <Tag>{t("backup.notRecorded")}</Tag>
        ),
    },
    {
      title: t("backup.columns.auth"),
      key: "auth",
      render: (_, b) =>
        b.authBackup ? (
          <Tag color="success">{t("backup.has")}</Tag>
        ) : (
          <Tag>{t("backup.missing")}</Tag>
        ),
    },
    {
      title: t("backup.columns.toml"),
      key: "toml",
      render: (_, b) =>
        b.tomlBackup ? (
          <Tag color="success">{t("backup.has")}</Tag>
        ) : (
          <Tag>{t("backup.missing")}</Tag>
        ),
    },
    {
      title: t("backup.columns.ops"),
      key: "ops",
      align: "right",
      width: 200,
      render: (_, b) => {
        const restoreBusy = busy?.kind === "restore" && busy.key === String(b.ts);
        const deleteBusy = busy?.kind === "delete-backup" && busy.key === String(b.ts);
        return (
          <Space>
            <Button
              size="small"
              onClick={() => onRestore(b)}
              loading={restoreBusy}
              disabled={!!busy && !restoreBusy}
            >
              {restoreBusy ? t("backup.restoreBusy") : t("backup.restore")}
            </Button>
            <Button
              size="small"
              danger
              onClick={() => onDelete(b)}
              loading={deleteBusy}
              disabled={!!busy && !deleteBusy}
              title={
                b.preserved
                  ? t("backup.deletePreservedTitle")
                  : t("backup.deleteTitle")
              }
            >
              {deleteBusy ? t("backup.deleteBusy") : t("backup.delete")}
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      title={t("backup.title")}
      extra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          <Trans i18nKey="backup.intro" ns="codexEnable">
            <strong>placeholder</strong>
          </Trans>
        </Typography.Text>
      }
    >
      <Table<CodexBackupPair>
        rowKey="ts"
        dataSource={state.backups}
        columns={columns}
        pagination={false}
        size="middle"
        locale={{ emptyText: t("backup.empty") }}
      />
    </Card>
  );
}

function parseConfigToml(text: string | null): { model: string | null; provider: string | null } {
  if (!text) return { model: null, provider: null };
  const modelMatch = /^\s*model\s*=\s*"([^"\n]+)"/m.exec(text);
  const providerMatch = /^\s*model_provider\s*=\s*"([^"\n]+)"/m.exec(text);
  return {
    model: modelMatch?.[1] ?? null,
    provider: providerMatch?.[1] ?? null,
  };
}
