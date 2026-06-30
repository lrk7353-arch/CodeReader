import { useCallback, useMemo } from "react";
import { BookOpen, FilePlus2, FolderOpen, Settings2 } from "lucide-react";
import type {
  Explanation,
  ExplanationFeedbackType,
  GenerateExplanationResult,
  ReadingState
} from "../types/explanation";
import { FileExplorer } from "../features/file-explorer/FileExplorer";
import { MonacoCodeViewer } from "../features/code-viewer/MonacoCodeViewer";
import { ExplanationPanel } from "../features/explanation-panel/ExplanationPanel";
import { GenerationConfirmDialog } from "../features/explanation-generation/GenerationConfirmDialog";
import { ModelSettingsDialog } from "../features/model-settings/ModelSettingsDialog";
import {
  isDesktopRuntime,
  persistExplanationFeedback,
  persistReadingState
} from "../services/desktopWorkspace";
import { errorMessage } from "./appError";
import { useExplanationContext } from "./hooks/useExplanationContext";
import { useWorkspaceFiles, type PersistenceStatus } from "./hooks/useWorkspaceFiles";
import { useModelWorkflow } from "./hooks/useModelWorkflow";

export function App() {
  const {
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
    workspaceName,
    workspaceStatus
  } = useWorkspaceFiles();

  const explanationContext = useExplanationContext(selectedFile, selectedExplanation);
  const handleExplanationGenerated = useCallback(
    (result: GenerateExplanationResult) => {
      setFiles((current) =>
        current.map((file) =>
          file.id === selectedFile.id
            ? {
                ...file,
                explanations: upsertExplanation(file.explanations, result.explanation)
              }
            : file
        )
      );
      setSelectedExplanationId(result.explanation.id);
      setReadingStates((current) => ({
        ...current,
        [result.explanation.id]: result.explanation.readingState
      }));
    },
    [selectedFile.id, setFiles, setReadingStates, setSelectedExplanationId]
  );
  const modelWorkflow = useModelWorkflow({
    file: selectedFile,
    explanation: selectedExplanation,
    contextBundle: explanationContext.bundle,
    contextStatus: explanationContext.status,
    onGenerated: handleExplanationGenerated,
    onWorkspaceStatus: setWorkspaceStatus
  });

  const fileStatus = useMemo(() => {
    if (selectedFile.capability?.canPreview === false) {
      return { explanation: "不可预览", reading: "—" };
    }
    if (selectedFile.capability?.canExplain === false) {
      return { explanation: "只读预览", reading: "—" };
    }
    return {
      explanation: explanationStatusLabel(selectedExplanation?.status ?? "valid"),
      reading: selectedExplanation?.readingState ?? "unread"
    };
  }, [selectedExplanation, selectedFile.capability]);
  async function updateReadingState(state: ReadingState) {
    if (!selectedExplanation) {
      return;
    }
    setReadingStates((current) => ({
      ...current,
      [selectedExplanation.id]: state
    }));
    setFiles((current) =>
      current.map((file) =>
        file.id === selectedFile.id
          ? {
              ...file,
              explanations: file.explanations.map((explanation) =>
                explanation.id === selectedExplanation.id
                  ? { ...explanation, readingState: state }
                  : explanation
              )
            }
          : file
      )
    );

    if (isTransientExplanation(selectedExplanation)) {
      setWorkspaceStatus("临时多行选择状态已更新，仅保存在当前界面。");
      return;
    }

    if (!isDesktopRuntime() || !selectedFile.projectId) {
      setWorkspaceStatus("阅读状态已更新，浏览器预览不写入本地库。");
      return;
    }

    try {
      await persistReadingState(selectedFile.projectId, selectedExplanation.id, state);
      await refreshPersistedProjectGuide(selectedFile.projectId);
      setWorkspaceStatus(
        `阅读状态已保存：${selectedExplanation.targetName ?? selectedExplanation.targetType}`
      );
    } catch (error) {
      setWorkspaceStatus(errorMessage(error));
    }
  }

  async function saveFeedback(feedbackType: ExplanationFeedbackType) {
    if (!selectedExplanation) {
      return;
    }
    if (isTransientExplanation(selectedExplanation)) {
      setWorkspaceStatus("临时多行选择反馈已记录在当前界面，暂不写入 SQLite。");
      return;
    }
    if (!isDesktopRuntime() || !selectedFile.projectId) {
      setWorkspaceStatus("解释反馈已记录在当前预览，桌面端会写入本地库。");
      return;
    }

    try {
      await persistExplanationFeedback(
        selectedFile.projectId,
        selectedExplanation.id,
        feedbackType
      );
      setWorkspaceStatus(`解释反馈已保存：${feedbackType}`);
      if (feedbackType === "regenerate_requested") {
        await persistReadingState(
          selectedFile.projectId,
          selectedExplanation.id,
          "needs_reexplain"
        );
        setReadingStates((current) => ({
          ...current,
          [selectedExplanation.id]: "needs_reexplain"
        }));
        await refreshPersistedProjectGuide(selectedFile.projectId);
      }
    } catch (error) {
      setWorkspaceStatus(errorMessage(error));
    }
  }
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            CR
          </span>
          <div>
            <h1>CodeReader</h1>
            <p>独立桌面代码阅读 IDE</p>
          </div>
        </div>
        <div className="topbar-actions" aria-label="Workspace actions">
          <button
            type="button"
            onClick={() => void openSampleProject()}
            disabled={isWorkspaceBusy}
            title="体验无需 API Key 的三文件示例项目"
          >
            <BookOpen size={16} aria-hidden="true" />
            <span>体验示例</span>
          </button>
          <button
            type="button"
            onClick={openFile}
            disabled={isWorkspaceBusy}
            title="打开单个代码文件"
          >
            <FilePlus2 size={16} aria-hidden="true" />
            <span>打开文件</span>
          </button>
          <button
            type="button"
            onClick={openProject}
            disabled={isWorkspaceBusy}
            title="打开本地项目文件夹"
          >
            <FolderOpen size={16} aria-hidden="true" />
            <span>打开项目</span>
          </button>
          <button type="button" onClick={modelWorkflow.settings.openDialog} title="配置 LLM">
            <Settings2 size={16} aria-hidden="true" />
            <span>模型</span>
          </button>
        </div>
        <div className="topbar-status">
          <span>{workspaceStatus}</span>
          <span>内测 · Beta 1</span>
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
          onFeedback={saveFeedback}
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
          onReadingStateChange={updateReadingState}
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
          title={databasePath || persistenceTooltip(persistenceStatus)}
        >
          {persistenceLabel(persistenceStatus)}
        </span>
        <span className={modelWorkflow.config?.configured ? "model-ready" : "model-unconfigured"}>
          {modelWorkflow.config?.configured ? modelWorkflow.config.model : "模型未配置"}
        </span>
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
function isTransientExplanation(explanation: Explanation) {
  return explanation.status === "transient" || explanation.id.startsWith("range:");
}
function persistenceLabel(status: PersistenceStatus) {
  const labels: Record<PersistenceStatus, string> = {
    preview: "浏览器预览",
    initializing: "本地库初始化中",
    ready: "本地库就绪",
    error: "本地库异常"
  };
  return labels[status];
}

function persistenceTooltip(status: PersistenceStatus) {
  const tooltips: Record<PersistenceStatus, string> = {
    preview: "浏览器预览不创建 SQLite 数据库",
    initializing: "正在创建或打开 CodeReader SQLite 数据库",
    ready: "CodeReader SQLite 数据库已就绪",
    error: "CodeReader SQLite 数据库初始化或写入失败"
  };
  return tooltips[status];
}

function upsertExplanation(explanations: Explanation[], next: Explanation) {
  const existingIndex = explanations.findIndex((explanation) => explanation.id === next.id);
  if (existingIndex === -1) {
    return [...explanations, next];
  }
  return explanations.map((explanation, index) => (index === existingIndex ? next : explanation));
}

function explanationStatusLabel(status: Explanation["status"]) {
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
