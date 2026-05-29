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
import {
  ApiOutlined,
  AppstoreOutlined,
  BugOutlined,
  CodeOutlined,
  DashboardOutlined,
  DesktopOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

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
    version: "0.5.20",
    date: "2026-05-29",
    title: {
      en: "Session Manager, header status, safer config switching",
      zh: "会话管理、顶栏状态、更稳的切配置",
    },
    summary: {
      en: "A roll-up release: a new Session Manager, live status in the header, config switching that preserves your settings, 429 retry, and desktop quality-of-life.",
      zh: "一个汇总版本：新增会话管理、顶栏实时状态、切配置不丢设置、429 重试、以及一批桌面端体验优化。",
    },
    highlights: [
      {
        kind: "fixed",
        icon: <ApiOutlined />,
        title: { en: "429 no longer breaks the session", zh: "429 不再中断会话" },
        description: {
          en: "Transient upstream 429 / 5xx are retried with backoff (honoring Retry-After) instead of bubbling up to Codex.",
          zh: "上游瞬时 429 / 5xx 改为退避重试（遵循 Retry-After），不再透传给 Codex 触发「exceeded retry limit」。",
        },
      },
      {
        kind: "fixed",
        icon: <BugOutlined />,
        title: { en: "“Write files and enable” keeps your config.toml", zh: "「写入文件并启用」不丢 config.toml 设置" },
        description: {
          en: "Switching models now surgically merges only the model/provider keys — [projects], [mcp_servers], reasoning, comments all stay.",
          zh: "切换模型只合并模型/provider 字段，[projects]、[mcp_servers]、reasoning、注释等原样保留。",
        },
      },
      {
        kind: "new",
        icon: <HistoryOutlined />,
        title: { en: "Session Manager", zh: "会话管理" },
        description: {
          en: "Browse every Codex session across providers (provider → project → session); migrate one, or batch-migrate selected, to another provider.",
          zh: "跨 provider 浏览所有 Codex 会话（provider → 项目 → 会话）；可单个迁移或勾选批量迁移到另一个 provider。",
        },
        location: { en: "Left nav → Session Manager", zh: "左侧导航 → 会话管理" },
        ctaLabel: { en: "Open", zh: "打开" },
        ctaPath: "/sessions",
      },
      {
        kind: "new",
        icon: <CodeOutlined />,
        title: { en: "Session preview + Markdown export", zh: "会话预览 + 导出 Markdown" },
        description: {
          en: "Preview a session's chat (tool calls collapsed to keep text front-and-center) and export it to Markdown.",
          zh: "预览会话聊天记录（工具调用默认折叠以突出文本），并可导出为 Markdown。",
        },
      },
      {
        kind: "new",
        icon: <DashboardOutlined />,
        title: { en: "Live “当前状态” in the header", zh: "顶栏「当前状态」实时显示" },
        description: {
          en: "Effective provider·model now rides in the top bar as a rotating chip; click for the full state.",
          zh: "当前生效的 provider·model 以跑马灯芯片常驻顶栏，点击查看完整状态。",
        },
      },
      {
        kind: "improved",
        icon: <AppstoreOutlined />,
        title: { en: "Codex page slimmed", zh: "Codex 接入页精简" },
        description: {
          en: "Down to just the model-switch table; the current-state card moved to the header and the quick-switch bar was dropped.",
          zh: "精简为只剩切模型表格；当前状态卡片挪到顶栏，快速切换栏移除。",
        },
      },
      {
        kind: "new",
        icon: <ReloadOutlined />,
        title: { en: "Restart Codex after applying", zh: "应用配置后重启 Codex" },
        description: {
          en: "After “写入文件并启用”, mimo2codex offers to restart Codex Desktop so the change takes effect.",
          zh: "「写入文件并启用」后弹窗询问是否帮你重启 Codex 桌面端使配置生效。",
        },
      },
      {
        kind: "new",
        icon: <DesktopOutlined />,
        title: { en: "Desktop: open Codex on launch", zh: "桌面端：启动时打开 Codex" },
        description: {
          en: "If Codex isn't running when you start the desktop app, it asks whether to launch it.",
          zh: "启动桌面端时若 Codex 未运行，会询问是否帮你打开。",
        },
      },
      {
        kind: "improved",
        icon: <DesktopOutlined />,
        title: { en: "Desktop: double-click tray → console", zh: "桌面端：双击托盘开控制台" },
        description: {
          en: "Double-clicking the tray icon opens the admin console directly.",
          zh: "双击系统托盘图标直接打开管理控制台。",
        },
      },
      {
        kind: "improved",
        icon: <SettingOutlined />,
        title: { en: "Backups tidied away", zh: "备份归入独立目录" },
        description: {
          en: "Per-switch backups moved into a hidden ~/.codex/.m2c-backups/ folder so they stop cluttering the codex dir.",
          zh: "每次切换的备份迁入隐藏的 ~/.codex/.m2c-backups/ 目录，不再污染 codex 目录。",
        },
      },
      {
        kind: "improved",
        icon: <ThunderboltOutlined />,
        title: { en: "Model-rewrite log silent by default", zh: "模型改写日志默认静默" },
        description: {
          en: "The “model fallback applied” log is suppressed by default; toggle it under the header “更多” menu.",
          zh: "「model fallback applied」日志默认静默；可在顶栏「更多」菜单里开关。",
        },
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
