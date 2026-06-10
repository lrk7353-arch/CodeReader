import { AlertTriangle, Check, CircleHelp, RefreshCw } from "lucide-react";
import type {
  ContextBundle,
  Explanation,
  ExplanationFeedbackType,
  ReadingState
} from "../../types/explanation";
import { ContextPreview, type ContextPreviewStatus } from "../context-preview/ContextPreview";
import { ReadingStateControls } from "../reading-state/ReadingStateControls";

interface ExplanationPanelProps {
  contextBundle?: ContextBundle;
  contextError?: string;
  contextStatus: ContextPreviewStatus;
  explanation?: Explanation;
  onFeedback: (feedbackType: ExplanationFeedbackType) => void;
  onReadingStateChange: (state: ReadingState) => void;
}

export function ExplanationPanel({
  contextBundle,
  contextError,
  contextStatus,
  explanation,
  onFeedback,
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
        <span className={`status-pill ${explanation.status}`}>{explanation.status}</span>
      </div>

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
          {(explanation.riskNotes ?? []).map((note) => (
            <li key={note}>{note}</li>
          ))}
          {(explanation.readerNotes ?? []).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </details>

      <ContextPreview bundle={contextBundle} error={contextError} status={contextStatus} />

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
        <button type="button" onClick={() => onFeedback("regenerate_requested")} title="请求重新解释">
          <RefreshCw size={16} aria-hidden="true" />
          <span>重新解释</span>
        </button>
      </div>
    </aside>
  );
}
