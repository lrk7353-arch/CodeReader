import { useEffect, useRef } from "react";
import { CircleCheck, CircleX, LoaderCircle, RotateCcw, X, XCircle } from "lucide-react";
import type { GenerationStatus } from "../../app/hooks/useModelWorkflow";
import type { UpdateCheckState } from "../../app/hooks/useUpdateCheck";

interface TaskCenterProps {
  generationStatus: GenerationStatus;
  open: boolean;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  updateState: UpdateCheckState;
  workspaceBusy: boolean;
  onCancelGeneration: () => void;
  onClose: () => void;
  onRetryGeneration: () => void;
  onRetryUpdate: () => void;
}

export function TaskCenter({
  generationStatus,
  open,
  returnFocusRef,
  updateState,
  workspaceBusy,
  onCancelGeneration,
  onClose,
  onRetryGeneration,
  onRetryUpdate
}: TaskCenterProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) returnFocusRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, returnFocusRef]);

  if (!open) return null;

  const hasTask =
    workspaceBusy ||
    generationStatus !== "idle" ||
    !["idle", "upToDate"].includes(updateState.status);

  return (
    <aside
      className="task-center"
      role="dialog"
      aria-modal="false"
      aria-labelledby="task-center-title"
    >
      <header>
        <div>
          <strong id="task-center-title">任务中心</strong>
          <span aria-live="polite">集中查看后台操作，并取消或重试可恢复任务</span>
        </div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭任务中心">
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      <div className="task-center-list">
        {!hasTask ? <p className="task-center-empty">当前没有后台任务。</p> : null}
        {workspaceBusy ? (
          <TaskRow icon="busy" title="读取工作区" detail="正在安全读取或刷新文件，请稍候。" />
        ) : null}
        {generationStatus === "generating" ? (
          <TaskRow
            icon="busy"
            title="生成解释"
            detail="正在等待模型返回；取消后，迟到的结果不会写入当前页面。"
            action={
              <button type="button" onClick={onCancelGeneration}>
                <XCircle size={14} aria-hidden="true" /> 取消
              </button>
            }
          />
        ) : null}
        {generationStatus === "error" ? (
          <TaskRow
            icon="error"
            title="生成解释失败"
            detail="任务未写入结果，可以检查设置后重试。"
            action={
              <button type="button" onClick={onRetryGeneration}>
                <RotateCcw size={14} aria-hidden="true" /> 重试
              </button>
            }
          />
        ) : null}
        {updateState.status === "checking" ? (
          <TaskRow icon="busy" title="检查更新" detail="正在查询官方 GitHub Release。" />
        ) : null}
        {updateState.status === "unavailable" ? (
          <TaskRow
            icon="error"
            title="检查更新失败"
            detail={updateState.message}
            action={
              <button type="button" onClick={onRetryUpdate}>
                <RotateCcw size={14} aria-hidden="true" /> 重试
              </button>
            }
          />
        ) : null}
        {updateState.status === "updateAvailable" ? (
          <TaskRow
            icon="done"
            title="发现新版本"
            detail={`可更新到 ${updateState.latestVersion}。`}
          />
        ) : null}
      </div>
    </aside>
  );
}

function TaskRow({
  action,
  detail,
  icon,
  title
}: {
  action?: React.ReactNode;
  detail: string;
  icon: "busy" | "done" | "error";
  title: string;
}) {
  const Icon = icon === "busy" ? LoaderCircle : icon === "done" ? CircleCheck : CircleX;
  return (
    <section className={`task-row ${icon}`}>
      <Icon className={icon === "busy" ? "spin-icon" : undefined} size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {action ? <div className="task-row-action">{action}</div> : null}
    </section>
  );
}
