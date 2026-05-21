import { useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

interface MilkdownFieldProps {
  /** Initial markdown — read once on mount. Subsequent prop changes are ignored
   *  (Crepe is uncontrolled internally; remounting on key change is the
   *  escape hatch if you really need to reset its content). */
  value?: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  /** Min editing height in px. Wrap your form item — Crepe doesn't take a
   *  height prop directly, we just set min-height on the host div. */
  minHeight?: number;
}

// MilkdownField is a thin Crepe wrapper that fits into an antd Form via
// valuePropName="value" + getValueFromEvent. Crepe gives us a Prosemirror
// WYSIWYG editor where typing `# heading` immediately renders as a heading,
// `**bold**` becomes bold, etc. — edit and render share the SAME area
// (unlike split-pane markdown editors). No English toolbar to translate
// because Crepe uses slash menus and inline styling instead of a toolbar.
function MilkdownInner({
  value,
  onChange,
  placeholder,
  minHeight = 280,
}: MilkdownFieldProps) {
  // Track the latest defaultValue at mount time. We capture it via ref so the
  // useEditor callback (which only fires once) doesn't pick up a stale value
  // if React re-renders before Crepe spins up.
  const initialRef = useRef(value ?? "");

  useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: initialRef.current,
        featureConfigs: placeholder
          ? {
              [Crepe.Feature.Placeholder]: {
                text: placeholder,
                mode: "doc" as const,
              },
            }
          : undefined,
      });
      crepe.on((api) => {
        api.markdownUpdated((_ctx, markdown) => {
          onChange?.(markdown);
        });
      });
      return crepe;
    },
    // Re-init only if onChange identity changes meaningfully. Keep deps
    // minimal — Crepe state lives in its own instance, not in React.
    [],
  );

  return (
    <div
      className="milkdown-field"
      style={{
        border: "1px solid #d9d9d9",
        borderRadius: 6,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Header strip — mirrors the "toolbar on top, editor below" look from
          MDEditor. Even without clickable toolbar buttons (Milkdown's WYSIWYG
          uses inline rules + slash menu instead), this strip anchors the eye
          and signals "this is a rich text area" rather than a plain box. */}
      <div className="milkdown-field-header">
        <span className="milkdown-field-dot" />
        <span className="milkdown-field-dot" />
        <span className="milkdown-field-dot" />
        <span className="milkdown-field-hint">
          Markdown · 输入 <code>#</code> 加标题，<code>**</code> 加粗，<code>/</code> 打开命令
        </span>
      </div>
      <div
        className="milkdown-field-body"
        style={{ minHeight, overflow: "auto" }}
      >
        <Milkdown />
      </div>
    </div>
  );
}

// MilkdownField exports the Provider-wrapped editor so callers don't have to
// remember to mount MilkdownProvider themselves.
export default function MilkdownField(props: MilkdownFieldProps) {
  return (
    <MilkdownProvider>
      <MilkdownInner {...props} />
    </MilkdownProvider>
  );
}
