import { AlertTriangle, Check, CircleHelp, RefreshCw } from "lucide-react";
import type {
  ChangeSummary as ChangeSummaryData,
  ContextBundle,
  Explanation,
  ExplanationFeedbackType,
  ReadingState
} from "../../types/explanation";
import { ContextPreview, type ContextPreviewStatus } from "../context-preview/ContextPreview";
import { ChangeSummary } from "../change-summary/ChangeSummary";
import { ReadingStateControls } from "../reading-state/ReadingStateControls";

interface ExplanationPanelProps {
  contextBundle?: ContextBundle;
  changeSummary?: ChangeSummaryData;
  contextError?: string;
  contextStatus: ContextPreviewStatus;
  explanation?: Explanation;
  generationError?: string;
  generationStatus: "idle" | "generating" | "error";
  onFeedback: (feedbackType: ExplanationFeedbackType) => void;
  onGenerate: () => void;
  onSelectAffected: () => void;
  onReadingStateChange: (state: ReadingState) => void;
}

export function ExplanationPanel({
  contextBundle,
  changeSummary,
  contextError,
  contextStatus,
  explanation,
  generationError,
  generationStatus,
  onFeedback,
  onGenerate,
  onSelectAffected,
  onReadingStateChange
}: ExplanationPanelProps) {
  if (!explanation) {
    return (
      <aside className="explanation-panel">
        <div className="panel-title">Explanation</div>
      </aside>
    );
  }

  return (
    <aside className="explanation-panel" aria-label="Explanation">
      <div className="explanation-header">
        <div>
          <span className="target-type">{explanation.targetType}</span>
          <h2>{explanation.targetName ?? explanation.anchorText ?? explanation.filePath}</h2>
        </div>
        <span className={`status-pill ${explanation.status}`}>{statusLabel(explanation.status)}</span>
      </div>

      {changeSummary ? (
        <ChangeSummary summary={changeSummary} onSelectAffected={onSelectAffected} />
      ) : null}

      <StatusNotice explanation={explanation} />

      <div className="meaning-stack">
        <section className="meaning-section">
          <h3>代码层意义</h3>
          <p>{explanation.codeMeaning}</p>
        </section>
        <section className="meaning-section">
          <h3>局部组成意义</h3>
          <p>{explanation.localMeaning ?? "当前目标暂无局部解释。"}</p>
        </section>
        <section className="meaning-section">
          <h3>项目全局意义</h3>
          <p>{explanation.globalMeaning ?? "当前目标暂无项目级解释。"}</p>
        </section>
      </div>

      <details className="detail-drawer">
        <summary>
          <AlertTriangle size={15} aria-hidden="true" />
          风险与阅读提示
        </summary>
        <ul>
          {explanation.priorKnowledge ? <li>前置知识：{explanation.priorKnowledge}</li> : null}
          {(explanation.riskNotes ?? []).map((note) => (
            <li key={note}>{note}</li>
          ))}
          {(explanation.readerNotes ?? []).map((note) => (
            <li key={note}>{note}</li>
          ))}
          {explanation.reviewSuggestion ? <li>审阅建议：{explanation.reviewSuggestion}</li> : null}
        </ul>
      </details>

      {explanation.trustReason ? (
        <details className="detail-drawer">
          <summary>
            <CircleHelp size={15} aria-hidden="true" />
            可信提示与相关行
          </summary>
          <div className="trust-detail">
            <strong>{trustLabel(explanation.trustLabel)}</strong>
            <p>{explanation.trustReason}</p>
            <RelatedLines label="依赖" lines={explanation.dependsOnLines} />
            <RelatedLines label="影响" lines={explanation.affectsLines} />
          </div>
        </details>
      ) : null}

      <ContextPreview bundle={contextBundle} error={contextError} status={contextStatus} />

      {generationError ? <p className="generation-error">{generationError}</p> : null}

      <ReadingStateControls currentState={explanation.readingState} onChange={onReadingStateChange} />

      <div className="action-row" aria-label="Explanation actions">
        <button type="button" onClick={() => onFeedback("helpful")} title="这条解释有帮助">
          <Check size={16} aria-hidden="true" />
          <span>有帮助</span>
        </button>
        <button type="button" onClick={() => onFeedback("suspicious")} title="这条解释不对劲">
          <CircleHelp size={16} aria-hidden="true" />
          <span>不对劲</span>
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={
            explanation.status === "deleted" ||
            generationStatus === "generating" ||
            contextStatus !== "ready"
          }
          title={explanation.status === "new_unexplained" ? "生成当前解释" : "重新生成当前解释"}
        >
          <RefreshCw
            className={generationStatus === "generating" ? "spin-icon" : undefined}
            size={16}
            aria-hidden="true"
          />
          <span>
            {generationStatus === "generating"
              ? "生成中"
              : explanation.status === "deleted"
                ? "代码已删除"
                : explanation.status === "new_unexplained" || explanation.status === "transient"
                ? "生成解释"
                : explanation.status === "stale" || explanation.status === "invalid"
                  ? "更新解释"
                  : "重新解释"}
          </span>
        </button>
      </div>
    </aside>
  );
}

function StatusNotice({ explanation }: { explanation: Explanation }) {
  const notices: Partial<Record<Explanation["status"], string>> = {
    stale: "相关上下文发生变化，这条解释可能需要复核。",
    invalid: "目标代码已经变化，旧解释仅供对照，请更新当前解释。",
    new_unexplained: "这是新增结构，尚未生成解释。",
    deleted: "原目标代码已经删除，这条解释作为历史记录保留。"
  };
  const notice = notices[explanation.status];
  return notice ? <p className={`explanation-status-notice ${explanation.status}`}>{notice}</p> : null;
}

function RelatedLines({ label, lines }: { label: string; lines?: number[] }) {
  if (!lines?.length) {
    return null;
  }
  return (
    <div className="related-lines">
      <span>{label}</span>
      <code>{lines.map((line) => `L${line}`).join(", ")}</code>
    </div>
  );
}

function trustLabel(label?: Explanation["trustLabel"]) {
  const labels = {
    clear: "解释相对明确",
    context_needed: "这里依赖更多上下文",
    review_recommended: "建议重点检查"
  };
  return label ? labels[label] : "可信提示";
}

function statusLabel(status: Explanation["status"]) {
  const labels: Record<Explanation["status"], string> = {
    valid: "有效",
    stale: "可能过期",
    invalid: "已过期",
    new_unexplained: "新增未解释",
    deleted: "已删除",
    transient: "临时选择"
  };
  return labels[status];
}
