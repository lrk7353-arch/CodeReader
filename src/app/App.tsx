import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FilePlus2,
  FolderOpen,
  RefreshCw,
  Settings2,
  Tags,
  ClipboardList,
  ListTodo
} from "lucide-react";
import { FileExplorer } from "../features/file-explorer/FileExplorer";
import { ReadableFileViewer } from "../features/code-viewer/ReadableFileViewer";
import { ExplanationPanel } from "../features/explanation-panel/ExplanationPanel";
import type {
  RelatedNavigationTarget,
  ReviewQueueItem
} from "../features/explanation-panel/CognitionTools";
import { GenerationConfirmDialog } from "../features/explanation-generation/GenerationConfirmDialog";
import { ModelSettingsDialog } from "../features/model-settings/ModelSettingsDialog";
import { PromptRegistryDialog } from "../features/prompt-registry/PromptRegistryDialog";
import { FeedbackReportDialog } from "../features/feedback-report/FeedbackReportDialog";
import { TaskCenter } from "../features/task-center/TaskCenter";
import { getAppCopy } from "./copy";
import { useExplanationContext } from "./hooks/useExplanationContext";
import { useExplanationFeedback } from "./hooks/useExplanationFeedback";
import { useExplanationWriteback } from "./hooks/useExplanationWriteback";
import { useFeedbackReport } from "./hooks/useFeedbackReport";
import { usePromptRegistry } from "./hooks/usePromptRegistry";
import { useUpdateCheck, type UpdateCheckState } from "./hooks/useUpdateCheck";
import { useWorkspaceFiles, type WorkspaceNavigationTarget } from "./hooks/useWorkspaceFiles";
import { useModelWorkflow } from "./hooks/useModelWorkflow";
import { useReaderKnowledge } from "./hooks/useReaderKnowledge";
import type { ErrorAction } from "./appError";
import { MoreMenu, WorkspacePanelSwitcher, type WorkspacePanel } from "./AppNavigation";
import {
  latestRelatedNavigationOrigin,
  pushRelatedNavigationOrigin,
  removeRelatedNavigationOrigin
} from "./relatedNavigationHistory";

export function App() {
  const copy = getAppCopy();
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>("code");
  const [relatedNavigationHistory, setRelatedNavigationHistory] = useState<
    WorkspaceNavigationTarget[]
  >([]);
  const taskCenterButtonRef = useRef<HTMLButtonElement>(null);
  const pathPanelRef = useRef<HTMLElement>(null);
  const codePanelRef = useRef<HTMLElement>(null);
  const explanationPanelRef = useRef<HTMLElement>(null);
  const pathOriginIdRef = useRef("");
  const {
    copyErrorDetail,
    continueRecentProject,
    databasePath,
    displayedProjectGuide,
    expandDirectory,
    filesForExplorer,
    guideFocusToken,
    hydratedExplanations,
    isWorkspaceBusy,
    loadingFileId,
    navigateToExplanation,
    openFile,
    openProject,
    openSampleProject,
    persistenceStatus,
    projectNodes,
    recentProjectName,
    resumeInitializationStatus,
    refreshLoadedFile,
    refreshPersistedProjectGuide,
    selectFile,
    selectedCodeSelection,
    selectedExplanation,
    selectedFile,
    selectedFileForViewer,
    selectExplanation,
    setFiles,
    setReadingStates,
    setSelectedExplanationId,
    setWorkspaceStatus,
    updateSelection,
    workspaceAction,
    workspaceErrorDetail,
    workspaceName,
    workspaceStatus,
    workspaceStatusHistory
  } = useWorkspaceFiles();

  const explanationContext = useExplanationContext(selectedFile, selectedExplanation);
  const writeback = useExplanationWriteback({
    file: selectedFile,
    setFiles,
    setReadingStates,
    setSelectedExplanationId
  });
  const readerKnowledge = useReaderKnowledge({
    file: selectedFile,
    explanation: selectedExplanation,
    setFiles,
    setWorkspaceStatus
  });
  const modelWorkflow = useModelWorkflow({
    file: selectedFile,
    explanation: selectedExplanation,
    contextBundle: explanationContext.bundle,
    contextStatus: explanationContext.status,
    displayMode: readerKnowledge.displayMode,
    onGenerated: writeback.onGenerated,
    onWorkspaceStatus: setWorkspaceStatus
  });

  const feedback = useExplanationFeedback({
    file: selectedFile,
    explanation: selectedExplanation,
    setFiles,
    setReadingStates,
    setWorkspaceStatus,
    refreshPersistedProjectGuide
  });
  const promptRegistry = usePromptRegistry({ onWorkspaceStatus: setWorkspaceStatus });
  const updateCheck = useUpdateCheck();
  const feedbackReport = useFeedbackReport({
    providerType: "openai-compatible",
    providerEndpoint: modelWorkflow.config?.endpoint ?? null,
    providerModel: modelWorkflow.config?.model ?? null,
    providerConfigured: Boolean(modelWorkflow.config?.configured),
    lastWorkspaceError: workspaceErrorDetail
      ? {
          message: workspaceStatus,
          action: workspaceAction,
          detail: workspaceErrorDetail
        }
      : null,
    lastGenerationError: modelWorkflow.generation.lastGeneration
      ? {
          explanationId: modelWorkflow.generation.lastGeneration.explanationId,
          status: modelWorkflow.generation.lastGeneration.status,
          error: modelWorkflow.generation.lastGeneration.error,
          timestamp: modelWorkflow.generation.lastGeneration.timestamp
        }
      : null,
    recentWorkspaceStatus: workspaceStatusHistory
  });

  const fileStatus = useMemo(() => {
    if (selectedFile.capability?.canPreview === false) {
      return { explanation: copy.fileStatus.unpreviewable, reading: copy.fileStatus.dash };
    }
    if (selectedFile.capability?.canExplain === false) {
      return {
        explanation: copy.fileStatus.readonlyPreview,
        reading: copy.fileStatus.dash
      };
    }
    return {
      explanation: copy.explanationStatus[selectedExplanation?.status ?? "valid"],
      reading: selectedExplanation?.readingState ?? "unread"
    };
  }, [copy, selectedExplanation, selectedFile.capability]);
  const restorePathOrigin = () => {
    setActivePanel("path");
    window.requestAnimationFrame(() => {
      const origin = Array.from(document.querySelectorAll<HTMLElement>("[data-path-origin]")).find(
        (element) => element.dataset.pathOrigin === pathOriginIdRef.current
      );
      (origin ?? document.getElementById("workspace-path-tab"))?.focus();
    });
  };
  const changePanel = (panel: WorkspacePanel) => {
    if (panel === "path") {
      restorePathOrigin();
      return;
    }
    setActivePanel(panel);
    const panelRef = {
      path: pathPanelRef,
      code: codePanelRef,
      explanation: explanationPanelRef
    }[panel];
    window.requestAnimationFrame(() => panelRef.current?.focus());
  };
  const currentNavigationTarget = (): WorkspaceNavigationTarget => ({
    projectId: selectedFile.projectId,
    fileId: selectedFile.id,
    explanationId: selectedExplanation?.id,
    startLine: selectedCodeSelection.startLine,
    endLine: selectedCodeSelection.endLine
  });
  const navigateRelated = async (target: RelatedNavigationTarget) => {
    const origin = currentNavigationTarget();
    const moved = await navigateToExplanation({
      projectId: selectedFile.projectId,
      fileId: target.fileId,
      explanationId: target.explanationId,
      startLine: target.startLine,
      endLine: target.endLine,
      targetType: target.targetType
    });
    if (moved) {
      setRelatedNavigationHistory((current) => pushRelatedNavigationOrigin(current, origin));
      changePanel("explanation");
    }
    return moved;
  };
  const navigateReview = async (item: ReviewQueueItem) => {
    await navigateRelated({
      id: `review:${item.fileId}:${item.explanationId}`,
      fileId: item.fileId,
      explanationId: item.explanationId,
      relationKind: "review",
      label: item.label
    });
  };
  const goBackRelated = async () => {
    const origin = latestRelatedNavigationOrigin(relatedNavigationHistory, selectedFile.projectId);
    if (!origin) return;
    const moved = await navigateToExplanation(origin);
    if (moved) {
      setRelatedNavigationHistory((current) => removeRelatedNavigationOrigin(current, origin));
    }
  };
  const continueReading = () => {
    setWorkspaceStatus(
      recentProjectName
        ? `请在原生目录选择器中重新授权“${recentProjectName}”后继续阅读。`
        : "请选择项目目录以继续阅读。"
    );
    void continueRecentProject();
  };
  const showStartScreen = selectedFile.source !== "local";
  const modelHealth = modelWorkflow.settings.connectionTesting
    ? { label: "模型检查中", className: "model-health" }
    : modelWorkflow.settings.connectionResult.startsWith("连接成功")
      ? { label: "模型连接正常", className: "model-health ready" }
      : modelWorkflow.settings.connectionResult.startsWith("连接失败")
        ? { label: "模型连接异常", className: "model-health error" }
        : modelWorkflow.config?.configured
          ? { label: "模型已配置·未检测", className: "model-health" }
          : { label: "模型未配置", className: "model-health" };
  const taskBusy =
    isWorkspaceBusy ||
    modelWorkflow.generation.status === "generating" ||
    updateCheck.state.status === "checking";
  const continueUnavailable = isWorkspaceBusy || resumeInitializationStatus !== "ready";
  const continueLabel =
    resumeInitializationStatus === "loading"
      ? "正在读取最近位置…"
      : resumeInitializationStatus === "error"
        ? "最近位置不可用"
        : "继续阅读";
  return (
    <main className={`app-shell${showStartScreen ? " has-start-screen" : ""}`}>
      <a className="skip-link" href="#workspace-content">
        跳到阅读区
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            CR
          </span>
          <div>
            <h1>{copy.brand.title}</h1>
            <p>{copy.brand.tagline}</p>
          </div>
        </div>
        <div className="topbar-actions" aria-label="Workspace actions">
          <button
            type="button"
            onClick={openProject}
            disabled={isWorkspaceBusy}
            title={copy.actionTitles.openProject}
          >
            <FolderOpen size={16} aria-hidden="true" />
            <span>{copy.actions.openProject}</span>
          </button>
          <button
            type="button"
            onClick={continueReading}
            disabled={continueUnavailable}
            title={
              resumeInitializationStatus === "loading"
                ? "正在从本地数据库读取最近阅读位置"
                : resumeInitializationStatus === "error"
                  ? "最近阅读位置读取失败，请查看状态栏后重新启动"
                  : "继续当前阅读；授权失效时将重新打开原生目录选择器"
            }
          >
            <BookOpen size={16} aria-hidden="true" />
            <span>{continueLabel}</span>
          </button>
          <span
            className={modelHealth.className}
            role="status"
            title={`${modelHealth.label}；详细模型配置位于更多菜单`}
          >
            {modelHealth.label}
          </span>
          <button
            ref={taskCenterButtonRef}
            type="button"
            onClick={() => setTaskCenterOpen((current) => !current)}
            aria-expanded={taskCenterOpen}
            aria-controls="task-center"
            title="查看后台任务"
          >
            <ListTodo size={16} aria-hidden="true" />
            <span>{taskBusy ? "任务进行中" : "任务"}</span>
          </button>
          <MoreMenu
            items={[
              {
                id: "open-file",
                label: copy.actions.openFile,
                icon: <FilePlus2 size={16} aria-hidden="true" />,
                disabled: isWorkspaceBusy,
                onSelect: () => void openFile()
              },
              {
                id: "model-settings",
                label: copy.actions.model,
                icon: <Settings2 size={16} aria-hidden="true" />,
                onSelect: modelWorkflow.settings.openDialog
              },
              {
                id: "prompt-registry",
                label: "Prompt 版本",
                icon: <Tags size={16} aria-hidden="true" />,
                onSelect: promptRegistry.openDialog
              },
              {
                id: "feedback-report",
                label: "脱敏反馈包",
                icon: <ClipboardList size={16} aria-hidden="true" />,
                disabled: feedbackReport.busy,
                onSelect: feedbackReport.preparePreview
              },
              {
                id: "update",
                label:
                  updateCheck.state.status === "checking"
                    ? copy.updates.checking
                    : copy.actions.update,
                icon: (
                  <RefreshCw
                    className={updateCheck.state.status === "checking" ? "spin-icon" : undefined}
                    size={16}
                    aria-hidden="true"
                  />
                ),
                disabled: updateCheck.state.status === "checking",
                onSelect: () => void updateCheck.check()
              }
            ]}
          />
        </div>
        <div className="topbar-status">
          {displayedProjectGuide?.progress.total ? (
            <span
              className="project-progress-summary"
              title={`关键路径掌握：已理解 ${displayedProjectGuide.progress.understood}/${displayedProjectGuide.progress.total}`}
            >
              <span>路径掌握度 {displayedProjectGuide.progress.masteryPercent}%</span>
            </span>
          ) : null}
          <span>{workspaceStatus}</span>
          <WorkspaceStatusAction
            action={workspaceAction}
            hasErrorDetail={Boolean(workspaceErrorDetail)}
            onCopyErrorDetail={copyErrorDetail}
            onOpenModelSettings={modelWorkflow.settings.openDialog}
            onReopenFile={openFile}
            onReopenProject={openProject}
            onRetry={modelWorkflow.generation.request}
          />
          <span>{copy.brand.stageBadge}</span>
        </div>
      </header>

      {showStartScreen ? (
        <section className="project-start" aria-labelledby="project-start-title">
          <div>
            <span className="project-start-eyebrow">从真实项目开始</span>
            <h2 id="project-start-title">继续理解代码，而不是先配置工具</h2>
            <p>本地目录只在原生选择器授权后读取；模型离线时，已有代码和解释仍可查看。</p>
          </div>
          <div className="project-start-actions">
            <button type="button" onClick={continueReading} disabled={continueUnavailable}>
              <BookOpen size={17} aria-hidden="true" />
              {resumeInitializationStatus === "ready"
                ? recentProjectName
                  ? `继续最近项目：${recentProjectName}`
                  : "继续当前阅读"
                : continueLabel}
            </button>
            <button type="button" onClick={openProject} disabled={isWorkspaceBusy}>
              <FolderOpen size={17} aria-hidden="true" />
              打开项目
            </button>
            <button
              type="button"
              onClick={() => {
                void openSampleProject().then(() => changePanel("explanation"));
              }}
              disabled={isWorkspaceBusy}
            >
              <BookOpen size={17} aria-hidden="true" />
              体验可验证示例
            </button>
          </div>
          <p className="project-start-secondary">打开单个文件位于“更多”，适合临时查看。</p>
        </section>
      ) : null}

      <WorkspacePanelSwitcher activePanel={activePanel} onChange={changePanel} />

      <section
        id="workspace-content"
        className="workspace"
        aria-label="CodeReader workspace"
        tabIndex={-1}
      >
        <section
          ref={pathPanelRef}
          id="workspace-path-panel"
          className="workspace-panel"
          role="tabpanel"
          aria-labelledby="workspace-path-tab"
          data-panel="path"
          data-active={activePanel === "path"}
          tabIndex={-1}
          onFocusCapture={(event) => {
            const origin = event.target.closest<HTMLElement>("[data-path-origin]");
            if (origin?.dataset.pathOrigin) pathOriginIdRef.current = origin.dataset.pathOrigin;
          }}
          onClickCapture={(event) => {
            const origin = (event.target as HTMLElement).closest<HTMLElement>("[data-path-origin]");
            if (origin?.dataset.pathOrigin) pathOriginIdRef.current = origin.dataset.pathOrigin;
          }}
          onKeyDown={(event) =>
            event.key === "Escape" && document.getElementById("workspace-path-tab")?.focus()
          }
        >
          <FileExplorer
            files={filesForExplorer}
            guideFocusToken={guideFocusToken}
            projectGuide={displayedProjectGuide}
            projectNodes={projectNodes}
            selectedFileId={selectedFile.id}
            selectedExplanationId={selectedExplanation?.id}
            activeLine={selectedCodeSelection.startLine}
            loadingFileId={loadingFileId}
            workspaceName={workspaceName}
            onSelectFile={selectFile}
            onSelectExplanation={selectExplanation}
            onExpandDirectory={(directoryId) => void expandDirectory(directoryId)}
          />
        </section>
        <section
          ref={codePanelRef}
          id="workspace-code-panel"
          className="workspace-panel"
          role="tabpanel"
          aria-labelledby="workspace-code-tab"
          data-panel="code"
          data-active={activePanel === "code"}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              restorePathOrigin();
            }
          }}
        >
          <ReadableFileViewer
            file={selectedFileForViewer}
            selectedExplanation={selectedExplanation}
            onSelectExplanation={selectExplanation}
            onSelectionChange={updateSelection}
            onRefresh={
              selectedFile.source === "local" && selectedFile.isLoaded
                ? () => void refreshLoadedFile(selectedFile, true)
                : undefined
            }
            refreshBusy={isWorkspaceBusy}
          />
        </section>
        <section
          ref={explanationPanelRef}
          id="workspace-explanation-panel"
          className="workspace-panel"
          role="tabpanel"
          aria-labelledby="workspace-explanation-tab"
          data-panel="explanation"
          data-active={activePanel === "explanation"}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              restorePathOrigin();
            }
          }}
        >
          <ExplanationPanel
            allFiles={filesForExplorer}
            canGoBack={relatedNavigationHistory.some(
              (item) => item.projectId === selectedFile.projectId
            )}
            displayMode={readerKnowledge.displayMode}
            file={selectedFile}
            changeSummary={selectedFile.changeSummary}
            contextBundle={explanationContext.bundle}
            contextError={explanationContext.error}
            contextStatus={explanationContext.status}
            explanation={selectedExplanation}
            generationError={modelWorkflow.generation.error}
            generationStatus={modelWorkflow.generation.status}
            projectGuide={displayedProjectGuide}
            projectName={workspaceName}
            readerBusy={readerKnowledge.busy}
            onAddAnnotation={readerKnowledge.addAnnotation}
            onChangeDisplayMode={readerKnowledge.changeDisplayMode}
            onCopyGenerationError={modelWorkflow.generation.copyError}
            onEditAnnotation={readerKnowledge.editAnnotation}
            onFeedback={feedback.onFeedback}
            onGenerate={modelWorkflow.generation.request}
            onGoBack={goBackRelated}
            onNavigateRelated={navigateRelated}
            onNavigateReview={navigateReview}
            onRemoveAnnotation={readerKnowledge.removeAnnotation}
            onSelectAffected={() => {
              const affected =
                selectedFile.changeSummary?.affectedExplanationIds
                  .map((id) => hydratedExplanations.find((item) => item.id === id))
                  .find(Boolean) ??
                hydratedExplanations.find((item) =>
                  ["stale", "invalid", "new_unexplained", "deleted"].includes(item.status)
                );
              if (affected) {
                selectExplanation(affected.id);
              }
            }}
            onReadingStateChange={feedback.onReadingStateChange}
          />
        </section>
      </section>

      <footer className="statusbar">
        <span>{selectedFile.path}</span>
        <span>
          {selectedCodeSelection.startLine === selectedCodeSelection.endLine
            ? `line:${selectedCodeSelection.startLine}`
            : `lines:${selectedCodeSelection.startLine}-${selectedCodeSelection.endLine}`}
        </span>
        <span>{fileStatus.explanation}</span>
        <span>{fileStatus.reading}</span>
        <span
          className={`persistence-status ${persistenceStatus}`}
          title={databasePath || copy.persistenceTooltip[persistenceStatus]}
        >
          {copy.persistenceLabel[persistenceStatus]}
        </span>
        <span className={modelWorkflow.config?.configured ? "model-ready" : "model-unconfigured"}>
          {modelWorkflow.config?.configured ? modelWorkflow.config.model : copy.model.unconfigured}
        </span>
        <UpdateCheckStatus state={updateCheck.state} copy={copy.updates} />
      </footer>

      <div id="task-center">
        <TaskCenter
          generationStatus={modelWorkflow.generation.status}
          open={taskCenterOpen}
          returnFocusRef={taskCenterButtonRef}
          updateState={updateCheck.state}
          workspaceBusy={isWorkspaceBusy}
          onCancelGeneration={modelWorkflow.generation.cancel}
          onClose={() => setTaskCenterOpen(false)}
          onRetryGeneration={modelWorkflow.generation.request}
          onRetryUpdate={() => void updateCheck.check()}
        />
      </div>

      <ModelSettingsDialog
        busy={modelWorkflow.settings.busy}
        config={modelWorkflow.config}
        connectionResult={modelWorkflow.settings.connectionResult}
        connectionTesting={modelWorkflow.settings.connectionTesting}
        error={modelWorkflow.settings.error}
        open={modelWorkflow.settings.open}
        onClose={modelWorkflow.settings.close}
        onResetConfig={modelWorkflow.settings.clear}
        onSave={modelWorkflow.settings.save}
        onTestConnection={modelWorkflow.settings.testConnection}
      />
      <PromptRegistryDialog
        busy={promptRegistry.busy}
        error={promptRegistry.error}
        open={promptRegistry.open}
        versions={promptRegistry.versions}
        onClose={promptRegistry.close}
        onRefresh={promptRegistry.refresh}
        onRollback={promptRegistry.rollback}
        onUpsert={promptRegistry.upsert}
      />
      <FeedbackReportDialog
        open={feedbackReport.previewOpen}
        report={feedbackReport.lastReport}
        onCancel={feedbackReport.closePreview}
        onCopy={() => {
          void feedbackReport.copyPreparedReport().then((ok) => {
            setWorkspaceStatus(
              ok
                ? "反馈包已复制到剪贴板（已预览并脱敏）。"
                : "反馈包复制失败：剪贴板不可用，请重试。"
            );
          });
        }}
      />
      {modelWorkflow.config && explanationContext.bundle && selectedExplanation ? (
        <GenerationConfirmDialog
          busy={modelWorkflow.generation.status === "generating"}
          config={modelWorkflow.config}
          contextBundle={explanationContext.bundle}
          error={modelWorkflow.generation.error}
          explanation={selectedExplanation}
          open={modelWorkflow.generation.confirmOpen}
          onCancel={modelWorkflow.generation.cancel}
          onConfirm={modelWorkflow.generation.confirm}
        />
      ) : null}
    </main>
  );
}

export function UpdateCheckStatus({
  state,
  copy
}: {
  state: UpdateCheckState;
  copy: ReturnType<typeof getAppCopy>["updates"];
}) {
  if (state.status === "idle" || state.status === "checking") {
    return null;
  }
  if (state.status === "updateAvailable") {
    return (
      <a href={state.releaseUrl} target="_blank" rel="noreferrer">
        {copy.available}: {state.latestVersion}
      </a>
    );
  }
  if (state.status === "upToDate") {
    return (
      <span>
        {copy.upToDate}: {state.currentVersion}
      </span>
    );
  }
  return <span title={state.message}>{copy.unavailable}</span>;
}

export function WorkspaceStatusAction({
  action,
  hasErrorDetail,
  onCopyErrorDetail,
  onOpenModelSettings,
  onReopenFile,
  onReopenProject,
  onRetry
}: {
  action: ErrorAction;
  hasErrorDetail: boolean;
  onCopyErrorDetail: () => void;
  onOpenModelSettings: () => void;
  onReopenFile: () => void;
  onReopenProject: () => void;
  onRetry: () => void;
}) {
  if (action === "openModelSettings") {
    return (
      <button className="workspace-status-action" type="button" onClick={onOpenModelSettings}>
        打开模型设置
      </button>
    );
  }
  if (action === "retry") {
    return (
      <span className="workspace-status-actions">
        <button className="workspace-status-action" type="button" onClick={onRetry}>
          重试
        </button>
        {hasErrorDetail ? (
          <button
            className="workspace-status-action secondary"
            type="button"
            onClick={onCopyErrorDetail}
          >
            复制错误详情
          </button>
        ) : null}
      </span>
    );
  }
  if (action === "checkNetwork") {
    return (
      <span className="workspace-status-actions">
        <button className="workspace-status-action" type="button" onClick={onRetry}>
          重试
        </button>
        {hasErrorDetail ? (
          <button
            className="workspace-status-action secondary"
            type="button"
            onClick={onCopyErrorDetail}
          >
            复制错误详情
          </button>
        ) : null}
      </span>
    );
  }
  if (action === "checkEncoding") {
    return (
      <span className="workspace-status-actions">
        <button className="workspace-status-action" type="button" onClick={onReopenFile}>
          重新选择文件
        </button>
        {hasErrorDetail ? (
          <button
            className="workspace-status-action secondary"
            type="button"
            onClick={onCopyErrorDetail}
          >
            复制错误详情
          </button>
        ) : null}
      </span>
    );
  }
  // For fs.path_resolve_failed / fs.not_a_file / fs.not_a_dir etc., offer
  // re-selecting the project or file.
  if (hasErrorDetail) {
    return (
      <span className="workspace-status-actions">
        <button className="workspace-status-action" type="button" onClick={onReopenProject}>
          重新选择项目
        </button>
        <button className="workspace-status-action" type="button" onClick={onReopenFile}>
          重新选择文件
        </button>
        <button
          className="workspace-status-action secondary"
          type="button"
          onClick={onCopyErrorDetail}
        >
          复制错误详情
        </button>
      </span>
    );
  }
  return null;
}
