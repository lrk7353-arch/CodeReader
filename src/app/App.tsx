import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FilePlus2, FolderOpen, Settings2 } from "lucide-react";
import {
  sampleFiles,
  sampleProjectGuide,
  sampleProjectId,
  sampleProjectNodes
} from "../data/sampleWorkspace";
import type {
  CodeFile,
  ContextBundle,
  Explanation,
  ExplanationFeedbackType,
  ModelConfig,
  ProjectGuide,
  ProjectScanResult,
  ProjectTreeNode,
  ReadingState,
  SaveModelConfigInput
} from "../types/explanation";
import { FileExplorer } from "../features/file-explorer/FileExplorer";
import { MonacoCodeViewer, type CodeSelection } from "../features/code-viewer/MonacoCodeViewer";
import { ExplanationPanel } from "../features/explanation-panel/ExplanationPanel";
import type { ContextPreviewStatus } from "../features/context-preview/ContextPreview";
import { GenerationConfirmDialog } from "../features/explanation-generation/GenerationConfirmDialog";
import { ModelSettingsDialog } from "../features/model-settings/ModelSettingsDialog";
import { deriveGuideProgress } from "../features/project-guide/projectGuide";
import {
  buildRangeExplanation,
  buildSelectableExplanations,
  findExplanationForSelection
} from "../features/explanations/selectableExplanations";
import {
  buildExplanationContext,
  generateProjectGuide,
  generateExplanation,
  getModelConfig,
  isDesktopRuntime,
  hydrateCodeFilePersistence,
  initializePersistence,
  loadProjectGuide,
  loadCodeFile,
  pickAndLoadCodeFile,
  pickAndScanProject,
  persistExplanationFeedback,
  persistReadingState,
  resetModelConfig,
  saveModelConfig
} from "../services/desktopWorkspace";

type PersistenceStatus = "preview" | "initializing" | "ready" | "error";
type GenerationStatus = "idle" | "generating" | "error";

export function App() {
  const [files, setFiles] = useState<CodeFile[]>(sampleFiles);
  const [projectNodes, setProjectNodes] = useState<ProjectTreeNode[]>(sampleProjectNodes);
  const [projectGuide, setProjectGuide] = useState<ProjectGuide | undefined>(sampleProjectGuide);
  const [guideFocusToken, setGuideFocusToken] = useState(0);
  const [selectedFileId, setSelectedFileId] = useState(files[0]?.id ?? "");
  const [selectedExplanationId, setSelectedExplanationId] = useState(
    files[0]?.explanations[0]?.id ?? ""
  );
  const [selectedCodeSelection, setSelectedCodeSelection] = useState<CodeSelection>({
    startLine: 1,
    endLine: 1
  });
  const [readingStates, setReadingStates] = useState<Record<string, ReadingState>>({});
  const [workspaceStatus, setWorkspaceStatus] = useState("示例项目：无需 API Key");
  const [databasePath, setDatabasePath] = useState("");
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>(
    isDesktopRuntime() ? "initializing" : "preview"
  );
  const [isWorkspaceBusy, setIsWorkspaceBusy] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [contextBundle, setContextBundle] = useState<ContextBundle>();
  const [contextError, setContextError] = useState("");
  const [contextStatus, setContextStatus] = useState<ContextPreviewStatus>(
    isDesktopRuntime() ? "loading" : "unavailable"
  );
  const [modelConfig, setModelConfig] = useState<ModelConfig>();
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [modelSettingsBusy, setModelSettingsBusy] = useState(false);
  const [modelSettingsError, setModelSettingsError] = useState("");
  const [generationConfirmOpen, setGenerationConfirmOpen] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [generationError, setGenerationError] = useState("");
  const refreshInFlightRef = useRef(false);

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? files[0] ?? sampleFiles[0],
    [files, selectedFileId]
  );

  const selectableExplanations = useMemo(() => buildSelectableExplanations(selectedFile), [selectedFile]);

  const transientRangeExplanation = useMemo(() => {
    if (selectedFile.capability?.canExplain === false) {
      return undefined;
    }
    if (selectedCodeSelection.startLine === selectedCodeSelection.endLine) {
      return undefined;
    }
    if (findExplanationForSelection(selectableExplanations, selectedCodeSelection)) {
      return undefined;
    }
    return buildRangeExplanation(selectedFile, selectedCodeSelection);
  }, [selectableExplanations, selectedCodeSelection, selectedFile]);

  const hydratedExplanations = useMemo(
    () => {
      const explanations = transientRangeExplanation
        ? [...selectableExplanations, transientRangeExplanation]
        : selectableExplanations;
      return explanations.map((explanation) => ({
        ...explanation,
        readingState: readingStates[explanation.id] ?? explanation.readingState
      }));
    },
    [readingStates, selectableExplanations, transientRangeExplanation]
  );

  const selectedExplanation = useMemo<Explanation | undefined>(() => {
    return (
      hydratedExplanations.find((item) => item.id === selectedExplanationId) ?? hydratedExplanations[0]
    );
  }, [hydratedExplanations, selectedExplanationId]);

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

  const displayedProjectGuide = useMemo(() => {
    if (!projectGuide || projectGuide.projectId !== sampleProjectId) {
      return projectGuide;
    }
    return deriveGuideProgress(projectGuide, filesForExplorer, readingStates);
  }, [filesForExplorer, projectGuide, readingStates]);

  const workspaceName = useMemo(() => {
    const localRoot = files.find((file) => file.projectRoot)?.projectRoot;
    if (localRoot) {
      return baseName(localRoot);
    }
    const localFile = files.find((file) => file.source === "local");
    if (localFile) {
      return baseName(parentPath(localFile.path)) || localFile.name;
    }
    return "examples";
  }, [files]);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus((current) =>
        current.startsWith("示例项目") ? "示例项目：浏览器预览仅保存在内存中" : current
      );
      return;
    }

    let cancelled = false;
    void initializePersistence()
      .then(async (status) => {
        const hydratedSamples = await Promise.all(
          sampleFiles.map((file) =>
            hydrateCodeFilePersistence(file, buildSelectableExplanations(file))
          )
        );
        if (cancelled) {
          return;
        }
        setFiles(hydratedSamples);
        setProjectGuide(deriveGuideProgress(sampleProjectGuide, hydratedSamples));
        setDatabasePath(status.databasePath);
        setPersistenceStatus(status.initialized ? "ready" : "error");
        setWorkspaceStatus((current) =>
          current.startsWith("示例项目") ? "示例项目：本地阅读状态已恢复" : current
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setPersistenceStatus("error");
        setWorkspaceStatus(errorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      return;
    }
    let cancelled = false;
    void getModelConfig()
      .then((config) => {
        if (!cancelled) {
          setModelConfig(config);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceStatus(`模型配置读取失败：${errorMessage(error)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setGenerationConfirmOpen(false);
    setGenerationStatus("idle");
    setGenerationError("");
  }, [selectedExplanationId, selectedFileId]);

  useEffect(() => {
    if (
      !isDesktopRuntime() ||
      !selectedExplanation ||
      !selectedFile.code ||
      selectedFile.capability?.canExplain === false
    ) {
      setContextBundle(undefined);
      setContextError("");
      setContextStatus("unavailable");
      return;
    }

    let cancelled = false;
    setContextBundle(undefined);
    setContextError("");
    setContextStatus("loading");
    void buildExplanationContext(selectedFile, selectedExplanation)
      .then((bundle) => {
        if (cancelled) {
          return;
        }
        setContextBundle(bundle);
        setContextStatus("ready");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setContextBundle(undefined);
        setContextError(errorMessage(error));
        setContextStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [selectedExplanation, selectedFile]);

  const selectExplanation = useCallback(
    (explanationId: string) => {
      const explanation = hydratedExplanations.find((item) => item.id === explanationId);
      setSelectedExplanationId((current) => (current === explanationId ? current : explanationId));
      const rangeSelection = parseRangeSelection(explanationId);
      const nextSelection = explanation?.startLine
        ? {
          startLine: explanation.startLine,
          endLine: explanation.endLine ?? explanation.startLine
        }
        : rangeSelection
          ? rangeSelection
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
    if (file.capability?.canExplain === false) {
      return {
        ...file,
        codeNodes: [],
        explanations: []
      };
    }
    const seedExplanations = buildSelectableExplanations(file);
    if (!isDesktopRuntime()) {
      return {
        ...file,
        databasePath: "",
        explanations: seedExplanations
      };
    }
    const hydratedFile = await hydrateCodeFilePersistence(file, seedExplanations);
    if (hydratedFile.databasePath) {
      setDatabasePath(hydratedFile.databasePath);
      setPersistenceStatus("ready");
    }
    return hydratedFile;
  }, []);

  const refreshPersistedProjectGuide = useCallback(async (projectId: string) => {
    if (!isDesktopRuntime() || projectId === sampleProjectId) {
      return;
    }
    const guide = await loadProjectGuide(projectId);
    if (guide) {
      setProjectGuide(guide);
    }
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

  const refreshLoadedFile = useCallback(
    async (file: CodeFile, announce: boolean) => {
      if (
        !isDesktopRuntime() ||
        file.source !== "local" ||
        !file.isLoaded ||
        refreshInFlightRef.current
      ) {
        return;
      }
      refreshInFlightRef.current = true;
      if (announce) {
        setIsWorkspaceBusy(true);
        setWorkspaceStatus(`正在检查 ${file.relativePath ?? file.path}`);
      }
      try {
        const reloaded = await loadCodeFile(file.path, file.projectRoot);
        if (reloaded.fileHash === file.fileHash) {
          if (announce) {
            setWorkspaceStatus(`文件未变化：${file.relativePath ?? file.path}`);
          }
          return;
        }
        const hydrated = await hydrateLoadedFile({
          ...reloaded,
          projectRoot: file.projectRoot ?? reloaded.projectRoot,
          relativePath: file.relativePath ?? reloaded.relativePath
        });
        upsertFile(hydrated);
        setSelectedFileId(hydrated.id);
        if (hydrated.projectId) {
          await refreshPersistedProjectGuide(hydrated.projectId);
        }
        const explanations = buildSelectableExplanations(hydrated);
        const retained =
          explanations.find((item) => item.id === selectedExplanationId) ??
          explanations.find((item) =>
            hydrated.changeSummary?.affectedExplanationIds.includes(item.id)
          ) ??
          explanations.find((item) => item.status !== "valid") ??
          explanations[0];
        setSelectedExplanationId(retained?.id ?? "");
        if (retained?.targetType === "file") {
          setSelectedCodeSelection({ startLine: 1, endLine: 1 });
        } else if (retained?.startLine) {
          setSelectedCodeSelection({
            startLine: retained.startLine,
            endLine: retained.endLine ?? retained.startLine
          });
        }
        setWorkspaceStatus(
          hydrated.changeSummary?.summary ?? `已重新读取 ${hydrated.relativePath ?? hydrated.path}`
        );
      } catch (error) {
        setWorkspaceStatus(`变更检测失败：${errorMessage(error)}`);
      } finally {
        refreshInFlightRef.current = false;
        if (announce) {
          setIsWorkspaceBusy(false);
        }
      }
    },
    [hydrateLoadedFile, refreshPersistedProjectGuide, selectedExplanationId, upsertFile]
  );

  useEffect(() => {
    if (
      !isDesktopRuntime() ||
      selectedFile.source !== "local" ||
      !selectedFile.isLoaded ||
      isWorkspaceBusy
    ) {
      return;
    }
    const checkOnFocus = () => {
      void refreshLoadedFile(selectedFile, false);
    };
    window.addEventListener("focus", checkOnFocus);
    return () => window.removeEventListener("focus", checkOnFocus);
  }, [isWorkspaceBusy, refreshLoadedFile, selectedFile]);

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
        if (file.projectId) {
          await refreshPersistedProjectGuide(file.projectId);
        }
        setWorkspaceStatus(`已加载 ${file.relativePath ?? file.path}`);
      } catch (error) {
        setWorkspaceStatus(errorMessage(error));
      } finally {
        setIsWorkspaceBusy(false);
        setLoadingFileId(null);
      }
    },
    [hydrateLoadedFile, refreshPersistedProjectGuide, setActiveLoadedFile, upsertFile]
  );

  const selectFile = useCallback(
    (fileId: string) => {
      const file = files.find((item) => item.id === fileId) ?? files[0] ?? sampleFiles[0];
      if (file.capability?.canPreview === false) {
        setSelectedFileId(file.id);
        setSelectedExplanationId("");
        setSelectedCodeSelection({ startLine: 1, endLine: 1 });
        setWorkspaceStatus(file.capability.reason ?? "该文件暂不支持预览。");
        return;
      }
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
      setWorkspaceStatus(`阅读状态已保存：${selectedExplanation.targetName ?? selectedExplanation.targetType}`);
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
      await persistExplanationFeedback(selectedFile.projectId, selectedExplanation.id, feedbackType);
      setWorkspaceStatus(`解释反馈已保存：${feedbackType}`);
      if (feedbackType === "regenerate_requested") {
        await persistReadingState(selectedFile.projectId, selectedExplanation.id, "needs_reexplain");
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

  function requestExplanationGeneration() {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus("真实解释生成需要在 Tauri 桌面端运行。");
      return;
    }
    if (!selectedExplanation || !contextBundle || contextStatus !== "ready") {
      setGenerationStatus("error");
      setGenerationError("上下文尚未准备完成，请稍后重试。");
      return;
    }
    if (!modelConfig?.configured) {
      setModelSettingsError("");
      setModelSettingsOpen(true);
      setWorkspaceStatus("请先配置模型端点、模型名称和 API Key。");
      return;
    }
    setGenerationError("");
    setGenerationStatus("idle");
    setGenerationConfirmOpen(true);
  }

  async function confirmExplanationGeneration() {
    if (!selectedExplanation || !contextBundle || !modelConfig) {
      return;
    }
    setGenerationStatus("generating");
    setGenerationError("");
    try {
      const result = await generateExplanation(selectedFile, selectedExplanation);
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
      setGenerationConfirmOpen(false);
      setGenerationStatus("idle");
      setWorkspaceStatus(
        `解释已生成并保存：${result.model}${result.attempts > 1 ? "（结构修复后通过）" : ""}`
      );
    } catch (error) {
      const message = errorMessage(error);
      setGenerationStatus("error");
      setGenerationError(message);
      setWorkspaceStatus(message);
    }
  }

  async function persistModelConfig(input: SaveModelConfigInput) {
    setModelSettingsBusy(true);
    setModelSettingsError("");
    try {
      const config = await saveModelConfig(input);
      setModelConfig(config);
      if (config.configured) {
        setModelSettingsOpen(false);
        setWorkspaceStatus(`模型配置已保存：${config.model}`);
      } else {
        setModelSettingsError("端点和模型已保存；远程端点还需要填写 API Key。");
      }
    } catch (error) {
      setModelSettingsError(errorMessage(error));
    } finally {
      setModelSettingsBusy(false);
    }
  }

  async function clearModelConfig() {
    setModelSettingsBusy(true);
    setModelSettingsError("");
    try {
      const config = await resetModelConfig();
      setModelConfig(config);
      setModelSettingsOpen(false);
      setWorkspaceStatus("模型配置和 API Key 已清除。");
    } catch (error) {
      setModelSettingsError(errorMessage(error));
    } finally {
      setModelSettingsBusy(false);
    }
  }

  function openModelSettings() {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus("模型配置需要在 Tauri 桌面端运行。");
      return;
    }
    setModelSettingsError("");
    setModelSettingsOpen(true);
  }

  async function openSampleProject() {
    setIsWorkspaceBusy(true);
    setWorkspaceStatus("正在恢复无 API Key 示例项目");
    try {
      const hydratedSamples = await Promise.all(
        sampleFiles.map((file) => hydrateLoadedFile(file))
      );
      setReadingStates({});
      setProjectNodes(sampleProjectNodes);
      setProjectGuide(deriveGuideProgress(sampleProjectGuide, hydratedSamples));
      setGuideFocusToken((current) => current + 1);
      setFiles(hydratedSamples);
      setActiveLoadedFile(hydratedSamples[0] ?? sampleFiles[0]);
      setWorkspaceStatus("示例项目已就绪：按推荐路径阅读入口、登录业务和用户数据");
    } catch (error) {
      setWorkspaceStatus(errorMessage(error));
    } finally {
      setIsWorkspaceBusy(false);
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
      setProjectNodes([]);
      setProjectGuide(undefined);
      setReadingStates({});
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
      setProjectNodes(project.nodes);
      setReadingStates({});
      if (project.files.length === 0) {
        setProjectGuide(undefined);
        setWorkspaceStatus("项目中没有可显示的文件");
        return;
      }

      let guide: ProjectGuide | undefined;
      let guideError = "";
      try {
        guide = await generateProjectGuide(project);
      } catch (error) {
        guideError = errorMessage(error);
      }
      setProjectGuide(guide);
      setGuideFocusToken((current) => current + 1);

      const placeholders: CodeFile[] = project.files.map((file) => ({
        ...file,
        projectRoot: project.rootPath,
        code: "",
        explanations: [],
        codeNodes: [],
        source: "local",
        isLoaded: false
      }));
      const previewableFiles = project.files.filter((file) => file.capability.canPreview);
      if (previewableFiles.length === 0) {
        setFiles(placeholders);
        setSelectedFileId(placeholders[0]?.id ?? "");
        setSelectedExplanationId("");
        setSelectedCodeSelection({ startLine: 1, endLine: 1 });
        setWorkspaceStatus(
          `项目包含 ${project.files.length} 个文件，但没有可安全预览的文本文件。${guideError ? ` 阅读路径生成失败：${guideError}` : ""}`
        );
        return;
      }
      let activeFirstFile: CodeFile;
      try {
        activeFirstFile = await hydrateLoadedFile(
          await loadFirstAvailableProjectFile(project, guide?.readingPath[0]?.fileId)
        );
      } catch (error) {
        const fallbackFileId =
          guide?.readingPath[0]?.fileId ?? previewableFiles[0]?.id ?? placeholders[0]?.id ?? "";
        setFiles(placeholders);
        setSelectedFileId(fallbackFileId);
        setSelectedExplanationId("");
        setSelectedCodeSelection({ startLine: 1, endLine: 1 });
        setWorkspaceStatus(
          `项目结构已打开，但初始文件读取失败。可从文件树尝试其他文件：${errorMessage(error)}`
        );
        return;
      }
      setFiles(placeholders.map((file) => (file.id === activeFirstFile.id ? activeFirstFile : file)));
      setActiveLoadedFile(activeFirstFile);
      if (guide && activeFirstFile.projectId) {
        await refreshPersistedProjectGuide(activeFirstFile.projectId);
      }
      const scanNote = project.truncated
        ? "，扫描已达到安全预算"
        : project.skippedEntries > 0
          ? `，跳过 ${project.skippedEntries} 个不可读取项`
          : "";
      setWorkspaceStatus(
        `${project.files.length} 个文件，${previewableFiles.length} 个可预览：${project.rootPath}${scanNote}${guideError ? `；阅读路径生成失败：${guideError}` : ""}`
      );
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
          <button type="button" onClick={openFile} disabled={isWorkspaceBusy} title="打开单个代码文件">
            <FilePlus2 size={16} aria-hidden="true" />
            <span>打开文件</span>
          </button>
          <button type="button" onClick={openProject} disabled={isWorkspaceBusy} title="打开本地项目文件夹">
            <FolderOpen size={16} aria-hidden="true" />
            <span>打开项目</span>
          </button>
          <button type="button" onClick={openModelSettings} title="配置 LLM">
            <Settings2 size={16} aria-hidden="true" />
            <span>模型</span>
          </button>
        </div>
        <div className="topbar-status">
          <span>{workspaceStatus}</span>
          <span>MVP · First Mile</span>
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
          contextBundle={contextBundle}
          contextError={contextError}
          contextStatus={contextStatus}
          explanation={selectedExplanation}
          generationError={generationError}
          generationStatus={generationStatus}
          onFeedback={saveFeedback}
          onGenerate={requestExplanationGeneration}
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
        <span className={modelConfig?.configured ? "model-ready" : "model-unconfigured"}>
          {modelConfig?.configured ? modelConfig.model : "模型未配置"}
        </span>
      </footer>

      <ModelSettingsDialog
        busy={modelSettingsBusy}
        config={modelConfig}
        error={modelSettingsError}
        open={modelSettingsOpen}
        onClose={() => setModelSettingsOpen(false)}
        onResetConfig={clearModelConfig}
        onSave={persistModelConfig}
      />
      {modelConfig && contextBundle && selectedExplanation ? (
        <GenerationConfirmDialog
          busy={generationStatus === "generating"}
          config={modelConfig}
          contextBundle={contextBundle}
          error={generationError}
          explanation={selectedExplanation}
          open={generationConfirmOpen}
          onCancel={() => {
            setGenerationConfirmOpen(false);
            setGenerationStatus("idle");
            setGenerationError("");
          }}
          onConfirm={confirmExplanationGeneration}
        />
      ) : null}
    </main>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function loadFirstAvailableProjectFile(
  project: ProjectScanResult,
  preferredFileId?: string
): Promise<CodeFile> {
  const failures: string[] = [];
  const previewableFiles = project.files.filter((item) => item.capability.canPreview);
  const orderedFiles = preferredFileId
    ? [
      ...previewableFiles.filter((file) => file.id === preferredFileId),
      ...previewableFiles.filter((file) => file.id !== preferredFileId)
    ]
    : previewableFiles;
  for (const file of orderedFiles) {
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

  throw new Error(`已扫描到 ${project.files.length} 个文件，但没有可预览文件能被读取。${failures[0] ?? ""}`);
}

function sameSelection(left: CodeSelection, right: CodeSelection) {
  return left.startLine === right.startLine && left.endLine === right.endLine;
}

function parseRangeSelection(explanationId: string): CodeSelection | undefined {
  const match = explanationId.match(/^range:.+:(\d+)-(\d+)$/);
  if (!match) {
    return undefined;
  }
  return {
    startLine: Number(match[1]),
    endLine: Number(match[2])
  };
}

function isTransientExplanation(explanation: Explanation) {
  return explanation.status === "transient" || explanation.id.startsWith("range:");
}

function baseName(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).pop() ?? path;
}

function parentPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
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
