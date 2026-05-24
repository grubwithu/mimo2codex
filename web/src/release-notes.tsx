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
// Keep entries user-facing: highlight what changed from the user's seat, name
// the menu / button / page where the new thing lives, and (optionally) wire a
// CTA that navigates straight to it.

import type { ReactNode } from "react";
import { DesktopOutlined } from "@ant-design/icons";

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
// Most recent first. Per the v0.4.3 release: we keep ONLY the latest version
// here so the in-app "What's new" modal stays tight — older release detail
// lives in doc/tag-log.{md,zh.md} for users who want the full history.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.4.10",
    date: "2026-05-24",
    title: {
      en: "Codex Desktop namespace tools now work end-to-end",
      zh: "Codex Desktop 的 namespace / 子代理工具现在可正常调用",
    },
    summary: {
      en: "Fix for Codex Desktop's namespace-wrapped tool calls (e.g. multi_agent_v1 → spawn_agent) failing with \"unsupported call\". Other request flows are byte-identical. The Windows / macOS desktop preview (beta) is also still rolling out — grab it from the download page if you haven't.",
      zh: "修复 Codex Desktop 调用 namespace 包装的工具（如 multi_agent_v1 下的 spawn_agent）报 \"unsupported call\" 的问题，其他请求流字节级不变。另：Windows / macOS 桌面预览（beta）还在持续推送，没装的同学可以去下载页拿一下。",
    },
    highlights: [
      {
        kind: "fixed",
        title: {
          en: "Namespace tools no longer report \"unsupported call\" (PR #34, issue #33, thanks @meesii)",
          zh: "namespace / 子代理工具不再报 \"unsupported call\"（PR #34，issue #33，感谢 @meesii）",
        },
        description: {
          en: "Codex Desktop dispatches namespace-wrapped tools (e.g. spawn_agent under multi_agent_v1) using a `namespace` field on the function_call output item. The proxy was dropping that field during translation. Now we extract toolName→namespace from the request's tools array and re-attach it on both non-streaming and streaming responses. Requests without namespace tools are byte-identical to before.",
          zh: "Codex Desktop 通过 function_call output item 上的 `namespace` 字段把 namespace 包装的工具（如 multi_agent_v1 下的 spawn_agent）路由到本地 handler，代理之前丢了这个字段。现在会从请求的 tools 抽出 toolName→namespace 映射，在非流式和流式响应上按需附加。不带 namespace 工具的请求行为与之前完全一致。",
        },
      },
      {
        kind: "new",
        icon: <DesktopOutlined />,
        title: {
          en: "Reminder: Windows tray / macOS menu-bar desktop app (beta)",
          zh: "提醒：Windows 系统托盘 / macOS 顶栏桌面端（beta）",
        },
        description: {
          en: "If you haven't tried it yet — the optional companion app runs mimo2codex in the background, no terminal window required. First launch shows a small settings window to pick a provider + paste an API key; after that the tray / menu-bar icon opens the admin UI. The CLI install (`npm install -g mimo2codex`) is unchanged and can coexist. Still in beta — installer / launch / sidecar feedback welcome on the download page or via a GitHub issue.",
          zh: "还没试过的话可以装一下 —— 可选的桌面壳子在后台跑 mimo2codex，不用一直挂终端。首次启动有个小设置窗让你选 provider 并粘贴 API Key；之后从系统托盘 / 顶栏图标一键打开 admin UI。命令行版（`npm install -g mimo2codex`）完全不变，两者可在同一台机器共存。仍在 beta —— 安装 / 启动 / sidecar 问题欢迎在下载页或 GitHub issue 反馈。",
        },
        location: {
          en: "Windows system tray / macOS menu bar — appears after install",
          zh: "Windows 系统托盘 / macOS 顶栏 —— 安装完成后即可见",
        },
        ctaLabel: { en: "Download & feedback", zh: "下载体验 & 反馈" },
        ctaHref: "https://mimodoc.chengj.online/download",
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
