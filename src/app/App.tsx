import { useMemo } from "react";
import { BookOpen, FilePlus2, FolderOpen, Settings2 } from "lucide-react";
import { FileExplorer } from "../features/file-explorer/FileExplorer";
import { MonacoCodeViewer } from "../features/code-viewer/MonacoCodeViewer";
import { ExplanationPanel } from "../features/explanation-panel/ExplanationPanel";
import { GenerationConfirmDialog } from "../features/explanation-generation/GenerationConfirmDialog";
import { ModelSettingsDialog } from "../features/model-settings/ModelSettingsDialog";
import { getAppCopy } from "./copy";
import { useExplanationContext } from "./hooks/useExplanationContext";
import { useExplanationFeedback } from "./hooks/useExplanationFeedback";
import { useExplanationWriteback } from "./hooks/useExplanationWriteback";
import { useWorkspaceFiles } from "./hooks/useWorkspaceFiles";
import { useModelWorkflow } from "./hooks/useModelWorkflow";

export function App() {
  const copy = getAppCopy();
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
        </div>
        <div className="topbar-status">
          <span>{workspaceStatus}</span>
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
