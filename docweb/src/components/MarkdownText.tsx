import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Props {
  content: string;
  className?: string;
}

// Lightweight markdown renderer for short bodies of streaming text. Unlike
// MarkdownView (used for full doc pages), this skips heading anchors, copy
// buttons, and internal-link rewriting — it's tuned for AI-chat bubbles
// where the content is one short reply per render.
const COMPONENTS: Components = {
  a({ href, children, ...rest }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...rest}>
        {children}
      </a>
    );
  },
};

export default function MarkdownText({ content, className }: Props) {
  return (
    <div className={className ? `markdown-body ${className}` : "markdown-body"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
