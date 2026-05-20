import { useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";
import { App as AntdApp } from "antd";
import { useTranslation } from "react-i18next";
import { hasSlug } from "../docs/loader";

interface Props {
  content: string;
}

const INTERNAL_MD = /^(?:\.\/)?([\w-]+)(?:\.zh)?\.md(#.*)?$/;

export default function MarkdownView({ content }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation("common");
  const { message } = AntdApp.useApp();

  const components = useMemo<Components>(
    () => ({
      a(props) {
        const { href, children, node: _node, ...rest } = props;
        void _node;
        if (href) {
          const match = href.match(INTERNAL_MD);
          if (match && hasSlug(match[1])) {
            const target = `/docs/${match[1]}${match[2] ?? ""}`;
            return (
              <a
                href={target}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(target);
                }}
              >
                {children}
              </a>
            );
          }
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" {...rest}>
            {children}
          </a>
        );
      },
    }),
    [navigate],
  );

  // Attach copy buttons to every <pre> after render
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const blocks = Array.from(root.querySelectorAll("pre"));
    const cleaners: Array<() => void> = [];
    for (const pre of blocks) {
      if (pre.querySelector(".copy-btn")) continue;
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.type = "button";
      btn.textContent = t("actions.copy");
      const onClick = () => {
        const code = pre.querySelector("code");
        const text = code ? code.textContent ?? "" : pre.textContent ?? "";
        void navigator.clipboard.writeText(text).then(() => {
          btn.textContent = t("actions.copied");
          message.success(t("actions.copied"));
          window.setTimeout(() => {
            btn.textContent = t("actions.copy");
          }, 1200);
        });
      };
      btn.addEventListener("click", onClick);
      pre.appendChild(btn);
      cleaners.push(() => {
        btn.removeEventListener("click", onClick);
        btn.remove();
      });
    }
    return () => {
      for (const c of cleaners) c();
    };
  }, [content, t, message]);

  return (
    <div ref={containerRef} className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "append",
              properties: { className: "anchor", ariaHidden: true },
              content: { type: "text", value: "#" },
            },
          ],
          [rehypeHighlight, { ignoreMissing: true }],
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
