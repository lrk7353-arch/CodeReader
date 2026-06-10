import { Braces, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ContextBundle } from "../../types/explanation";

export type ContextPreviewStatus = "unavailable" | "loading" | "ready" | "error";

interface ContextPreviewProps {
  bundle?: ContextBundle;
  error?: string;
  status: ContextPreviewStatus;
}

export function ContextPreview({ bundle, error, status }: ContextPreviewProps) {
  return (
    <details className="context-preview">
      <summary>
        <Braces size={15} aria-hidden="true" />
        上下文预览
        {status === "ready" && bundle ? (
          <span className="context-summary-count">{bundle.snippets.length}</span>
        ) : null}
      </summary>

      {status === "unavailable" ? (
        <p className="context-empty">桌面端 Context Builder 可生成当前目标的上下文。</p>
      ) : null}

      {status === "loading" ? (
        <div className="context-state">
          <LoaderCircle className="spin-icon" size={15} aria-hidden="true" />
          <span>正在构造上下文</span>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="context-state context-error">
          <TriangleAlert size={15} aria-hidden="true" />
          <span>{error ?? "上下文构造失败"}</span>
        </div>
      ) : null}

      {status === "ready" && bundle ? <ContextBundleDetails bundle={bundle} /> : null}
    </details>
  );
}

function ContextBundleDetails({ bundle }: { bundle: ContextBundle }) {
  const signalGroups = [
    ["输入", bundle.signals.inputIdentifiers],
    ["输出", bundle.signals.outputIdentifiers],
    ["调用", bundle.signals.calledFunctions]
  ] as const;

  return (
    <div className="context-content">
      <div className="context-meta">
        <span>{bundle.strategy}</span>
        <span>
          {bundle.budget.usedChars}/{bundle.budget.effectiveMaxChars} chars
        </span>
        <span>{bundle.sources.length} sources</span>
      </div>

      <div className="context-signals">
        {signalGroups.map(([label, values]) =>
          values.length > 0 ? (
            <div className="context-signal-row" key={label}>
              <span>{label}</span>
              <code>{values.join(", ")}</code>
            </div>
          ) : null
        )}
      </div>

      <ol className="context-snippet-list">
        {bundle.snippets.map((snippet) => (
          <li key={snippet.sourceId}>
            <div className="context-snippet-header">
              <strong>{snippet.label}</strong>
              <span>
                {snippet.kind} · {lineLabel(snippet.startLine, snippet.endLine)}
              </span>
            </div>
            <p>{snippet.reason}</p>
            <pre>
              <code>{snippet.code}</code>
            </pre>
          </li>
        ))}
      </ol>

      {bundle.budget.truncated ? (
        <p className="context-warning">
          预算已省略 {bundle.budget.omittedSnippets} 个低优先级片段，当前目标保持完整。
        </p>
      ) : null}

      {bundle.warnings.map((warning) => (
        <p className="context-warning" key={warning}>
          {warning}
        </p>
      ))}
    </div>
  );
}

function lineLabel(startLine: number, endLine: number) {
  return startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;
}
