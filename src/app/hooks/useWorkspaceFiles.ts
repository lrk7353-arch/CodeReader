import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import {
  sampleFiles,
  sampleProjectGuide,
  sampleProjectId,
  sampleProjectNodes
} from "../../data/sampleWorkspace";
import { buildSelectableExplanations } from "../../features/explanations/selectableExplanations";
import { deriveGuideProgress } from "../../features/project-guide/projectGuide";
import {
  generateProjectGuide,
  hydrateCodeFilePersistence,
  initializePersistence,
  isDesktopRuntime,
  loadCodeFile,
  loadProjectGuide,
  pickAndLoadCodeFile,
  pickAndScanProject
} from "../../services/desktopWorkspace";
import type {
  CodeFile,
  ProjectGuide,
  ProjectScanResult,
  ReadingState
} from "../../types/explanation";
import { errorAction, errorMessage, type ErrorAction } from "../appError";
import { useWorkspaceSelection } from "./useWorkspaceSelection";
import { codeSelectionForExplanation, pickRetainedExplanation } from "./retainExplanation";
import { seedBrowserHydratedFile, stripUnexplainableFile } from "./hydrateLoadedFile";
import { upsertFileInList } from "./workspaceFileList";
import { canRefreshLoadedFile } from "./workspaceRefreshController";
import { buildProjectOpenPlan } from "./projectOpenHelpers";
import { resolveWorkspaceName } from "../utils/workspacePaths";

export type PersistenceStatus = "preview" | "initializing" | "ready" | "error";

export function useWorkspaceFiles() {
  const [files, setFiles] = useState<CodeFile[]>(sampleFiles);
  const [projectNodes, setProjectNodes] = useState(sampleProjectNodes);
  const [projectGuide, setProjectGuide] = useState<ProjectGuide | undefined>(sampleProjectGuide);
  const [guideFocusToken, setGuideFocusToken] = useState(0);
  const [readingStates, setReadingStates] = useState<Record<string, ReadingState>>({});
  const [workspaceStatus, setWorkspaceStatusValue] = useState("示例项目：无需 API Key");
  const [workspaceAction, setWorkspaceAction] = useState<ErrorAction>("none");
  const [workspaceErrorDetail, setWorkspaceErrorDetail] = useState<string>("");
  const [workspaceStatusHistory, setWorkspaceStatusHistory] = useState<string[]>([
    "示例项目：无需 API Key"
  ]);
  const [lastProjectPath, setLastProjectPath] = useState<string | null>(null);
  const [lastFilePath, setLastFilePath] = useState<string | null>(null);
  const [databasePath, setDatabasePath] = useState("");
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>(
    isDesktopRuntime() ? "initializing" : "preview"
  );
  const [isWorkspaceBusy, setIsWorkspaceBusy] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const workspaceTouchedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const selection = useWorkspaceSelection({ files, readingStates });
  const {
    filesForExplorer,
    selectedExplanationId,
    selectedFile,
    setActiveLoadedFile,
    setSelectedCodeSelection,
    setSelectedExplanationId,
    setSelectedFileId
  } = selection;

  const displayedProjectGuide = useMemo(() => {
    if (!projectGuide || projectGuide.projectId !== sampleProjectId) {
      return projectGuide;
    }
    return deriveGuideProgress(projectGuide, filesForExplorer, readingStates);
  }, [filesForExplorer, projectGuide, readingStates]);

  const workspaceName = useMemo(() => {
    return resolveWorkspaceName(files);
  }, [files]);

  const setWorkspaceStatus = useCallback((next: SetStateAction<string>) => {
    setWorkspaceAction("none");
    setWorkspaceErrorDetail("");
    setWorkspaceStatusValue((current) => {
      const resolved = typeof next === "function" ? (next as (v: string) => string)(current) : next;
      setWorkspaceStatusHistory((history) => [...history, resolved].slice(-10));
      return resolved;
    });
  }, []);

  const reportWorkspaceError = useCallback((error: unknown, prefix = "") => {
    const detail = extractErrorDetail(error);
    setWorkspaceErrorDetail(`${prefix}${detail}`);
    const message = `${prefix}${errorMessage(error)}`;
    setWorkspaceStatusValue(message);
    setWorkspaceStatusHistory((history) => [...history, message].slice(-10));
    setWorkspaceAction(errorAction(error));
  }, []);

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
        setDatabasePath(status.databasePath);
        setPersistenceStatus(status.initialized ? "ready" : "error");
        if (!shouldApplyInitialWorkspaceHydration(cancelled, workspaceTouchedRef.current)) {
          return;
        }
        setFiles(hydratedSamples);
        setProjectGuide(deriveGuideProgress(sampleProjectGuide, hydratedSamples));
        setWorkspaceStatus((current) =>
          current.startsWith("示例项目") ? "示例项目：本地阅读状态已恢复" : current
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setPersistenceStatus("error");
        reportWorkspaceError(error);
      });

    return () => {
      cancelled = true;
    };
  }, [reportWorkspaceError, setWorkspaceStatus]);

  const hydrateLoadedFile = useCallback(async (file: CodeFile) => {
    if (file.capability?.canExplain === false) {
      return stripUnexplainableFile(file);
    }
    const seedExplanations = buildSelectableExplanations(file);
    if (!isDesktopRuntime()) {
      return seedBrowserHydratedFile(file, seedExplanations);
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
    setFiles((current) => upsertFileInList(current, file));
  }, []);

  const refreshLoadedFile = useCallback(
    async (file: CodeFile, announce: boolean) => {
      if (
        !canRefreshLoadedFile({
          file,
          isDesktop: isDesktopRuntime(),
          refreshInFlight: refreshInFlightRef.current
        })
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
        const retained = pickRetainedExplanation(
          explanations,
          selectedExplanationId,
          hydrated.changeSummary?.affectedExplanationIds ?? []
        );
        setSelectedExplanationId(retained?.id ?? "");
        const retainedSelection = retained ? codeSelectionForExplanation(retained) : undefined;
        if (retainedSelection) {
          setSelectedCodeSelection(retainedSelection);
        }
        setWorkspaceStatus(
          hydrated.changeSummary?.summary ?? `已重新读取 ${hydrated.relativePath ?? hydrated.path}`
        );
      } catch (error) {
        reportWorkspaceError(error, "变更检测失败：");
      } finally {
        refreshInFlightRef.current = false;
        if (announce) {
          setIsWorkspaceBusy(false);
        }
      }
    },
    [
      hydrateLoadedFile,
      reportWorkspaceError,
      refreshPersistedProjectGuide,
      selectedExplanationId,
      setWorkspaceStatus,
      setSelectedCodeSelection,
      setSelectedExplanationId,
      setSelectedFileId,
      upsertFile
    ]
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
        reportWorkspaceError(error);
      } finally {
        setIsWorkspaceBusy(false);
        setLoadingFileId(null);
      }
    },
    [
      hydrateLoadedFile,
      refreshPersistedProjectGuide,
      reportWorkspaceError,
      setActiveLoadedFile,
      setWorkspaceStatus,
      upsertFile
    ]
  );

  const selectFile = useCallback(
    (fileId: string) => {
      const file = files.find((item) => item.id === fileId) ?? files[0] ?? sampleFiles[0];
      if (file.capability?.canPreview === false) {
        workspaceTouchedRef.current = true;
        setSelectedFileId(file.id);
        setSelectedExplanationId("");
        setSelectedCodeSelection({ startLine: 1, endLine: 1 });
        setWorkspaceStatus(file.capability.reason ?? "该文件暂不支持预览。");
        return;
      }
      if (file.source === "local" && !file.isLoaded) {
        workspaceTouchedRef.current = true;
        void loadAndSelectFile(file.path, file.relativePath, file.id, file.projectRoot);
        return;
      }
      setActiveLoadedFile(file);
    },
    [
      files,
      loadAndSelectFile,
      setActiveLoadedFile,
      setSelectedCodeSelection,
      setSelectedExplanationId,
      setSelectedFileId,
      setWorkspaceStatus
    ]
  );

  async function openSampleProject() {
    workspaceTouchedRef.current = true;
    setIsWorkspaceBusy(true);
    setWorkspaceStatus("正在恢复无 API Key 示例项目");
    try {
      const hydratedSamples = await Promise.all(sampleFiles.map((file) => hydrateLoadedFile(file)));
      setReadingStates({});
      setProjectNodes(sampleProjectNodes);
      setProjectGuide(deriveGuideProgress(sampleProjectGuide, hydratedSamples));
      setGuideFocusToken((current) => current + 1);
      setFiles(hydratedSamples);
      setActiveLoadedFile(hydratedSamples[0] ?? sampleFiles[0]);
      setWorkspaceStatus("示例项目已就绪：按推荐路径阅读入口、登录业务和用户数据");
    } catch (error) {
      reportWorkspaceError(error);
    } finally {
      setIsWorkspaceBusy(false);
    }
  }

  async function openFile() {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus("本地文件打开需要在 Tauri 桌面端运行。");
      return;
    }
    workspaceTouchedRef.current = true;
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
      reportWorkspaceError(error);
    } finally {
      setIsWorkspaceBusy(false);
    }
  }

  async function openProject() {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus("本地项目打开需要在 Tauri 桌面端运行。");
      return;
    }
    workspaceTouchedRef.current = true;
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

      const projectOpenPlan = buildProjectOpenPlan(project, guide?.readingPath[0]?.fileId);
      const { placeholders, previewableFiles } = projectOpenPlan;
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
          await loadFirstAvailableProjectFile(project, projectOpenPlan.preferredFileId)
        );
      } catch (error) {
        const fallbackFileId = projectOpenPlan.preferredFileId ?? placeholders[0]?.id ?? "";
        setFiles(placeholders);
        setSelectedFileId(fallbackFileId);
        setSelectedExplanationId("");
        setSelectedCodeSelection({ startLine: 1, endLine: 1 });
        setWorkspaceStatus(
          `项目结构已打开，但初始文件读取失败。可从文件树尝试其他文件：${errorMessage(error)}`
        );
        setWorkspaceAction(errorAction(error));
        return;
      }
      setFiles(
        placeholders.map((file) => (file.id === activeFirstFile.id ? activeFirstFile : file))
      );
      setActiveLoadedFile(activeFirstFile);
      if (guide && activeFirstFile.projectId) {
        await refreshPersistedProjectGuide(activeFirstFile.projectId);
      }
      setWorkspaceStatus(
        `${project.files.length} 个文件，${previewableFiles.length} 个可预览：${project.rootPath}${projectOpenPlan.scanNote}${guideError ? `；阅读路径生成失败：${guideError}` : ""}`
      );
    } catch (error) {
      reportWorkspaceError(error);
    } finally {
      setIsWorkspaceBusy(false);
    }
  }

  const copyErrorDetail = useCallback(async () => {
    if (!workspaceErrorDetail) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(workspaceErrorDetail);
      setWorkspaceStatusValue(`已复制错误详情（${workspaceErrorDetail.length} 字符）`);
      return true;
    } catch {
      setWorkspaceStatusValue("复制失败：剪贴板不可用");
      return false;
    }
  }, [workspaceErrorDetail]);

  return {
    ...selection,
    copyErrorDetail,
    databasePath,
    displayedProjectGuide,
    filesForExplorer,
    guideFocusToken,
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
    setFiles,
    setReadingStates,
    setWorkspaceStatus,
    workspaceAction,
    workspaceErrorDetail,
    workspaceName,
    workspaceStatus,
    workspaceStatusHistory
  };
}

function extractErrorDetail(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
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

  throw new Error(
    `已扫描到 ${project.files.length} 个文件，但没有可预览文件能被读取。${failures[0] ?? ""}`
  );
}

export function shouldApplyInitialWorkspaceHydration(
  cancelled: boolean,
  workspaceTouched: boolean
) {
  return !cancelled && !workspaceTouched;
}

export { resolveWorkspaceName };
