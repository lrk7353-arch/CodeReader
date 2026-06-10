import { Send, X } from "lucide-react";
import { useEffect } from "react";
import type { ContextBundle, Explanation, ModelConfig } from "../../types/explanation";

interface GenerationConfirmDialogProps {
  busy: boolean;
  config: ModelConfig;
  contextBundle: ContextBundle;
  error?: string;
  explanation: Explanation;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function GenerationConfirmDialog({
  busy,
  config,
  contextBundle,
  error,
  explanation,
  open,
  onCancel,
  onConfirm
}: GenerationConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={busy ? undefined : onCancel}>
      <section
        className="generation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generation-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <span className="dialog-eyebrow">代码发送确认</span>
            <h2 id="generation-confirm-title">
              {explanation.status === "new_unexplained" || explanation.status === "transient"
                ? "生成当前解释"
                : "重新生成当前解释"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onCancel}
            disabled={busy}
            title="取消发送"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="generation-summary">
          <dl>
            <div>
              <dt>目标</dt>
              <dd>{explanation.targetName ?? explanation.anchorText ?? explanation.targetType}</dd>
            </div>
            <div>
              <dt>模型</dt>
              <dd>{config.model}</dd>
            </div>
            <div>
              <dt>端点</dt>
              <dd>{config.endpoint}</dd>
            </div>
            <div>
              <dt>发送范围</dt>
              <dd>
                {contextBundle.snippets.length} 个片段，{contextBundle.budget.usedChars} 字符
              </dd>
            </div>
          </dl>
          <p>
            仅发送“上下文预览”中的片段和结构信号。完整项目、API Key、SQLite 数据和用户阅读状态不会发送。
          </p>
          {error ? <p className="dialog-error">{error}</p> : null}
        </div>

        <footer className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            <Send size={15} aria-hidden="true" />
            <span>{busy ? "生成中" : "确认发送"}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
