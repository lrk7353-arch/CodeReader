import { useMemo } from "react";
import {
  BookOpen,
  FilePlus2,
  FolderOpen,
  RefreshCw,
  Settings2,
  Tags,
  ClipboardList
} from "lucide-react";
import { FileExplorer } from "../features/file-explorer/FileExplorer";
import { MonacoCodeViewer } from "../features/code-viewer/MonacoCodeViewer";
import { ExplanationPanel } from "../features/explanation-panel/ExplanationPanel";
import { GenerationConfirmDialog } from "../features/explanation-generation/GenerationConfirmDialog";
import { ModelSettingsDialog } from "../features/model-settings/ModelSettingsDialog";
import { PromptRegistryDialog } from "../features/prompt-registry/PromptRegistryDialog";
import { getAppCopy } from "./copy";
import { useExplanationContext } from "./hooks/useExplanationContext";
import { useExplanationFeedback } from "./hooks/useExplanationFeedback";
import { useExplanationWriteback } from "./hooks/useExplanationWriteback";
import { useFeedbackReport } from "./hooks/useFeedbackReport";
import { useProjectProgress } from "./hooks/useProjectProgress";
import { usePromptRegistry } from "./hooks/usePromptRegistry";
import { useUpdateCheck, type UpdateCheckState } from "./hooks/useUpdateCheck";
import { useWorkspaceFiles } from "./hooks/useWorkspaceFiles";
import { useModelWorkflow } from "./hooks/useModelWorkflow";
import type { ErrorAction } from "./appError";

export function App() {
  const copy = getAppCopy();
  const {
    copyErrorDetail,
    databasePath,
    displayedProjectGuide,
    filesForExplorer,
    guideFocusToken,
    hydratedExplanations,
    isWorkspaceBusy,
    loadingFileId,
    openFile,
    openProject,
    openSampleProject,
    persistenceStatus,
    projectNodes,
    readingStates,
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
  const modelWorkflow = useModelWorkflow({
    file: selectedFile,
    explanation: selectedExplanation,
    contextBundle: explanationContext.bundle,
    contextStatus: explanationContext.status,
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
  const projectProgress = useProjectProgress(filesForExplorer, readingStates);
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
  return (
    <main className="app-shell">
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
            onClick={() => void openSampleProject()}
            disabled={isWorkspaceBusy}
            title={copy.actionTitles.sample}
          >
            <BookOpen size={16} aria-hidden="true" />
            <span>{copy.actions.sample}</span>
          </button>
          <button
            type="button"
            onClick={openFile}
            disabled={isWorkspaceBusy}
            title={copy.actionTitles.openFile}
          >
            <FilePlus2 size={16} aria-hidden="true" />
            <span>{copy.actions.openFile}</span>
          </button>
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
            onClick={modelWorkflow.settings.openDialog}
            title={copy.actionTitles.model}
          >
            <Settings2 size={16} aria-hidden="true" />
            <span>{copy.actions.model}</span>
          </button>
          <button type="button" onClick={promptRegistry.openDialog} title="Prompt 版本管理">
            <Tags size={16} aria-hidden="true" />
            <span>Prompt 版本</span>
          </button>
          <button
            type="button"
            onClick={() => void feedbackReport.copyReport()}
            disabled={feedbackReport.busy}
            title="导出脱敏反馈包到剪贴板"
          >
            <ClipboardList size={16} aria-hidden="true" />
            <span>反馈包</span>
          </button>
          <button
            type="button"
            onClick={() => void updateCheck.check()}
            disabled={updateCheck.state.status === "checking"}
            title={copy.actionTitles.update}
          >
            <RefreshCw
              className={updateCheck.state.status === "checking" ? "spin-icon" : undefined}
              size={16}
              aria-hidden="true"
            />
            <span>
              {updateCheck.state.status === "checking"
                ? copy.updates.checking
                : copy.actions.update}
            </span>
          </button>
        </div>
        <div className="topbar-status">
          {projectProgress.totalExplanations > 0 ? (
            <span
              className="project-progress-summary"
              title={`已解释文件 ${projectProgress.explainedFiles}/${projectProgress.totalFiles}，已读节点 ${projectProgress.readExplanations}/${projectProgress.totalExplanations}，已理解 ${projectProgress.understoodExplanations}`}
            >
              <span>进度 {projectProgress.completionPercent}%</span>
              {projectProgress.lastReadFileId ? (
                <button
                  type="button"
                  className="continue-reading-button"
                  onClick={() => selectFile(projectProgress.lastReadFileId!)}
                  title="继续上次阅读"
                >
                  继续阅读
                </button>
              ) : null}
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

      <section className="workspace" aria-label="CodeReader workspace">
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
        />
        <MonacoCodeViewer
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
        <ExplanationPanel
          file={selectedFile}
          changeSummary={selectedFile.changeSummary}
          contextBundle={explanationContext.bundle}
          contextError={explanationContext.error}
          contextStatus={explanationContext.status}
          explanation={selectedExplanation}
          generationError={modelWorkflow.generation.error}
          generationStatus={modelWorkflow.generation.status}
          onCopyGenerationError={modelWorkflow.generation.copyError}
          onFeedback={feedback.onFeedback}
          onGenerate={modelWorkflow.generation.request}
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

      <ModelSettingsDialog
        busy={modelWorkflow.settings.busy}
        config={modelWorkflow.config}
        error={modelWorkflow.settings.error}
        open={modelWorkflow.settings.open}
        onClose={modelWorkflow.settings.close}
        onResetConfig={modelWorkflow.settings.clear}
        onSave={modelWorkflow.settings.save}
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
