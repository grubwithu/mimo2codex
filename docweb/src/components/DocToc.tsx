import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

interface Props {
  /** Markdown content — used as a trigger for re-extraction; not parsed. */
  content: string;
}

export default function DocToc({ content }: Props) {
  const { t } = useTranslation("docs");
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Extract headings from the rendered DOM (relies on rehype-slug ids).
  useEffect(() => {
    let cancelled = false;
    const extract = () => {
      if (cancelled) return;
      const root = document.querySelector(".markdown-body");
      if (!root) return;
      const nodes = root.querySelectorAll<HTMLElement>("h2[id], h3[id]");
      const next: TocItem[] = [];
      nodes.forEach((node) => {
        const level = node.tagName === "H2" ? 2 : 3;
        const text =
          node.firstChild?.textContent?.trim() ?? node.textContent?.trim() ?? "";
        next.push({ id: node.id, text, level: level as 2 | 3 });
      });
      setItems(next);
    };
    // Defer to next tick so ReactMarkdown has committed.
    const id = window.requestAnimationFrame(() => {
      extract();
      // One more pass after a small delay to catch late-mounted plugins.
      window.setTimeout(extract, 50);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [content]);

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId((visible[0].target as HTMLElement).id);
        }
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );
    const observed: Element[] = [];
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) {
        observer.observe(el);
        observed.push(el);
      }
    }
    return () => {
      for (const el of observed) observer.unobserve(el);
      observer.disconnect();
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <aside className="docs-toc">
      <div className="toc-title">{t("toc")}</div>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={[
            item.level === 3 ? "h3" : "",
            activeId === item.id ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            activeId === item.id
              ? {
                  borderLeftColor: "var(--brand)",
                  color: "var(--brand)",
                  fontWeight: 500,
                }
              : undefined
          }
        >
          {item.text}
        </a>
      ))}
    </aside>
  );
}
