// Release notes shown in the "What's New" modal on admin first-load after a
// version bump. Maintained as a hand-rolled data file (TSX, not JSON, so we
// can drop in icons and the occasional ReactNode without losing TS safety).
//
// How to add an entry when you ship a new version:
//   1. Bump package.json `version` (via `npm run release:patch` etc.).
//   2. Update doc/tag-log{,.zh}.md as before (the WhatsNew modal complements
//      tag-log, it does not replace it).
//   3. Prepend a new `ReleaseNote` to RELEASE_NOTES below. Most recent first.
//      The modal auto-shows it to users whose lastSeenVersion is below it.
//
// Keep entries user-facing and SHORT — one line per change. The full prose
// lives in doc/tag-log.{md,zh.md}; here we mirror every tag-log change briefly
// so the modal stays scannable. We keep ONLY the latest version's entry.

import type { ReactNode } from "react";
import { ApiOutlined, SettingOutlined } from "@ant-design/icons";

export interface BilingualText {
  en: string;
  zh: string;
}

export interface ReleaseHighlight {
  icon?: ReactNode;
  /** Section badge: "new" | "improved" | "fixed" | "doc" */
  kind?: "new" | "improved" | "fixed" | "doc";
  title: BilingualText;
  description: BilingualText;
  /** Plain-text breadcrumb so users can find the new feature themselves. */
  location?: BilingualText;
  /** Optional CTA. ctaPath wins → react-router navigate; else ctaHref opens new tab. */
  ctaLabel?: BilingualText;
  ctaPath?: string;
  ctaHref?: string;
}

export interface ReleaseNote {
  version: string; // semver "0.4.2"
  date: string;    // "2026-05-21" ISO
  title: BilingualText;
  summary?: BilingualText;
  highlights: ReleaseHighlight[];
}

// ── Entries ──────────────────────────────────────────────────────────────
// Most recent first. We keep ONLY the latest version here so the in-app
// "What's new" modal stays tight — older release detail lives in
// doc/tag-log.{md,zh.md} for users who want the full history.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.5.21",
    date: "2026-06-01",
    title: {
      en: "Stronger 429 handling + log storage controls",
      zh: "更强的 429 处理 + 日志存储控制",
    },
    summary: {
      en: "Sustained rate limits no longer break the session, plus log storage controls that keep data.db from growing without bound on always-on installs.",
      zh: "持续型限流不再中断会话；并新增日志存储控制，避免常驻部署里 data.db 无上限膨胀。",
    },
    highlights: [
      {
        kind: "fixed",
        icon: <ApiOutlined />,
        title: { en: "Sustained 429s no longer break the session", zh: "持续 429 不再中断会话" },
        description: {
          en: "The proxy now retries a rate limit for ~28s (was ~3.5s), so multi-second quota limits clear before the 429 reaches Codex.",
          zh: "代理现在最多重试约 28 秒（原约 3.5 秒）扛限流，让几十秒内的配额限流自行解除，不再把 429 透传给 Codex 触发「exceeded retry limit」。",
        },
      },
      {
        kind: "new",
        icon: <SettingOutlined />,
        title: { en: "Log storage settings", zh: "日志存储设置" },
        description: {
          en: "Chat logs store every request/response in full, so over time data.db balloons (disk, slower backups, privacy). Now store all bodies, failures only, or none — and auto-delete logs older than N days to keep the DB bounded.",
          zh: "聊天日志会完整保存每次请求/响应，时间久了 data.db 会越来越大（占磁盘、备份变慢、隐私）。现在可选保存全部 body、仅失败请求或完全不存，并自动删除超过 N 天的旧日志，把数据库体积控制住。",
        },
        location: { en: "Logs page → Storage settings", zh: "日志页 → 存储设置" },
      },
    ],
  },
];

// ── Semver compare ────────────────────────────────────────────────────────
export function compareVersion(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.replace(/^v/, "").split(".").map((n) => {
      const m = /^(\d+)/.exec(n);
      return m ? parseInt(m[1], 10) : 0;
    });
  const aa = parse(a);
  const bb = parse(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const ai = aa[i] ?? 0;
    const bi = bb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

// Releases the user has not yet acknowledged, capped at the running version
// (so a release-notes.tsx entry for a *future* version doesn't leak through).
export function unseenReleases(
  lastSeen: string | null,
  current: string,
): ReleaseNote[] {
  const baseline = lastSeen ?? "0.0.0";
  return RELEASE_NOTES.filter(
    (n) =>
      compareVersion(n.version, baseline) > 0 &&
      compareVersion(n.version, current) <= 0,
  );
}
