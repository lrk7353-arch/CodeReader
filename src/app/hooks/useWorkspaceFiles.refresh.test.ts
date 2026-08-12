// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeFile, ProjectGuide } from "../../types/explanation";

const mocks = vi.hoisted(() => ({
  hydrateCodeFilePersistence: vi.fn((file: CodeFile) => Promise.resolve(file)),
  expandGrantedDirectory: vi.fn(),
  initializePersistence: vi.fn(() => Promise.resolve({ initialized: false, databasePath: "" })),
  isDesktopRuntime: vi.fn(() => true),
  loadProjectGuide: vi.fn(),
  persistCognitionState: vi.fn(),
  persistExplanationFeedback: vi.fn(),
  pickAndLoadCodeFile: vi.fn()
}));

vi.mock("../../services/desktopWorkspace", () => ({
  expandGrantedDirectory: mocks.expandGrantedDirectory,
  generateProjectGuide: vi.fn(),
  hydrateCodeFilePersistence: mocks.hydrateCodeFilePersistence,
  initializePersistence: mocks.initializePersistence,
  isDesktopRuntime: mocks.isDesktopRuntime,
  loadCodeFile: vi.fn(),
  loadProjectGuide: mocks.loadProjectGuide,
  pickAndLoadCodeFile: mocks.pickAndLoadCodeFile,
  pickAndScanProject: vi.fn(),
  persistCognitionState: mocks.persistCognitionState,
  persistExplanationFeedback: mocks.persistExplanationFeedback,
  persistReadingState: vi.fn()
}));

import { sampleProjectId } from "../../data/sampleWorkspace";
import { useExplanationFeedback } from "./useExplanationFeedback";
import { useWorkspaceFiles } from "./useWorkspaceFiles";

describe("useWorkspaceFiles persisted-guide refresh", () => {
  beforeEach(() => {
    mocks.hydrateCodeFilePersistence.mockClear();
    mocks.initializePersistence.mockClear();
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.loadProjectGuide.mockReset();
    mocks.expandGrantedDirectory.mockReset();
    mocks.persistCognitionState.mockReset();
    mocks.persistExplanationFeedback.mockReset();
    mocks.pickAndLoadCodeFile.mockReset();
    mocks.persistCognitionState.mockResolvedValue({ revision: 1 });
    mocks.persistExplanationFeedback.mockResolvedValue(undefined);
  });

  it("does not let a delayed project A guide overwrite the sample workspace", async () => {
    const delayed = deferred<ProjectGuide | undefined>();
    mocks.loadProjectGuide.mockReturnValueOnce(delayed.promise);
    mocks.pickAndLoadCodeFile.mockResolvedValueOnce(localFile("project-a"));
    const { result } = renderHook(() => useWorkspaceFiles());

    await act(async () => {
      await result.current.openFile();
    });
    const refresh = result.current.refreshPersistedProjectGuide("project-a");
    await waitFor(() => expect(mocks.loadProjectGuide).toHaveBeenCalledWith("project-a"));

    await act(async () => {
      await result.current.openSampleProject();
    });
    delayed.resolve(projectGuide("project-a"));
    await act(async () => {
      await refresh;
    });

    expect(result.current.displayedProjectGuide?.projectId).toBe(sampleProjectId);
  });

  it("does not let a delayed project A guide overwrite a single-file project B", async () => {
    const delayed = deferred<ProjectGuide | undefined>();
    mocks.loadProjectGuide.mockReturnValueOnce(delayed.promise);
    mocks.pickAndLoadCodeFile
      .mockResolvedValueOnce(localFile("project-a"))
      .mockResolvedValueOnce(localFile("project-b"));
    const { result } = renderHook(() => useWorkspaceFiles());

    await act(async () => {
      await result.current.openFile();
    });
    const refresh = result.current.refreshPersistedProjectGuide("project-a");
    await waitFor(() => expect(mocks.loadProjectGuide).toHaveBeenCalledWith("project-a"));

    await act(async () => {
      await result.current.openFile();
    });
    delayed.resolve(projectGuide("project-a"));
    await act(async () => {
      await refresh;
    });

    expect(result.current.displayedProjectGuide).toBeUndefined();
  });

  it("applies a delayed project A guide after directory expansion and loaded-file selection", async () => {
    const delayed = deferred<ProjectGuide | undefined>();
    mocks.loadProjectGuide.mockReturnValueOnce(delayed.promise);
    mocks.pickAndLoadCodeFile.mockResolvedValueOnce(localFile("project-a"));
    mocks.expandGrantedDirectory.mockResolvedValue({
      rootPath: "/tmp/project-a",
      nodes: [],
      files: [],
      truncated: false
    });
    const { result } = renderHook(() => useWorkspaceFiles());

    await act(async () => {
      await result.current.openFile();
    });
    const refresh = result.current.refreshPersistedProjectGuide("project-a");
    await waitFor(() => expect(mocks.loadProjectGuide).toHaveBeenCalledWith("project-a"));

    await act(async () => {
      await result.current.expandDirectory("directory-a");
      result.current.selectFile("project-a:file");
    });
    delayed.resolve(projectGuide("project-a"));
    await act(async () => {
      await refresh;
    });

    expect(result.current.displayedProjectGuide?.projectId).toBe("project-a");
  });

  it("keeps the newest same-project guide when an older refresh resolves last", async () => {
    const older = deferred<ProjectGuide | undefined>();
    const newer = deferred<ProjectGuide | undefined>();
    mocks.loadProjectGuide.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    mocks.pickAndLoadCodeFile.mockResolvedValueOnce(localFile("project-a"));
    const { result } = renderHook(() => useWorkspaceFiles());

    await act(async () => {
      await result.current.openFile();
    });
    const firstRefresh = result.current.refreshPersistedProjectGuide("project-a");
    await waitFor(() => expect(mocks.loadProjectGuide).toHaveBeenCalledTimes(1));
    const secondRefresh = result.current.refreshPersistedProjectGuide("project-a");
    await waitFor(() => expect(mocks.loadProjectGuide).toHaveBeenCalledTimes(2));

    newer.resolve({ ...projectGuide("project-a"), generatedAt: "newest" });
    await act(async () => {
      await secondRefresh;
    });
    older.resolve({ ...projectGuide("project-a"), generatedAt: "older" });
    await act(async () => {
      await firstRefresh;
    });

    expect(result.current.displayedProjectGuide?.generatedAt).toBe("newest");
  });

  it("keeps project A active through directory expansion so cognition and feedback refresh its guide", async () => {
    mocks.pickAndLoadCodeFile.mockResolvedValueOnce(localFile("project-a", true));
    mocks.expandGrantedDirectory.mockResolvedValue({
      rootPath: "/tmp/project-a",
      nodes: [],
      files: [],
      truncated: false
    });
    mocks.loadProjectGuide.mockResolvedValue(projectGuide("project-a"));
    const { result } = renderHook(() => {
      const workspace = useWorkspaceFiles();
      const file = workspace.selectedFile;
      const feedback = useExplanationFeedback({
        file,
        explanation: file.explanations[0],
        setFiles: workspace.setFiles,
        setReadingStates: workspace.setReadingStates,
        setWorkspaceStatus: workspace.setWorkspaceStatus,
        refreshPersistedProjectGuide: workspace.refreshPersistedProjectGuide
      });
      return { feedback, workspace };
    });

    await act(async () => {
      await result.current.workspace.openFile();
    });
    await act(async () => {
      await result.current.workspace.expandDirectory("directory-a");
    });
    await act(async () => {
      await result.current.feedback.onReadingStateChange({
        visitState: "read",
        masteryState: "understood",
        reviewState: "current"
      });
    });
    expect(mocks.loadProjectGuide).toHaveBeenCalledWith("project-a");

    mocks.loadProjectGuide.mockClear();
    await act(async () => {
      await result.current.feedback.onFeedback("regenerate_requested");
    });
    expect(mocks.loadProjectGuide).toHaveBeenCalledWith("project-a");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function localFile(projectId: string, withExplanation = false): CodeFile {
  return {
    id: `${projectId}:file`,
    projectId,
    name: "file.ts",
    path: `/tmp/${projectId}/file.ts`,
    language: "typescript",
    code: "export {};",
    explanations: withExplanation
      ? [
          {
            id: `${projectId}:explanation`,
            filePath: `/tmp/${projectId}/file.ts`,
            targetType: "file",
            codeMeaning: "test",
            status: "valid",
            readingState: "unread",
            createdAt: "1",
            updatedAt: "1"
          }
        ]
      : [],
    codeNodes: [],
    grantId: `${projectId}:grant`,
    source: "local",
    isLoaded: true
  };
}

function projectGuide(projectId: string): ProjectGuide {
  return {
    projectId,
    rootPath: `/tmp/${projectId}`,
    generatedAt: "1",
    mapItems: [],
    readingPath: [],
    progress: {
      total: 0,
      unread: 0,
      read: 0,
      understood: 0,
      questioned: 0,
      suspicious: 0,
      needsReexplain: 0,
      masteryPercent: 0
    }
  };
}
