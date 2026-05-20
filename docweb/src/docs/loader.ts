import type { Lang } from "../contexts/LanguageContext";

const modules = import.meta.glob("../../../doc/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

interface ParsedKey {
  slug: string;
  lang: Lang;
}

function parseKey(key: string): ParsedKey | null {
  const match = key.match(/\/doc\/([^/]+?)(\.zh)?\.md$/);
  if (!match) return null;
  return {
    slug: match[1],
    lang: match[2] ? "zh" : "en",
  };
}

interface DocBundle {
  en?: string;
  zh?: string;
}

const bundleBySlug = new Map<string, DocBundle>();
for (const [key, content] of Object.entries(modules)) {
  const parsed = parseKey(key);
  if (!parsed) continue;
  const existing = bundleBySlug.get(parsed.slug) ?? {};
  existing[parsed.lang] = content;
  bundleBySlug.set(parsed.slug, existing);
}

export interface DocLoadResult {
  content: string;
  /** Lang actually used (may differ from requested if fallback). */
  lang: Lang;
  /** True if requested zh but only en existed. */
  fellBack: boolean;
}

export function loadDoc(slug: string, lang: Lang): DocLoadResult | undefined {
  const bundle = bundleBySlug.get(slug);
  if (!bundle) return undefined;
  const direct = bundle[lang];
  if (direct) {
    return { content: direct, lang, fellBack: false };
  }
  const other: Lang = lang === "zh" ? "en" : "zh";
  const fallback = bundle[other];
  if (fallback) {
    return { content: fallback, lang: other, fellBack: true };
  }
  return undefined;
}

export function hasSlug(slug: string): boolean {
  return bundleBySlug.has(slug);
}

export function listSlugs(): string[] {
  return Array.from(bundleBySlug.keys()).sort();
}
