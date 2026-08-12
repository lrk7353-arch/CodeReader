import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import {
  sampleFiles,
  sampleProjectGuide,
  sampleProjectId,
  sampleProjectNodes
} from "../../data/sampleWorkspace";
import {
  buildSelectableExplanations,
  buildUnexplainedNavigationTarget
} from "../../features/explanations/selectableExplanations";
import { deriveGuideProgress } from "../../features/project-guide/projectGuide";
import {
  generateProjectGuide,
  expandGrantedDirectory,
  hydrateCodeFilePersistence,
  initializePersistence,
  isDesktopRuntime,
  loadCodeFile,
  loadProjectGuide,
  loadReaderResumeState,
  pickAndLoadCodeFile,
  pickAndScanProject,
  saveReaderResumeState
} from "../../services/desktopWorkspace";
import type {
  CodeFile,
  ProjectGuide,
  ProjectScanResult,
  ReaderResumeState,
  ReadingState,
  ExplanationTargetType
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
export type ResumeInitializationStatus = "loading" | "ready" | "error";

export interface WorkspaceNavigationTarget {
  projectId?: string;
  fileId: string;
  explanationId?: string;
  startLine?: number;
  endLine?: number;
  targetType?: ExplanationTargetType;
}

type ResumeInitializationResult =
  | { status: "ready"; state: ReaderResumeState | null }
  | { status: "error"; error: unknown };

const RECENT_PROJECT_NAME_KEY = "codereader.recent-project-name";

type WorkspaceProjectTransition = { kind: "preserve" } | { kind: "replace"; projectId?: string };

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
  const [recentProjectName, setRecentProjectName] = useState(readRecentProjectName);
  const readerResumeStateRef = useRef<ReaderResumeState | null>(null);
  const [resumeInitializationStatus, setResumeInitializationStatus] =
    useState<ResumeInitializationStatus>(isDesktopRuntime() ? "loading" : "ready");
  const resumeInitializationPromiseRef = useRef<Promise<ResumeInitializationResult> | null>(null);
  const resumeInitializationResolveRef = useRef<
    ((result: ResumeInitializationResult) => void) | null
  >(null);
  if (!resumeInitializationPromiseRef.current) {
    resumeInitializationPromiseRef.current = new Promise((resolve) => {
      resumeInitializationResolveRef.current = resolve;
    });
  }
  const resumeSaveChainRef = useRef(Promise.resolve());
  const resumeSaveVersionRef = useRef(0);
  const workspaceTouchedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const operationGateRef = useRef(createOperationGate());
  const workspaceEpochRef = useRef(0);
  const guideRefreshVersionRef = useRef(0);
  const activeWorkspaceProjectIdRef = useRef<string | undefined>(sampleProjectId);

  const beginWorkspaceOperation = useCallback(
    (targetId: string, transition: WorkspaceProjectTransition) => {
      if (transition.kind === "replace") {
        workspaceEpochRef.current += 1;
        activeWorkspaceProjectIdRef.current = transition.projectId;
      }
      return operationGateRef.current.begin(targetId, true);
    },
    []
  );
  const replaceActiveWorkspaceProject = useCallback((projectId?: string) => {
    activeWorkspaceProjectIdRef.current = projectId;
  }, []);

  const invalidateWorkspaceOperation = useCallback(
    (targetId: string, transition: WorkspaceProjectTransition) => {
      if (transition.kind === "replace") {
        workspaceEpochRef.current += 1;
        activeWorkspaceProjectIdRef.current = transition.projectId;
      }
      operationGateRef.current.invalidate(targetId);
      setIsWorkspaceBusy(false);
      setLoadingFileId(null);
    },
    []
  );

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
      resumeInitializationResolveRef.current?.({ status: "ready", state: null });
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
          const error = new Error(
            "Local persistence is unavailable; recent position was not read."
          );
          setResumeInitializationStatus("error");
          resumeInitializationResolveRef.current?.({ status: "error", error });
          const backupHint = status.backupPath ? ` 备份位置：${status.backupPath}` : "";
          setWorkspaceStatus(
            `本地数据库未能安全打开，已停止持久化写入并保留原始数据。${backupHint}`
          );
          return;
        }
        const persistedResume = await loadReaderResumeState();
        if (cancelled) return;
        if (!workspaceTouchedRef.current) readerResumeStateRef.current = persistedResume;
        setResumeInitializationStatus("ready");
        resumeInitializationResolveRef.current?.({ status: "ready", state: persistedResume });
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
        setResumeInitializationStatus("error");
        resumeInitializationResolveRef.current?.({ status: "error", error });
        reportWorkspaceError(error);
      });

    return () => {
      cancelled = true;
    };
  }, [reportWorkspaceError, setWorkspaceStatus]);

  useEffect(() => {
    if (
      !isDesktopRuntime() ||
      persistenceStatus !== "ready" ||
      selectedFile.source !== "local" ||
      !selectedFile.projectId
    ) {
      return;
    }
    const request = {
      projectId: selectedFile.projectId,
      fileId: selectedFile.id,
      explanationId: selectedExplanationId || undefined,
      selectionStartLine: selection.selectedCodeSelection.startLine,
      selectionEndLine: selection.selectedCodeSelection.endLine
    };
    const saveVersion = ++resumeSaveVersionRef.current;
    readerResumeStateRef.current = {
      ...request,
      updatedAt: readerResumeStateRef.current?.updatedAt ?? ""
    };
    resumeSaveChainRef.current = resumeSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const saved = await saveReaderResumeState(request);
        if (saveVersion === resumeSaveVersionRef.current) readerResumeStateRef.current = saved;
      })
      .catch((error) => reportWorkspaceError(error, "保存最近阅读位置失败："));
  }, [
    persistenceStatus,
    reportWorkspaceError,
    selectedExplanationId,
    selectedFile,
    selection.selectedCodeSelection.endLine,
    selection.selectedCodeSelection.startLine
  ]);

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
      const workspaceEpoch = workspaceEpochRef.current;
      if (activeWorkspaceProjectIdRef.current !== projectId) return;
      const guideRefreshVersion = ++guideRefreshVersionRef.current;
      const guide = await loadProjectGuide(projectId);
      if (
        guide &&
        workspaceEpoch === workspaceEpochRef.current &&
        guideRefreshVersion === guideRefreshVersionRef.current &&
        activeWorkspaceProjectIdRef.current === projectId &&
        shouldApply()
      ) {
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
      const operation = beginWorkspaceOperation(file.id, { kind: "preserve" });
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
      beginWorkspaceOperation,
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
      const operation = existingOperation ?? beginWorkspaceOperation(fileId, { kind: "preserve" });
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
      beginWorkspaceOperation,
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
        invalidateWorkspaceOperation(file.id, { kind: "preserve" });
        workspaceTouchedRef.current = true;
        setWorkspaceStatus(file.capability.reason ?? "该文件暂不支持预览。");
        return;
      }
      if (file.source === "local" && !file.isLoaded) {
        workspaceTouchedRef.current = true;
        const operation = beginWorkspaceOperation(file.id, { kind: "preserve" });
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
      invalidateWorkspaceOperation(file.id, { kind: "preserve" });
      setActiveLoadedFile(file);
    },
    [
      beginWorkspaceOperation,
      files,
      invalidateWorkspaceOperation,
      loadAndSelectFile,
      setActiveLoadedFile,
      setWorkspaceStatus
    ]
  );

  const navigateToExplanation = useCallback(
    async (target: WorkspaceNavigationTarget) => {
      const file = files.find((item) => item.id === target.fileId);
      if (!file || (target.projectId && file.projectId !== target.projectId)) {
        setWorkspaceStatus("相关目标不在当前项目中，已保留原阅读位置。");
        return false;
      }
      const operation = beginWorkspaceOperation(
        `navigate:${target.fileId}:${target.explanationId ?? "line"}`,
        {
          kind: "preserve"
        }
      );
      let candidate = file;
      setIsWorkspaceBusy(true);
      setLoadingFileId(file.id);
      try {
        if (file.source === "local" && !file.isLoaded) {
          if (!file.grantId) {
            setWorkspaceStatus("相关文件授权已失效，请重新打开项目；当前阅读位置保持不变。");
            return false;
          }
          const loaded = await loadCodeFile(file.id, file.grantId);
          if (!operationGateRef.current.isCurrent(operation)) return false;
          candidate = await hydrateLoadedFile({
            ...loaded,
            projectRoot: file.projectRoot ?? loaded.projectRoot,
            relativePath: file.relativePath ?? loaded.relativePath
          });
          if (!operationGateRef.current.isCurrent(operation)) return false;
        }
        let requested = resolveNavigationExplanation(candidate, target);
        if (!target.explanationId && target.targetType) {
          requested = buildUnexplainedNavigationTarget(candidate, {
            targetType: target.targetType,
            startLine: target.startLine,
            endLine: target.endLine
          });
          if (!requested) {
            setWorkspaceStatus("相关结构目标已失效或超出当前代码范围，已保留原阅读位置。");
            return false;
          }
          candidate = {
            ...candidate,
            explanations: [
              ...candidate.explanations.filter((item) => item.id !== requested?.id),
              requested
            ]
          };
        }
        if (target.explanationId && !requested) {
          setWorkspaceStatus("相关解释已删除或失效，已保留原阅读位置。");
          return false;
        }
        if (!operationGateRef.current.isCurrent(operation)) return false;
        if (candidate !== file) upsertFile(candidate);
        setActiveLoadedFile(candidate);
        if (requested) setSelectedExplanationId(requested.id);
        const startLine = target.startLine ?? requested?.startLine;
        if (startLine) {
          setSelectedCodeSelection({
            startLine,
            endLine: target.endLine ?? requested?.endLine ?? startLine
          });
        }
        setWorkspaceStatus(
          `已跳转到 ${candidate.relativePath ?? candidate.name}${startLine ? ` 第 ${startLine} 行` : ""}`
        );
        return true;
      } catch (error) {
        if (operationGateRef.current.isCurrent(operation)) {
          setWorkspaceStatus(`相关代码跳转失败，已保留原阅读位置：${errorMessage(error)}`);
        }
        return false;
      } finally {
        if (operationGateRef.current.isCurrent(operation)) {
          setIsWorkspaceBusy(false);
          setLoadingFileId(null);
        }
      }
    },
    [
      beginWorkspaceOperation,
      files,
      hydrateLoadedFile,
      setActiveLoadedFile,
      setSelectedCodeSelection,
      setSelectedExplanationId,
      setWorkspaceStatus,
      upsertFile
    ]
  );

  const expandDirectory = useCallback(
    async (directoryId: string) => {
      const grantId = files.find((file) => file.grantId)?.grantId;
      if (!grantId) {
        setWorkspaceStatus("Folder authorization expired. Reopen the folder.");
        return;
      }
      const operation = beginWorkspaceOperation(`expand:${grantId}:${directoryId}`, {
        kind: "preserve"
      });
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
    [beginWorkspaceOperation, files, projectNodes, reportWorkspaceError, setWorkspaceStatus]
  );

  async function openSampleProject() {
    const operation = beginWorkspaceOperation("sample-project", {
      kind: "replace",
      projectId: sampleProjectId
    });
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
    const operation = beginWorkspaceOperation("open-file", { kind: "replace" });
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
      replaceActiveWorkspaceProject(hydratedFile.projectId);
      setWorkspaceStatus(`已加载 ${hydratedFile.path}`);
    } catch (error) {
      if (operationGateRef.current.isCurrent(operation)) reportWorkspaceError(error);
    } finally {
      if (operationGateRef.current.isCurrent(operation)) setIsWorkspaceBusy(false);
    }
  }

  async function openProjectWithResume(resume?: ReaderResumeState | null) {
    if (!isDesktopRuntime()) {
      setWorkspaceStatus("本地项目打开需要在 Tauri 桌面端运行。");
      return;
    }
    const operation = beginWorkspaceOperation("open-project", { kind: "replace" });
    workspaceTouchedRef.current = true;
    setIsWorkspaceBusy(true);
    try {
      const project = await pickAndScanProject();
      if (!operationGateRef.current.isCurrent(operation)) return;
      if (!project) {
        setWorkspaceStatus("已取消打开项目");
        return;
      }
      rememberRecentProjectName(project.rootPath, setRecentProjectName);
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

      const resumeMatchesProject = Boolean(resume && guide && resume.projectId === guide.projectId);
      const resumeFileExists = Boolean(
        resumeMatchesProject &&
        resume?.fileId &&
        project.files.some((file) => file.id === resume.fileId)
      );
      const projectOpenPlan = buildProjectOpenPlan(
        project,
        resumeFileExists ? resume?.fileId : guide?.readingPath[0]?.fileId
      );
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
      let recoveryMessage = "";
      let restoredExplanationId = "";
      let restoredSelection: { startLine: number; endLine: number } | undefined;
      if (resume) {
        if (!resumeMatchesProject) {
          recoveryMessage = "；所选项目与最近记录不匹配，已从推荐路径打开";
        } else if (!resumeFileExists || activeFirstFile.id !== resume.fileId) {
          recoveryMessage = "；最近目标已删除或失效，已回退到推荐路径";
        } else {
          const restoredExplanation = resume.explanationId
            ? activeFirstFile.explanations.find(
                (item) => item.id === resume.explanationId && item.status !== "deleted"
              )
            : undefined;
          if (resume.explanationId && !restoredExplanation) {
            recoveryMessage = "；最近目标已删除或失效，已回退到推荐路径";
            const recommendedFileId = guide?.readingPath[0]?.fileId;
            if (recommendedFileId && recommendedFileId !== activeFirstFile.id) {
              activeFirstFile = await hydrateLoadedFile(
                await loadFirstAvailableProjectFile(project, recommendedFileId)
              );
              if (!operationGateRef.current.isCurrent(operation)) return;
            }
          } else {
            recoveryMessage = "；已重新授权并恢复最近阅读位置";
            if (restoredExplanation) restoredExplanationId = restoredExplanation.id;
            const lineCount = Math.max(1, activeFirstFile.code.split(/\r?\n/).length);
            const start = Math.min(Math.max(1, resume.selectionStartLine ?? 1), lineCount);
            const end = Math.min(Math.max(start, resume.selectionEndLine ?? start), lineCount);
            restoredSelection = { startLine: start, endLine: end };
          }
        }
      }
      setFiles(
        placeholders.map((file) => (file.id === activeFirstFile.id ? activeFirstFile : file))
      );
      setActiveLoadedFile(activeFirstFile);
      if (restoredExplanationId) setSelectedExplanationId(restoredExplanationId);
      if (restoredSelection) setSelectedCodeSelection(restoredSelection);
      replaceActiveWorkspaceProject(activeFirstFile.projectId);
      if (guide && activeFirstFile.projectId) {
        await refreshPersistedProjectGuide(activeFirstFile.projectId, () =>
          operationGateRef.current.isCurrent(operation)
        );
        if (!operationGateRef.current.isCurrent(operation)) return;
      }
      setWorkspaceStatus(
        `${project.files.length} 个文件，${previewableFiles.length} 个可预览：${project.rootPath}${projectOpenPlan.scanNote}${guideError ? `；阅读路径生成失败：${guideError}` : ""}${recoveryMessage}`
      );
    } catch (error) {
      if (operationGateRef.current.isCurrent(operation)) reportWorkspaceError(error);
    } finally {
      if (operationGateRef.current.isCurrent(operation)) setIsWorkspaceBusy(false);
    }
  }

  async function openProject() {
    await openProjectWithResume();
  }

  async function continueRecentProject() {
    const initializationPromise = resumeInitializationPromiseRef.current;
    if (!initializationPromise) {
      reportWorkspaceError(new Error("Recent-position initialization did not start."));
      return;
    }
    const initialization: ResumeInitializationResult = await initializationPromise;
    if (initialization.status === "error") {
      reportWorkspaceError(initialization.error, "无法读取最近阅读位置：");
      return;
    }
    await openProjectWithResume(readerResumeStateRef.current ?? initialization.state);
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
    continueRecentProject,
    copyErrorDetail,
    databasePath,
    displayedProjectGuide,
    expandDirectory,
    filesForExplorer,
    guideFocusToken,
    isWorkspaceBusy,
    loadingFileId,
    navigateToExplanation,
    openFile,
    openProject,
    openSampleProject,
    persistenceStatus,
    projectNodes,
    readingStates,
    recentProjectName,
    resumeInitializationStatus,
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

export function resolveNavigationExplanation(file: CodeFile, target: WorkspaceNavigationTarget) {
  const explanations = buildSelectableExplanations(file);
  if (target.explanationId) {
    return explanations.find(
      (item) => item.id === target.explanationId && item.status !== "deleted"
    );
  }
  return explanations
    .filter(
      (item) =>
        target.startLine !== undefined &&
        item.startLine !== undefined &&
        item.startLine <= target.startLine &&
        (item.endLine ?? item.startLine) >= target.startLine &&
        item.status !== "deleted"
    )
    .sort(
      (left, right) =>
        (left.endLine ?? left.startLine ?? 0) -
        (left.startLine ?? 0) -
        ((right.endLine ?? right.startLine ?? 0) - (right.startLine ?? 0))
    )[0];
}

function readRecentProjectName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(RECENT_PROJECT_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberRecentProjectName(rootPath: string, setRecentProjectName: (name: string) => void) {
  const name = recentProjectNameFromRoot(rootPath);
  if (!name) return;
  setRecentProjectName(name);
  try {
    window.localStorage.setItem(RECENT_PROJECT_NAME_KEY, name);
  } catch {
    // The in-memory label still provides the current-session recovery entry.
  }
}

export function recentProjectNameFromRoot(rootPath: string): string {
  return rootPath.split(/[\\/]/).filter(Boolean).at(-1)?.trim() ?? "";
}
