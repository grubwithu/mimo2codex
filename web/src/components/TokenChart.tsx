import { useMemo, useState } from "react";
import type { TokenTimeseriesResponse, TokenTimeseriesSeries } from "../api/client";

// Palette tuned for the dark theme (panel #161b22). Cycled through; with
// the top-N rollup we never exceed this length.
const COLORS = [
  "#4f8cf7", // accent blue
  "#3fb950", // ok green
  "#d29922", // warn amber
  "#f85149", // err red
  "#a371f7", // purple
  "#1f6feb", // deeper blue
  "#e3b341", // gold
  "#8b95a3", // muted grey (fallback / "其他")
];

// Number of models to plot individually before rolling everything else into
// a single "其他" series. Keeps the chart legible at 6 distinct colors.
const MAX_SERIES = 6;

// Padding inside the SVG viewBox. Left padding leaves room for y-axis labels;
// bottom for x-axis date labels.
const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 32;
const CHART_W = 720;
const CHART_H = 240;

function formatTokens(n: number): string {
  if (n === 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

// Compress bucket labels for the x-axis. Full label still shown in tooltip.
//   "YYYY-MM-DD"    → "MM-DD"
//   "YYYY-MM-DD HH" → "HH:00"  (date appears via dayBreak markers below)
function shortBucket(label: string, bucket: "day" | "hour"): string {
  if (bucket === "hour") {
    const parts = label.split(" ");
    return parts.length === 2 ? `${parts[1]}:00` : label;
  }
  return label.length >= 10 ? label.slice(5) : label;
}

function bucketDate(label: string): string {
  // Returns the YYYY-MM-DD component of a bucket label, regardless of granularity.
  return label.length >= 10 ? label.slice(0, 10) : label;
}

// "Nice" round number ≥ value, snapped to 1/2/5 × 10ⁿ. Used as the y-axis
// max so labels read 50k, 100k, 200k, 500k, 1M etc. instead of arbitrary
// fractions of the raw peak.
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const frac = value / pow;
  let nice: number;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

interface RolledUpSeries extends TokenTimeseriesSeries {
  label: string;
  color: string;
  isOther?: boolean;
}

function rollupSeries(series: TokenTimeseriesSeries[], bucketCount: number): RolledUpSeries[] {
  if (series.length === 0) return [];
  const top = series.slice(0, MAX_SERIES);
  const rest = series.slice(MAX_SERIES);
  const result: RolledUpSeries[] = top.map((s, i) => ({
    ...s,
    label: s.upstream_model,
    color: COLORS[i % (COLORS.length - 1)], // leave last color for "其他"
  }));
  if (rest.length > 0) {
    const tokens = new Array(bucketCount).fill(0);
    const prompt = new Array(bucketCount).fill(0);
    const completion = new Array(bucketCount).fill(0);
    let total = 0;
    for (const s of rest) {
      for (let i = 0; i < bucketCount; i++) {
        tokens[i] += s.tokens[i] ?? 0;
        prompt[i] += s.prompt_tokens[i] ?? 0;
        completion[i] += s.completion_tokens[i] ?? 0;
      }
      total += s.total;
    }
    result.push({
      provider_id: "*",
      upstream_model: `其他 (${rest.length})`,
      tokens,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total,
      label: `其他 (${rest.length} 个模型)`,
      color: COLORS[COLORS.length - 1],
      isOther: true,
    });
  }
  return result;
}

export function TokenChart({ data }: { data: TokenTimeseriesResponse }) {
  // Per-series visibility (legend click toggles). Initialised true on first
  // render and stays in component state across re-renders.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ x: number; bucketIdx: number } | null>(null);

  const allSeries = useMemo(
    () => rollupSeries(data.series, data.buckets.length),
    [data.series, data.buckets.length]
  );

  const visibleSeries = useMemo(
    () => allSeries.filter((s) => !hidden.has(s.upstream_model)),
    [allSeries, hidden]
  );

  // Y-axis scale from the visible series only. As the user toggles a noisy
  // model off the chart re-scales to fit what remains.
  const yMax = useMemo(() => {
    let peak = 0;
    for (const s of visibleSeries) {
      for (const v of s.tokens) {
        if (v > peak) peak = v;
      }
    }
    return niceCeil(peak);
  }, [visibleSeries]);

  const bucketCount = data.buckets.length;
  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  // With N buckets we have N-1 segments. Bucket i sits at PAD_LEFT + i*stepX.
  const stepX = bucketCount > 1 ? plotW / (bucketCount - 1) : 0;

  function xFor(i: number): number {
    if (bucketCount === 1) return PAD_LEFT + plotW / 2;
    return PAD_LEFT + i * stepX;
  }
  function yFor(value: number): number {
    if (yMax === 0) return PAD_TOP + plotH;
    return PAD_TOP + plotH - (value / yMax) * plotH;
  }

  function toggle(model: string) {
    const next = new Set(hidden);
    if (next.has(model)) next.delete(model);
    else next.add(model);
    setHidden(next);
  }

  // X-axis label thinning: only show every Nth label so the strip doesn't
  // overlap when range=30d packs 30 ticks into ~660px, or range=7d × hour
  // packs 168 ticks.
  const targetLabels = data.bucket === "hour" ? 10 : 8;
  const xLabelStep = Math.max(1, Math.ceil(bucketCount / targetLabels));

  // For hourly buckets crossing date boundaries, mark where the date changes
  // so the chart shows a faint divider + the new date appears in the label.
  const dayBreaks: number[] = [];
  if (data.bucket === "hour") {
    let prev = "";
    for (let i = 0; i < data.buckets.length; i++) {
      const d = bucketDate(data.buckets[i]);
      if (d !== prev && i > 0) dayBreaks.push(i);
      prev = d;
    }
  }
  // When hourly + crossing midnight, also show the date once per day on the
  // x-axis instead of just HH:00 over and over.
  function xLabelFor(i: number): string {
    if (data.bucket === "hour") {
      const isStart = i === 0 || dayBreaks.includes(i);
      if (isStart) {
        // First hour of a day → show "MM-DD HH:00" so the date context shows
        const parts = data.buckets[i].split(" ");
        return parts.length === 2 ? `${parts[0].slice(5)} ${parts[1]}:00` : data.buckets[i];
      }
    }
    return shortBucket(data.buckets[i], data.bucket);
  }
  const yTicks = useMemo(() => {
    const steps = 4;
    const ticks: number[] = [];
    for (let i = 0; i <= steps; i++) ticks.push((yMax * i) / steps);
    return ticks;
  }, [yMax]);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (bucketCount === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Map screen x to viewBox x (svg may be scaled by CSS width).
    const svgX = ((e.clientX - rect.left) / rect.width) * CHART_W;
    if (svgX < PAD_LEFT || svgX > CHART_W - PAD_RIGHT) {
      setHover(null);
      return;
    }
    const relative = svgX - PAD_LEFT;
    const idx =
      bucketCount === 1 ? 0 : Math.round((relative / plotW) * (bucketCount - 1));
    const clamped = Math.max(0, Math.min(bucketCount - 1, idx));
    setHover({ x: xFor(clamped), bucketIdx: clamped });
  }
  function onMouseLeave() {
    setHover(null);
  }

  // Empty state — no data in window.
  const allEmpty = visibleSeries.every((s) => s.total === 0);

  return (
    <div className="chart-card">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        height={CHART_H}
        preserveAspectRatio="none"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ display: "block", cursor: "crosshair" }}
      >
        {/* y-axis grid lines + labels */}
        {yTicks.map((t, i) => {
          const y = yFor(t);
          return (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                x2={CHART_W - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray={i === 0 ? "0" : "2 4"}
                strokeWidth="1"
              />
              <text
                x={PAD_LEFT - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--muted)"
                fontSize="10"
              >
                {formatTokens(t)}
              </text>
            </g>
          );
        })}

        {/* faint dividers where the date rolls over (hourly buckets only) */}
        {dayBreaks.map((i) => (
          <line
            key={`db-${i}`}
            x1={xFor(i)}
            x2={xFor(i)}
            y1={PAD_TOP}
            y2={PAD_TOP + plotH}
            stroke="var(--border)"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}

        {/* x-axis labels */}
        {data.buckets.map((day, i) => {
          if (i % xLabelStep !== 0 && i !== bucketCount - 1) return null;
          return (
            <text
              key={day + i}
              x={xFor(i)}
              y={CHART_H - 10}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize="10"
            >
              {xLabelFor(i)}
            </text>
          );
        })}

        {/* hover vertical guide */}
        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={PAD_TOP}
            y2={PAD_TOP + plotH}
            stroke="var(--accent)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        )}

        {/* lines */}
        {visibleSeries.map((s) => {
          const pts = s.tokens
            .map((v, i) => `${xFor(i)},${yFor(v)}`)
            .join(" ");
          return (
            <g key={s.upstream_model}>
              <polyline
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* dots — only render if not too crowded */}
              {bucketCount <= 14 &&
                s.tokens.map((v, i) => (
                  <circle
                    key={i}
                    cx={xFor(i)}
                    cy={yFor(v)}
                    r={hover?.bucketIdx === i ? 4 : 2.5}
                    fill={s.color}
                  >
                    <title>{`${data.buckets[i]} · ${s.label}: ${v.toLocaleString()} tokens`}</title>
                  </circle>
                ))}
            </g>
          );
        })}

        {allEmpty && (
          <text
            x={CHART_W / 2}
            y={CHART_H / 2}
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="13"
          >
            该窗口内暂无 token 消耗
          </text>
        )}
      </svg>

      {/* Tooltip rendered as overlay so it can use HTML formatting */}
      {hover && !allEmpty && (
        <div className="chart-tooltip" style={{ left: `${(hover.x / CHART_W) * 100}%` }}>
          <div className="day">{data.buckets[hover.bucketIdx]}</div>
          {visibleSeries.map((s) => {
            const v = s.tokens[hover.bucketIdx] ?? 0;
            if (v === 0) return null;
            return (
              <div key={s.upstream_model} className="row">
                <span className="dot" style={{ background: s.color }} />
                <span className="label">{s.label}</span>
                <span className="value">{v.toLocaleString()}</span>
              </div>
            );
          })}
          {visibleSeries.every((s) => (s.tokens[hover.bucketIdx] ?? 0) === 0) && (
            <div className="empty">无请求</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="chart-legend">
        {allSeries.map((s) => {
          const isHidden = hidden.has(s.upstream_model);
          return (
            <button
              key={s.upstream_model}
              onClick={() => toggle(s.upstream_model)}
              className={`legend-item ${isHidden ? "off" : ""}`}
              title={`点击切换显示 ${s.label}`}
            >
              <span className="dot" style={{ background: s.color }} />
              <span className="label">
                {s.isOther ? s.label : (
                  <>
                    <span className="muted">{s.provider_id}/</span>
                    {s.upstream_model}
                  </>
                )}
              </span>
              <span className="total">{formatTokens(s.total)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
