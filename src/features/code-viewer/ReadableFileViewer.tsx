import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ComponentProps,
  CSSProperties,
  ElementType,
  KeyboardEvent,
  PointerEvent,
  ReactNode
} from "react";
import type { SampleFile } from "../../types/explanation";
import { MonacoCodeViewer } from "./MonacoCodeViewer";

type Props = ComponentProps<typeof MonacoCodeViewer>;

export function ReadableFileViewer(props: Props) {
  if (props.file.capability?.previewKind === "image") {
    return <ImageViewer file={props.file} />;
  }
  if (props.file.language === "markdown") {
    return <MarkdownViewer {...props} />;
  }
  return <MonacoCodeViewer {...props} />;
}

function ImageViewer({ file }: { file: SampleFile }) {
  return (
    <section className="code-viewer" aria-label="Image viewer">
      <div className="editor-toolbar">
        <span>{file.path}</span>
        <span className="editor-meta">{file.capability?.sizeBytes.toLocaleString()} bytes</span>
      </div>
      <div className="image-preview-stage">
        {file.imageDataUrl ? (
          <img src={file.imageDataUrl} alt={file.name} />
        ) : (
          <p>Image preview is unavailable.</p>
        )}
      </div>
    </section>
  );
}

function MarkdownViewer(props: Props) {
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [outlineWidth, setOutlineWidth] = useState(190);
  const [layoutWidth, setLayoutWidth] = useState(900);
  const layoutRef = useRef<HTMLDivElement>(null);
  const narrowRef = useRef(false);
  const blocks = useMemo(() => parseMarkdown(props.file.code), [props.file.code]);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const narrow = width < 560;
      if (width > 0) {
        setLayoutWidth(width);
        setOutlineWidth((current) =>
          Math.min(Math.max(current, 140), Math.min(360, Math.max(140, width * 0.45)))
        );
      }
      if (narrow && !narrowRef.current) setOutlineVisible(false);
      narrowRef.current = narrow;
    });
    observer.observe(layout);
    return () => observer.disconnect();
  }, []);

  function clampOutlineWidth(next: number) {
    const measuredWidth = layoutRef.current?.clientWidth ?? 0;
    const available = measuredWidth > 0 ? measuredWidth : layoutWidth;
    return Math.min(Math.max(next, 140), Math.min(360, Math.max(140, available * 0.45)));
  }

  const outlineMaximum = Math.round(Math.min(360, Math.max(140, layoutWidth * 0.45)));

  function resizeOutline(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = outlineWidth;
    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      setOutlineWidth(clampOutlineWidth(startWidth + moveEvent.clientX - startX));
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function resizeOutlineWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      setOutlineWidth((current) => clampOutlineWidth(current + direction * 16));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setOutlineWidth(clampOutlineWidth(event.key === "Home" ? 140 : 360));
    }
  }
  if (mode === "source") {
    return (
      <div className="markdown-viewer-shell">
        <ModeSwitch mode={mode} setMode={setMode} />
        <MonacoCodeViewer {...props} />
      </div>
    );
  }
  return (
    <section className="code-viewer markdown-viewer" aria-label="Markdown preview">
      <div className="editor-toolbar">
        <span>{props.file.path}</span>
        <span className="markdown-toolbar-actions">
          <button
            type="button"
            className="markdown-outline-toggle"
            aria-controls="markdown-document-outline"
            aria-expanded={outlineVisible}
            onClick={() => setOutlineVisible((visible) => !visible)}
          >
            {outlineVisible ? (
              <PanelLeftClose size={15} aria-hidden="true" />
            ) : (
              <PanelLeftOpen size={15} aria-hidden="true" />
            )}
            <span>{outlineVisible ? "Hide outline" : "Show outline"}</span>
          </button>
          <ModeSwitch mode={mode} setMode={setMode} />
        </span>
      </div>
      <div
        className="markdown-layout"
        data-outline-visible={outlineVisible}
        ref={layoutRef}
        style={{ "--markdown-outline-width": `${outlineWidth}px` } as CSSProperties}
      >
        {outlineVisible ? (
          <nav id="markdown-document-outline" aria-label="Document outline">
            <strong>Outline</strong>
            {blocks
              .filter((block) => block.kind === "heading")
              .map((block) => (
                <a
                  key={block.id}
                  href={`#${block.id}`}
                  style={{ paddingLeft: `${(block.level ?? 1) * 8}px` }}
                >
                  {block.text}
                </a>
              ))}
          </nav>
        ) : null}
        {outlineVisible ? (
          <div
            className="markdown-outline-resizer"
            role="separator"
            aria-label="Resize document outline"
            aria-controls="markdown-document-outline"
            aria-orientation="vertical"
            aria-valuemin={140}
            aria-valuemax={outlineMaximum}
            aria-valuenow={Math.round(outlineWidth)}
            tabIndex={0}
            onPointerDown={resizeOutline}
            onKeyDown={resizeOutlineWithKeyboard}
          />
        ) : null}
        <article>{blocks.map(renderBlock)}</article>
      </div>
    </section>
  );
}

function ModeSwitch({
  mode,
  setMode
}: {
  mode: "preview" | "source";
  setMode: (mode: "preview" | "source") => void;
}) {
  return (
    <span className="markdown-mode-switch">
      <button
        type="button"
        className={mode === "preview" ? "active" : ""}
        onClick={() => setMode("preview")}
      >
        Preview
      </button>
      <button
        type="button"
        className={mode === "source" ? "active" : ""}
        onClick={() => setMode("source")}
      >
        Source
      </button>
    </span>
  );
}

interface MarkdownBlock {
  kind: "heading" | "paragraph" | "code" | "list";
  text: string;
  id: string;
  level?: number;
}

function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = source.split(/\r?\n/);
  let inCode = false;
  let buffer: string[] = [];
  const flush = (kind: MarkdownBlock["kind"] = "paragraph") => {
    const text = buffer.join(kind === "code" ? "\n" : " ").trim();
    if (text) blocks.push({ kind, text, id: `md-${blocks.length}` });
    buffer = [];
  };
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flush(inCode ? "code" : "paragraph");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      buffer.push(line);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        text: stripRawHtml(heading[2]),
        id: `md-${blocks.length}`,
        level: heading[1].length
      });
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flush();
      blocks.push({
        kind: "list",
        text: stripRawHtml(line.replace(/^\s*[-*+]\s+/, "")),
        id: `md-${blocks.length}`
      });
      continue;
    }
    if (!line.trim()) flush();
    else buffer.push(stripRawHtml(line));
  }
  flush(inCode ? "code" : "paragraph");
  return blocks;
}

function stripRawHtml(text: string) {
  let output = "";
  let insideTag = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "<") {
      const next = text[index + 1] ?? "";
      const code = next.charCodeAt(0);
      const startsTag =
        next === "/" ||
        next === "!" ||
        next === "?" ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      if (!startsTag) {
        output += character;
        continue;
      }
      insideTag = true;
      continue;
    }
    if (insideTag) {
      if (character === ">") insideTag = false;
      continue;
    }
    output += character;
  }
  return output;
}

function renderBlock(block: MarkdownBlock): ReactNode {
  if (block.kind === "heading") {
    const Tag = `h${block.level ?? 1}` as ElementType;
    return (
      <Tag id={block.id} key={block.id}>
        {renderInline(block.text)}
      </Tag>
    );
  }
  if (block.kind === "code")
    return (
      <pre key={block.id}>
        <code>{block.text}</code>
      </pre>
    );
  if (block.kind === "list")
    return (
      <ul key={block.id}>
        <li>{renderInline(block.text)}</li>
      </ul>
    );
  return <p key={block.id}>{renderInline(block.text)}</p>;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const safe = /^https?:\/\//i.test(link[2]);
      return (
        <span
          key={index}
          className="markdown-link"
          title={safe ? `External link: ${link[2]}` : "Unsafe link removed"}
        >
          {link[1]}
        </span>
      );
    }
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}
