import { useCallback, useMemo, useState } from "react";
import { FilePlus2, FolderOpen } from "lucide-react";
import { sampleFiles } from "../data/sampleProject";
import type {
  CodeFile,
  Explanation,
  ExplanationFeedbackType,
  ProjectScanResult,
  ReadingState
} from "../types/explanation";
import { FileExplorer } from "../features/file-explorer/FileExplorer";
import { MonacoCodeViewer, type CodeSelection } from "../features/code-viewer/MonacoCodeViewer";
import { ExplanationPanel } from "../features/explanation-panel/ExplanationPanel";
import { buildSelectableExplanations } from "../features/explanations/selectableExplanations";
import {
  isDesktopRuntime,
  hydrateCodeFilePersistence,
  loadCodeFile,
  pickAndLoadCodeFile,
  pickAndScanProject,
  persistExplanationFeedback,
  persistReadingState
} from "../services/desktopWorkspace";

export function App() {
  const [files, setFiles] = useState<CodeFile[]>(sampleFiles);
  const [selectedFileId, setSelectedFileId] = useState(files[0]?.id ?? "");
  const [selectedExplanationId, setSelectedExplanationId] = useState("exp-file-login-controller");
  const [selectedCodeSelection, setSelectedCodeSelection] = useState<CodeSelection>({
    startLine: 1,
    endLine: 1
  });
  const [readingStates, setReadingStates] = useState<Record<string, ReadingState>>({});
  const [workspaceStatus, setWorkspaceStatus] = useState("示例工作区");
  const [isWorkspaceBusy, setIsWorkspaceBusy] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? files[0] ?? sampleFiles[0],
    [files, selectedFileId]
  );

  const selectableExplanations = useMemo(() => buildSelectableExplanations(selectedFile), [selectedFile]);

  const hydratedExplanations = useMemo(
    () =>
      selectableExplanations.map((explanation) => ({
        ...explanation,
        readingState: readingStates[explanation.id] ?? explanation.readingState
      })),
    [readingStates, selectableExplanations]
  );

  const selectedExplanation = useMemo<Explanation | undefined>(() => {
    return (
      hydratedExplanations.find((item) => item.id === selectedExplanationId) ?? hydratedExplanations[0]
    );
  }, [hydratedExplanations, selectedExplanationId]);

  const selectedFileForViewer = useMemo<CodeFile>(
    () => ({
      ...selectedFile,
      explanations: hydratedExplanations
    }),
    [hydratedExplanations, selectedFile]
  );

  const filesForExplorer = useMemo(
    () => files.map((file) => (file.id === selectedFile.id ? selectedFileForViewer : file)),
    [files, selectedFile.id, selectedFileForViewer]
  );

  const selectExplanation = useCallback(
    (explanationId: string) => {
      const explanation = hydratedExplanations.find((item) => item.id === explanationId);
      setSelectedExplanationId((current) => (current === explanationId ? current : explanationId));
      const nextSelection = explanation?.startLine
        ? {
          startLine: explanation.startLine,
          endLine: explanation.endLine ?? explanation.startLine
        }
        : { startLine: 1, endLine: 1 };
      setSelectedCodeSelection((current) => (sameSelection(current, nextSelection) ? current : nextSelection));
    },
    [hydratedExplanations]
  );

  const setActiveLoadedFile = useCallback((file: CodeFile) => {
    setSelectedFileId(file.id);
    const explanations = buildSelectableExplanations(file);
    setSelectedExplanationId(explanations[0]?.id ?? "");
    setSelectedCodeSelection({ startLine: 1, endLine: 1 });
  }, []);

  const hydrateLoadedFile = useCallback(async (file: CodeFile) => {
    const seedExplanations = buildSelectableExplanations(file);
    if (!isDesktopRuntime()) {
      return {
        ...file,
        explanations: seedExplanations
      };
    }
    return hydrateCodeFilePersistence(file, seedExplanations);
  }, []);

  const upsertFile = useCallback((file: CodeFile) => {
    setFiles((current) => {
      const existingIndex = current.findIndex((item) => item.id === file.id || item.path === file.path);
      if (existingIndex === -1) {
        return [file, ...current];
      }
      return current.map((item, index) => (index === existingIndex ? file : item));
    });
  }, []);

  const loadAndSelectFile = useCallback(
    async (path: string, relativePath?: string, placeholderId?: string, projectRoot?: string) => {
      setIsWorkspaceBusy(true);
      setLoadingFileId(placeholderId ?? null);
      setWorkspaceStatus(`正在加载 ${relativePath ?? path}`);
      try {
        const loadedFile = await loadCodeFile(path, projectRoot);
        const file = await hydrateLoadedFile({
          ...loadedFile,
          projectRoot: projectRoot ?? loadedFile.projectRoot,
          relativePath: relativePath ?? loadedFile.relativePath
        });
        upsertFile(file);
        setActiveLoadedFile(file);
        setWorkspaceStatus(`已加载 ${file.relativePath ?? file.path}`);
      } catch (error) {
        setWorkspaceStatus(errorMessage(error));
      } finally {
        setIsWorkspaceBusy(false);
        setLoadingFileId(null);
      }
    },
    [hydrateLoadedFile, setActiveLoadedFile, upsertFile]
  );

  const selectFile = useCallback(
    (fileId: string) => {
      const file = files.find((item) => item.id === fileId) ?? files[0] ?? sampleFiles[0];
      if (file.source === "local" && !file.isLoaded) {
        void loadAndSelectFile(file.path, file.relativePath, file.id, file.projectRoot);
        return;
      }
      setActiveLoadedFile(file);
    },
    [files, loadAndSelectFile, setActiveLoadedFile]
  );

  const updateSelection = useCallback((selection: CodeSelection) => {
    setSelectedCodeSelection(selection);
  }, []);

  async function updateReadingState(state: ReadingState) {
    if (!selectedExplanation) {
      return;
    }
    setReadingStates((current) => ({
      ...current,
      [selectedExplanation.id]: state
    }));

    if (!isDesktopRuntime() || !selectedFile.projectId) {
      setWorkspaceStatus("阅读状态已更新，浏览器预览不写入本地库。");
      return;
    }

    try {
      await persistReadingState(selectedFile.projectId, selectedExplanation.id, state);
      setWorkspaceStatus(`阅读状态已保存：${selectedExplanation.targetName ?? selectedExplanation.targetType}`);
    } catch (error) {
      setWorkspaceStatus(errorMessage(error));
    }
  }

  async function saveFeedback(feedbackType: ExplanationFeedbackType) {
    if (!selectedExplanation) {
      return;
    }
    if (!isDesktopRuntime() || !selectedFile.projectId) {
      setWorkspaceStatus("解释反馈已记录在当前预览，桌面端会写入本地库。");
      return;
    }

    try {
      await persistExplanationFeedback(selectedFile.projectId, selectedExplanation.id, feedbackType);
      setWorkspaceStatus(`解释反馈已保存：${feedbackType}`);
      if (feedbackType === "regenerate_requested") {
        await persistReadingState(selectedFile.projectId, selectedExplanation.id, "needs_reexplain");
        setReadingStates((current) => ({
          ...current,
          [selectedExplanation.id]: "needs_reexplain"
        }));
      }
    } catch (error) {
      setWorkspaceStatus(errorMessage(error));
    }
  }

  async function openFile() {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus("本地文件打开需要在 Tauri 桌面端运行。");
      return;
    }
    setIsWorkspaceBusy(true);
    try {
      const file = await pickAndLoadCodeFile();
      if (!file) {
        setWorkspaceStatus("已取消打开文件");
        return;
      }
      const hydratedFile = await hydrateLoadedFile(file);
      setFiles([hydratedFile]);
      setActiveLoadedFile(hydratedFile);
      setWorkspaceStatus(`已加载 ${hydratedFile.path}`);
    } catch (error) {
      setWorkspaceStatus(errorMessage(error));
    } finally {
      setIsWorkspaceBusy(false);
    }
  }

  async function openProject() {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus("本地项目打开需要在 Tauri 桌面端运行。");
      return;
    }
    setIsWorkspaceBusy(true);
    try {
      const project = await pickAndScanProject();
      if (!project) {
        setWorkspaceStatus("已取消打开项目");
        return;
      }
      if (project.files.length === 0) {
        setWorkspaceStatus("未找到 JS/TS/JSX/TSX 文件");
        return;
      }

      const placeholders: CodeFile[] = project.files.map((file) => ({
        ...file,
        projectRoot: project.rootPath,
        code: "",
        explanations: [],
        codeNodes: [],
        source: "local",
        isLoaded: false
      }));
      const activeFirstFile = await hydrateLoadedFile(await loadFirstAvailableProjectFile(project));
      setFiles(placeholders.map((file) => (file.id === activeFirstFile.id ? activeFirstFile : file)));
      setActiveLoadedFile(activeFirstFile);
      setWorkspaceStatus(`${project.files.length} 个代码文件：${project.rootPath}`);
    } catch (error) {
      setWorkspaceStatus(errorMessage(error));
    } finally {
      setIsWorkspaceBusy(false);
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
            <p>单文件阅读闭环骨架</p>
          </div>
        </div>
        <div className="topbar-actions" aria-label="Workspace actions">
          <button type="button" onClick={openFile} disabled={isWorkspaceBusy} title="打开单个代码文件">
            <FilePlus2 size={16} aria-hidden="true" />
            <span>打开文件</span>
          </button>
          <button type="button" onClick={openProject} disabled={isWorkspaceBusy} title="打开本地项目文件夹">
            <FolderOpen size={16} aria-hidden="true" />
            <span>打开项目</span>
          </button>
        </div>
        <div className="topbar-status">
          <span>{workspaceStatus}</span>
          <span>Sprint 1</span>
        </div>
      </header>

      <section className="workspace" aria-label="CodeReader workspace">
        <FileExplorer
          files={filesForExplorer}
          selectedFileId={selectedFile.id}
          selectedExplanationId={selectedExplanation?.id}
          loadingFileId={loadingFileId}
          onSelectFile={selectFile}
          onSelectExplanation={selectExplanation}
        />
        <MonacoCodeViewer
          file={selectedFileForViewer}
          selectedExplanation={selectedExplanation}
          onSelectExplanation={selectExplanation}
          onSelectionChange={updateSelection}
        />
        <ExplanationPanel
          explanation={selectedExplanation}
          onFeedback={saveFeedback}
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
        <span>{selectedExplanation?.status ?? "valid"}</span>
        <span>{selectedExplanation?.readingState ?? "unread"}</span>
      </footer>
    </main>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function loadFirstAvailableProjectFile(project: ProjectScanResult): Promise<CodeFile> {
  const failures: string[] = [];
  for (const file of project.files) {
    try {
      const loadedFile = await loadCodeFile(file.path, project.rootPath);
      return {
        ...loadedFile,
        projectRoot: project.rootPath,
        relativePath: file.relativePath
      };
    } catch (error) {
      failures.push(`${file.relativePath}: ${errorMessage(error)}`);
    }
  }

  throw new Error(`已扫描到 ${project.files.length} 个代码文件，但没有文件可读取。${failures[0] ?? ""}`);
}

function sameSelection(left: CodeSelection, right: CodeSelection) {
  return left.startLine === right.startLine && left.endLine === right.endLine;
}
