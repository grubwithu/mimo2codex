import { useEffect, useMemo, useState } from "react";
import { api, type SetupSnippetsResponse } from "../api/client";

type Tab = "auth" | "envkey" | "ccswitch";
type Platform = "mac" | "linux" | "windows";

function detectPlatform(): Platform {
  // navigator.platform is deprecated but still works in every browser we care
  // about, and userAgentData isn't widely supported yet (2026). Good enough
  // for swapping a help string.
  if (typeof navigator === "undefined") return "linux";
  const p = navigator.platform || "";
  if (/win/i.test(p)) return "windows";
  if (/mac/i.test(p)) return "mac";
  return "linux";
}

function codexPathFor(platform: Platform, file: "auth.json" | "config.toml"): string {
  if (platform === "windows") return `%USERPROFILE%\\.codex\\${file}`;
  return `~/.codex/${file}`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore — older browsers without clipboard.writeText
        }
      }}
      style={{ float: "right", marginTop: -4 }}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function CodeBlock({ title, code }: { title?: string; code: string }) {
  return (
    <div
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        marginBottom: 12,
      }}
    >
      {title && (
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <CopyButton value={code} />
          {title}
        </div>
      )}
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          overflowX: "auto",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {code}
      </pre>
    </div>
  );
}

export function Setup() {
  const [data, setData] = useState<SetupSnippetsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("auth");
  const platform = useMemo(detectPlatform, []);

  async function load(hint?: string) {
    try {
      setError(null);
      const resp = await api.setupSnippets(hint);
      setData(resp);
      // Adopt the server-resolved provider id so the dropdown reflects what
      // we actually rendered (e.g. unknown hint falls back to mimo).
      setSelectedProvider(resp.bundle.target.providerId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function onProviderChange(id: string) {
    setSelectedProvider(id);
    void load(id);
  }

  return (
    <div>
      <h2>对接指引</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 24 }}>
        把当前正在运行的 mimo2codex 接到 Codex CLI / 桌面端。下方片段是按本机
        host:port 实时生成的，复制即用。
      </p>

      {error && (
        <div className="banner err">
          <span className="ic">!</span>
          <div className="body">{error}</div>
        </div>
      )}

      {data && (
        <>
          <div className="row" style={{ marginBottom: 20 }}>
            <label style={{ color: "var(--muted)", fontSize: 13 }}>
              Provider:
            </label>
            <select
              value={selectedProvider ?? data.defaultProviderId}
              onChange={(e) => onProviderChange(e.target.value)}
              style={{
                background: "var(--panel-2)",
                color: "var(--fg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 13,
              }}
            >
              {data.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} {p.id === data.defaultProviderId ? "(默认)" : ""}
                </option>
              ))}
            </select>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              当前选中模型：
              <code style={{ color: "var(--fg)" }}>{data.bundle.target.modelId}</code>
            </span>
          </div>

          <div className="row" style={{ marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <TabButton active={tab === "auth"} onClick={() => setTab("auth")}>
              方法 1：修改 auth.json + config.toml（推荐）
            </TabButton>
            <TabButton active={tab === "envkey"} onClick={() => setTab("envkey")}>
              方法 2：env-key（仅 Codex CLI）
            </TabButton>
            <TabButton active={tab === "ccswitch"} onClick={() => setTab("ccswitch")}>
              方法 3：cc-switch
            </TabButton>
          </div>

          {tab === "auth" && <AuthTab data={data} platform={platform} />}
          {tab === "envkey" && <EnvKeyTab data={data} platform={platform} />}
          {tab === "ccswitch" && <CcSwitchTab data={data} />}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={active ? "" : "secondary"}
      onClick={onClick}
      style={{
        borderRadius: 0,
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        background: "transparent",
        color: active ? "var(--fg)" : "var(--muted)",
        padding: "10px 14px",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

function AuthTab({
  data,
  platform,
}: {
  data: SetupSnippetsResponse;
  platform: Platform;
}) {
  return (
    <>
      <div className="banner warn">
        <span className="ic">⚠</span>
        <div className="body">
          这个方法会覆盖你现有的 <code>{codexPathFor(platform, "auth.json")}</code>。
          如果你同时用 Codex 登录真实的 OpenAI 账号，请改用方法 2（env-key）或方法 3（cc-switch）。
        </div>
      </div>

      <h3>步骤 1 · 写入 {codexPathFor(platform, "auth.json")}</h3>
      <CodeBlock code={data.bundle.ccSwitchAuthJson} />

      <h3>步骤 2 · 追加到 {codexPathFor(platform, "config.toml")}</h3>
      <CodeBlock code={data.bundle.configToml} />

      <h3>步骤 3 · 完全退出并重启 Codex</h3>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Codex 桌面端必须完全退出（任务栏/菜单栏图标点 Quit），重新启动后才能读取新的 auth.json。
        然后在 Codex 里选择 <code>{data.bundle.target.providerLabel}</code> 这个 provider。
      </p>
    </>
  );
}

function EnvKeyTab({
  data,
  platform,
}: {
  data: SetupSnippetsResponse;
  platform: Platform;
}) {
  return (
    <>
      <div className="banner info">
        <span className="ic">i</span>
        <div className="body">
          这个方法保留你现有的 <code>{codexPathFor(platform, "auth.json")}</code> 不动，
          通过环境变量 <code>MIMO2CODEX_KEY</code> 鉴权。
          <strong> 仅 Codex CLI 生效</strong> —— 桌面端从 Finder/开始菜单启动时不继承 shell env。
        </div>
      </div>

      <h3>config.toml 片段</h3>
      <CodeBlock code={data.bundle.configTomlEnvKey} />

      <h3>设置环境变量</h3>
      <CodeBlock
        title={
          platform === "windows"
            ? "PowerShell"
            : platform === "mac"
              ? "macOS / Linux (bash/zsh)"
              : "Linux (bash/zsh)"
        }
        code={
          platform === "windows"
            ? `$env:MIMO2CODEX_KEY = "anything"`
            : `export MIMO2CODEX_KEY=anything`
        }
      />
      <p style={{ color: "var(--muted)", fontSize: 12 }}>
        值可以是任意非空字符串 — mimo2codex 不验证入站凭据。你的真实上游 key（MIMO_API_KEY /
        DS_API_KEY 等）只保留在运行 mimo2codex 这台机器的环境里。
      </p>
    </>
  );
}

function CcSwitchTab({ data }: { data: SetupSnippetsResponse }) {
  return (
    <>
      <div className="banner info">
        <span className="ic">i</span>
        <div className="body">
          <a href="https://github.com/farion1231/cc-switch" target="_blank" rel="noreferrer">
            cc-switch
          </a>{" "}
          是一个 Codex provider 切换器桌面应用。打开它，
          <strong> Add Provider → Codex tab → Custom</strong>，把下面两段粘到对应输入框。
        </div>
      </div>

      <h3>auth.json 输入框</h3>
      <CodeBlock code={data.bundle.ccSwitchAuthJson} />

      <h3>config.toml 输入框</h3>
      <CodeBlock code={data.bundle.ccSwitchConfigToml} />

      <p style={{ color: "var(--muted)", fontSize: 12 }}>
        OPENAI_API_KEY 可以是任意非空字符串 — mimo2codex 不验证入站凭据。
        真实上游 key 保留在运行 mimo2codex 这台机器的环境里。
      </p>
    </>
  );
}
