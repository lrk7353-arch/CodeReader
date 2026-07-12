import { useMemo, useState } from "react";
import type { ComponentProps, ElementType, ReactNode } from "react";
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
  const blocks = useMemo(() => parseMarkdown(props.file.code), [props.file.code]);
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
        <ModeSwitch mode={mode} setMode={setMode} />
      </div>
      <div className="markdown-layout">
        <nav aria-label="Document outline">
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
