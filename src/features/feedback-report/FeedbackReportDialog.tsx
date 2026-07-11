import { ClipboardCheck, X } from "lucide-react";
import { useEffect } from "react";
import type { FeedbackReport } from "../../app/hooks/useFeedbackReport";

interface FeedbackReportDialogProps {
  open: boolean;
  report: FeedbackReport | null;
  onCancel: () => void;
  onCopy: () => void;
}

export function FeedbackReportDialog({
  open,
  report,
  onCancel,
  onCopy
}: FeedbackReportDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, open]);

  if (!open || !report) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="feedback-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-report-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <span className="dialog-eyebrow">复制前隐私确认</span>
            <h2 id="feedback-report-title">预览脱敏反馈包</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} title="关闭预览">
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <p className="feedback-report-note">
          请确认内容不含不希望分享的信息。只有点击“确认并复制”后才会写入剪贴板。
        </p>
        <pre className="feedback-report-preview" tabIndex={0}>
          {JSON.stringify(report, null, 2)}
        </pre>
        <footer className="dialog-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <span className="dialog-action-spacer" />
          <button className="primary-button" type="button" onClick={onCopy} autoFocus>
            <ClipboardCheck size={15} aria-hidden="true" />
            <span>确认并复制</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
