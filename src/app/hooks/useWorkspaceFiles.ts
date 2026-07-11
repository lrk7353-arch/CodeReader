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
  expandGrantedDirectory,
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
import { errorAction, errorMessage, safeErrorDetail, type ErrorAction } from "../appError";
import { useWorkspaceSelection } from "./useWorkspaceSelection";
import { codeSelectionForExplanation, pickRetainedExplanation } from "./retainExplanation";
import { seedBrowserHydratedFile, stripUnexplainableFile } from "./hydrateLoadedFile";
import { upsertFileInList } from "./workspaceFileList";
import { canRefreshLoadedFile } from "./workspaceRefreshController";
import { buildProjectOpenPlan } from "./projectOpenHelpers";
import { resolveWorkspaceName } from "../utils/workspacePaths";
import { createOperationGate, type OperationToken } from "./operationGate";

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
  const [databasePath, setDatabasePath] = useState("");
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>(
    isDesktopRuntime() ? "initializing" : "preview"
  );
  const [isWorkspaceBusy, setIsWorkspaceBusy] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const workspaceTouchedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const operationGateRef = useRef(createOperationGate());

  const invalidateWorkspaceOperation = useCallback((targetId: string) => {
    operationGateRef.current.invalidate(targetId);
    setIsWorkspaceBusy(false);
    setLoadingFileId(null);
  }, []);

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
      const resolved = typeof next === "function" ? next(current) : next;
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
        if (cancelled) return;
        setDatabasePath(status.databasePath);
        setPersistenceStatus(status.initialized ? "ready" : "error");
        if (!status.initialized) {
          const backupHint = status.backupPath ? ` 备份位置：${status.backupPath}` : "";
          setWorkspaceStatus(
            `本地数据库未能安全打开，已停止持久化写入并保留原始数据。${backupHint}`
          );
          return;
        }
        const hydratedSamples = await Promise.all(
          sampleFiles.map((file) =>
            hydrateCodeFilePersistence(file, buildSelectableExplanations(file))
          )
        );
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

  const refreshPersistedProjectGuide = useCallback(
    async (projectId: string, shouldApply: () => boolean = () => true) => {
      if (!isDesktopRuntime() || projectId === sampleProjectId) {
        return;
      }
      const guide = await loadProjectGuide(projectId);
      if (guide && shouldApply()) {
        setProjectGuide(guide);
      }
    },
    []
  );

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
      const operation = operationGateRef.current.begin(file.id);
      refreshInFlightRef.current = true;
      if (announce) {
        setIsWorkspaceBusy(true);
        setWorkspaceStatus(`正在检查 ${file.relativePath ?? file.path}`);
      }
      try {
        if (!file.grantId) {
          throw new Error("The file authorization has expired. Reopen the file or folder.");
        }
        const reloaded = await loadCodeFile(file.id, file.grantId);
        if (!operationGateRef.current.isCurrent(operation)) return;
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
        if (!operationGateRef.current.isCurrent(operation)) return;
        upsertFile(hydrated);
        setSelectedFileId(hydrated.id);
        if (hydrated.projectId) {
          await refreshPersistedProjectGuide(hydrated.projectId, () =>
            operationGateRef.current.isCurrent(operation)
          );
          if (!operationGateRef.current.isCurrent(operation)) return;
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
        if (operationGateRef.current.isCurrent(operation)) {
          reportWorkspaceError(error, "变更检测失败：");
        }
      } finally {
        refreshInFlightRef.current = false;
        if (announce && operationGateRef.current.isCurrent(operation)) {
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
    async (
      fileId: string,
      grantId: string,
      relativePath?: string,
      projectRoot?: string,
      existingOperation?: OperationToken
    ) => {
      const path = fileId;
      const operation = existingOperation ?? operationGateRef.current.begin(fileId, true);
      setIsWorkspaceBusy(true);
      setLoadingFileId(fileId);
      setWorkspaceStatus(`正在加载 ${relativePath ?? path}`);
      try {
        const loadedFile = await loadCodeFile(fileId, grantId);
        if (!operationGateRef.current.isCurrent(operation)) return;
        const file = await hydrateLoadedFile({
          ...loadedFile,
          projectRoot: projectRoot ?? loadedFile.projectRoot,
          relativePath: relativePath ?? loadedFile.relativePath
        });
        if (!operationGateRef.current.isCurrent(operation)) return;
        upsertFile(file);
        setActiveLoadedFile(file);
        if (file.projectId) {
          await refreshPersistedProjectGuide(file.projectId, () =>
            operationGateRef.current.isCurrent(operation)
          );
          if (!operationGateRef.current.isCurrent(operation)) return;
        }
        setWorkspaceStatus(`已加载 ${file.relativePath ?? file.path}`);
      } catch (error) {
        if (operationGateRef.current.isCurrent(operation)) reportWorkspaceError(error);
      } finally {
        if (operationGateRef.current.isCurrent(operation)) {
          setIsWorkspaceBusy(false);
          setLoadingFileId(null);
        }
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
        invalidateWorkspaceOperation(file.id);
        workspaceTouchedRef.current = true;
        setWorkspaceStatus(file.capability.reason ?? "该文件暂不支持预览。");
        return;
      }
      if (file.source === "local" && !file.isLoaded) {
        workspaceTouchedRef.current = true;
        const operation = operationGateRef.current.begin(file.id, true);
        if (!file.grantId) {
          setWorkspaceStatus("File authorization expired. Reopen the folder.");
          return;
        }
        void loadAndSelectFile(
          file.id,
          file.grantId,
          file.relativePath,
          file.projectRoot,
          operation
        );
        return;
      }
      invalidateWorkspaceOperation(file.id);
      setActiveLoadedFile(file);
    },
    [
      files,
      invalidateWorkspaceOperation,
      loadAndSelectFile,
      setActiveLoadedFile,
      setWorkspaceStatus
    ]
  );

  const expandDirectory = useCallback(
    async (directoryId: string) => {
      const grantId = files.find((file) => file.grantId)?.grantId;
      if (!grantId) {
        setWorkspaceStatus("Folder authorization expired. Reopen the folder.");
        return;
      }
      const operation = operationGateRef.current.begin(`expand:${grantId}:${directoryId}`);
      try {
        const expanded = await expandGrantedDirectory(grantId, directoryId);
        if (!operationGateRef.current.isCurrent(operation)) return;
        const directoryPrefix = projectNodes.find((node) => node.id === directoryId)?.relativePath;
        const qualify = (relativePath: string) =>
          directoryPrefix ? `${directoryPrefix}/${relativePath}` : relativePath;
        const childNodes = expanded.nodes.map((node) => ({
          ...node,
          relativePath: qualify(node.relativePath),
          parentId: node.parentId ?? directoryId
        }));
        setProjectNodes((current) => {
          const byId = new Map(current.map((node) => [node.id, node]));
          byId.set(directoryId, {
            ...byId.get(directoryId)!,
            lazy: false,
            truncated: expanded.truncated
          });
          childNodes.forEach((node) => byId.set(node.id, node));
          return [...byId.values()];
        });
        setFiles((current) => {
          const byId = new Map(current.map((file) => [file.id, file]));
          const projectRoot = current.find((file) => file.grantId === grantId)?.projectRoot;
          const expandedForWorkspace = {
            ...expanded,
            grantId,
            rootPath: projectRoot ?? expanded.rootPath,
            files: expanded.files.map((file) => ({
              ...file,
              relativePath: qualify(file.relativePath)
            }))
          };
          buildProjectOpenPlan(expandedForWorkspace).placeholders.forEach((file) =>
            byId.set(file.id, file)
          );
          return [...byId.values()];
        });
      } catch (error) {
        if (operationGateRef.current.isCurrent(operation)) {
          reportWorkspaceError(error);
        }
      }
    },
    [files, projectNodes, reportWorkspaceError, setWorkspaceStatus]
  );

  async function openSampleProject() {
    const operation = operationGateRef.current.begin("sample-project", true);
    workspaceTouchedRef.current = true;
    setIsWorkspaceBusy(true);
    setWorkspaceStatus("正在恢复无 API Key 示例项目");
    try {
      const hydratedSamples = await Promise.all(sampleFiles.map((file) => hydrateLoadedFile(file)));
      if (!operationGateRef.current.isCurrent(operation)) return;
      setReadingStates({});
      setProjectNodes(sampleProjectNodes);
      setProjectGuide(deriveGuideProgress(sampleProjectGuide, hydratedSamples));
      setGuideFocusToken((current) => current + 1);
      setFiles(hydratedSamples);
      setActiveLoadedFile(hydratedSamples[0] ?? sampleFiles[0]);
      setWorkspaceStatus("示例项目已就绪：按推荐路径阅读入口、登录业务和用户数据");
    } catch (error) {
      if (operationGateRef.current.isCurrent(operation)) reportWorkspaceError(error);
    } finally {
      if (operationGateRef.current.isCurrent(operation)) setIsWorkspaceBusy(false);
    }
  }

  async function openFile() {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus("本地文件打开需要在 Tauri 桌面端运行。");
      return;
    }
    const operation = operationGateRef.current.begin("open-file", true);
    workspaceTouchedRef.current = true;
    setIsWorkspaceBusy(true);
    try {
      const file = await pickAndLoadCodeFile();
      if (!operationGateRef.current.isCurrent(operation)) return;
      if (!file) {
        setWorkspaceStatus("已取消打开文件");
        return;
      }
      const hydratedFile = await hydrateLoadedFile(file);
      if (!operationGateRef.current.isCurrent(operation)) return;
      setProjectNodes([]);
      setProjectGuide(undefined);
      setReadingStates({});
      setFiles([hydratedFile]);
      setActiveLoadedFile(hydratedFile);
      setWorkspaceStatus(`已加载 ${hydratedFile.path}`);
    } catch (error) {
      if (operationGateRef.current.isCurrent(operation)) reportWorkspaceError(error);
    } finally {
      if (operationGateRef.current.isCurrent(operation)) setIsWorkspaceBusy(false);
    }
  }

  async function openProject() {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus("本地项目打开需要在 Tauri 桌面端运行。");
      return;
    }
    const operation = operationGateRef.current.begin("open-project", true);
    workspaceTouchedRef.current = true;
    setIsWorkspaceBusy(true);
    try {
      const project = await pickAndScanProject();
      if (!operationGateRef.current.isCurrent(operation)) return;
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
        if (!operationGateRef.current.isCurrent(operation)) return;
      } catch (error) {
        if (!operationGateRef.current.isCurrent(operation)) return;
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
        if (!operationGateRef.current.isCurrent(operation)) return;
      } catch (error) {
        if (!operationGateRef.current.isCurrent(operation)) return;
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
        await refreshPersistedProjectGuide(activeFirstFile.projectId, () =>
          operationGateRef.current.isCurrent(operation)
        );
        if (!operationGateRef.current.isCurrent(operation)) return;
      }
      setWorkspaceStatus(
        `${project.files.length} 个文件，${previewableFiles.length} 个可预览：${project.rootPath}${projectOpenPlan.scanNote}${guideError ? `；阅读路径生成失败：${guideError}` : ""}`
      );
    } catch (error) {
      if (operationGateRef.current.isCurrent(operation)) reportWorkspaceError(error);
    } finally {
      if (operationGateRef.current.isCurrent(operation)) setIsWorkspaceBusy(false);
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
    expandDirectory,
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
  return safeErrorDetail(error);
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
      if (!project.grantId) {
        throw new Error("The folder authorization has expired. Reopen the folder.");
      }
      const loadedFile = await loadCodeFile(file.id, project.grantId);
      return {
        ...loadedFile,
        grantId: project.grantId,
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
