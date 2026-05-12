import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type LogRow,
  type MappingRow,
  type ProviderInfo,
  type StatsResponse,
  type TimeseriesBucket,
  type TokenTimeseriesResponse,
} from "../api/client";
import { KeyStatusBanner } from "../components/KeyStatusBanner";
import { TokenChart } from "../components/TokenChart";

const SETUP_BANNER_KEY = "m2c.setup-banner-dismissed";

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function Dashboard() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [timeseries, setTimeseries] = useState<TokenTimeseriesResponse | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  // Chart-only granularity toggle. The cards/tables above still use a single
  // range total; the chart picks between day and hour buckets.
  const [bucket, setBucket] = useState<TimeseriesBucket>("hour");
  const [error, setError] = useState<string | null>(null);
  const [showSetupBanner, setShowSetupBanner] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(SETUP_BANNER_KEY) !== "1";
  });

  function dismissSetupBanner() {
    setShowSetupBanner(false);
    try {
      localStorage.setItem(SETUP_BANNER_KEY, "1");
    } catch {
      // ignore — private mode / quota errors shouldn't crash the page
    }
  }

  async function load() {
    try {
      setError(null);
      const [p, s, t, l, m] = await Promise.all([
        api.providers(),
        api.stats(range),
        api.tokenTimeseries(range, bucket),
        api.logs({ limit: 10 }),
        api.mappings(),
      ]);
      setProviders(p.providers);
      setStats(s);
      setTimeseries(t);
      setLogs(l.logs);
      setMappings(m.mappings);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, bucket]);

  const totals = stats?.rows.reduce(
    (acc, r) => ({
      requests: acc.requests + r.requests,
      errors: acc.errors + r.errors,
      tokens: acc.tokens + r.total_tokens,
    }),
    { requests: 0, errors: 0, tokens: 0 }
  ) ?? { requests: 0, errors: 0, tokens: 0 };

  return (
    <div>
      <h2>概览</h2>

      {error && (
        <div className="banner err">
          <span className="ic">!</span>
          <div className="body">{error}</div>
        </div>
      )}

      {showSetupBanner && (
        <div className="banner info">
          <span className="ic">👋</span>
          <div className="body">
            第一次用？看「<Link to="/setup">对接指引</Link>」页面 — 一键拿到把
            Codex 接到 mimo2codex 的配置片段（含 auth.json + config.toml）。
          </div>
          <button
            className="secondary"
            onClick={dismissSetupBanner}
            style={{ alignSelf: "flex-start" }}
          >
            关闭
          </button>
        </div>
      )}

      <KeyStatusBanner providers={providers} />

      <div className="row" style={{ marginTop: 16 }}>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>统计窗口：</span>
        {(["24h", "7d", "30d"] as const).map((r) => (
          <button
            key={r}
            className={r === range ? "" : "secondary"}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">请求总数</div>
          <div className="value">{totals.requests.toLocaleString()}</div>
          <div className="sub">含错误请求</div>
        </div>
        <div className="card">
          <div className="label">错误数</div>
          <div className="value">{totals.errors.toLocaleString()}</div>
          <div className="sub">
            错误率：
            {totals.requests
              ? ((totals.errors / totals.requests) * 100).toFixed(1)
              : "0.0"}
            %
          </div>
        </div>
        <div className="card">
          <div className="label">Token 消耗（合计）</div>
          <div className="value">{formatTokens(totals.tokens)}</div>
          <div className="sub">prompt + completion</div>
        </div>
        <div className="card">
          <div className="label">已启用 Provider</div>
          <div className="value">
            {providers.filter((p) => p.enabled).length}/{providers.length}
          </div>
          <div className="sub">
            {providers
              .filter((p) => p.enabled)
              .map((p) => p.display_name)
              .join(" · ") || "无"}
          </div>
        </div>
      </div>

      <div
        className="row"
        style={{ marginTop: 24, marginBottom: 8, justifyContent: "space-between" }}
      >
        <h3 style={{ margin: 0 }}>Token 消耗趋势</h3>
        <div className="row" style={{ margin: 0 }}>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>粒度：</span>
          {(["hour", "day"] as const).map((b) => (
            <button
              key={b}
              className={b === bucket ? "" : "secondary"}
              onClick={() => setBucket(b)}
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              {b === "hour" ? "按小时" : "按日"}
            </button>
          ))}
        </div>
      </div>
      {timeseries ? (
        <TokenChart data={timeseries} />
      ) : (
        <div className="empty">加载中…</div>
      )}

      <h3>按模型统计</h3>
      {stats && stats.rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>模型</th>
              <th style={{ textAlign: "right" }}>请求</th>
              <th style={{ textAlign: "right" }}>错误</th>
              <th style={{ textAlign: "right" }}>Prompt</th>
              <th style={{ textAlign: "right" }}>Completion</th>
              <th style={{ textAlign: "right" }}>合计</th>
            </tr>
          </thead>
          <tbody>
            {stats.rows.map((r) => (
              <tr key={`${r.provider_id}-${r.upstream_model}`}>
                <td>
                  <span className="tag">{r.provider_id}</span>
                </td>
                <td className="mono">{r.upstream_model}</td>
                <td style={{ textAlign: "right" }}>{r.requests}</td>
                <td style={{ textAlign: "right" }}>{r.errors}</td>
                <td style={{ textAlign: "right" }}>{formatTokens(r.prompt_tokens)}</td>
                <td style={{ textAlign: "right" }}>{formatTokens(r.completion_tokens)}</td>
                <td style={{ textAlign: "right" }}>{formatTokens(r.total_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">该窗口内暂无请求记录</div>
      )}

      <h3>模型映射记录</h3>
      {mappings.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>客户端发的 model</th>
              <th>实际上游 model</th>
              <th style={{ textAlign: "right" }}>命中次数</th>
              <th>最近一次</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={`${m.provider_id}-${m.client_model}-${m.upstream_model}`}>
                <td>
                  <span className="tag">{m.provider_id}</span>
                </td>
                <td className="mono">{m.client_model}</td>
                <td className="mono">{m.upstream_model}</td>
                <td style={{ textAlign: "right" }}>{m.count}</td>
                <td>{formatTime(m.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">尚无映射记录（发送一次请求即可）</div>
      )}

      <h3>最近 10 条请求</h3>
      {logs.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>Provider</th>
              <th>模型</th>
              <th>端点</th>
              <th>状态</th>
              <th style={{ textAlign: "right" }}>tok</th>
              <th style={{ textAlign: "right" }}>耗时</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{formatTime(l.ts)}</td>
                <td>
                  <span className="tag">{l.provider_id}</span>
                </td>
                <td className="mono">{l.upstream_model}</td>
                <td className="mono">{l.endpoint}</td>
                <td>
                  <span className={`tag ${l.status_code >= 400 ? "err" : "ok"}`}>
                    {l.status_code}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {l.total_tokens != null ? l.total_tokens : "—"}
                </td>
                <td style={{ textAlign: "right" }}>{l.duration_ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">暂无请求</div>
      )}
    </div>
  );
}
