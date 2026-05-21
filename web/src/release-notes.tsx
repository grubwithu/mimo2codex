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
import { RobotOutlined } from "@ant-design/icons";

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
    version: "0.4.4",
    date: "2026-05-21",
    title: {
      en: "AI documentation assistant on mimodoc",
      zh: "官网新增 AI 文档助手",
    },
    highlights: [
      {
        kind: "new",
        icon: <RobotOutlined />,
        title: {
          en: "Ask the AI on mimodoc.chengj.online",
          zh: "不懂的常见问题，问 AI 小助手",
        },
        description: {
          en: "The official docs site now has an AI assistant float (bottom-right robot). For common configuration questions — first-time setup, why-502, generic-provider wiring, etc. — drop the question and the assistant agent-loops over the project docs and streams a markdown answer. Supports image upload (paste / drag a config screenshot) for MiMo V2.5 to diagnose visually. Thinking trace shows in a collapsible panel above each answer.",
          zh: "官网右下角新增 AI 文档助手浮球。常见配置问题 —— 第一次怎么配、为什么 502、通用 provider 怎么接 —— 直接问，助手在项目文档上跑 agent 检索，流式给出 markdown 回答。支持上传配置截图（粘贴 / 拖拽），MiMo V2.5 多模态直接看图诊断。每个回答上方有可折叠的思考过程面板。",
        },
        location: {
          en: "mimodoc.chengj.online → bottom-right 🤖 float",
          zh: "mimodoc.chengj.online → 右下角 🤖 浮球",
        },
        ctaLabel: { en: "Try it", zh: "去试试" },
        ctaHref: "https://mimodoc.chengj.online/",
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
