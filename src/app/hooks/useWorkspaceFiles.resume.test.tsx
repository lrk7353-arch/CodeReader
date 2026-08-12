// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleFiles, sampleProjectGuide } from "../../data/sampleWorkspace";
import type { ReaderResumeState } from "../../types/explanation";

const desktop = vi.hoisted(() => ({
  resumeProjectId: "project:recent",
  resumeFileId: "file:recent",
  resumeExplanationId: "explanation:recent",
  guideProjectId: "project:recent",
  loadReaderResumeState: vi.fn(),
  pickAndScanProject: vi.fn(),
  loadCodeFile: vi.fn()
}));

vi.mock("../../services/desktopWorkspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/desktopWorkspace")>()),
  isDesktopRuntime: () => true,
  initializePersistence: vi.fn(async () => ({
    initialized: true,
    databasePath: "<app-data>/codereader.sqlite"
  })),
  loadReaderResumeState: desktop.loadReaderResumeState,
  saveReaderResumeState: vi.fn(async (state) => ({
    ...state,
    updatedAt: "2026-08-09T00:00:01Z"
  })),
  hydrateCodeFilePersistence: vi.fn(async (file) => file),
  pickAndScanProject: desktop.pickAndScanProject,
  loadCodeFile: desktop.loadCodeFile,
  generateProjectGuide: vi.fn(async () => ({
    ...sampleProjectGuide,
    projectId: desktop.guideProjectId,
    readingPath: [
      {
        ...sampleProjectGuide.readingPath[0],
        id: "step:recent",
        fileId: "file:recent"
      }
    ]
  })),
  loadProjectGuide: vi.fn(async () => null)
}));

import { useWorkspaceFiles } from "./useWorkspaceFiles";

describe("recent project recovery", () => {
  beforeEach(() => {
    desktop.resumeProjectId = "project:recent";
    desktop.resumeFileId = "file:recent";
    desktop.resumeExplanationId = "explanation:recent";
    desktop.guideProjectId = "project:recent";
    desktop.loadReaderResumeState.mockReset();
    desktop.pickAndScanProject.mockReset();
    desktop.loadCodeFile.mockReset();
    desktop.loadReaderResumeState.mockImplementation(async () => ({
      projectId: desktop.resumeProjectId,
      fileId: desktop.resumeFileId,
      explanationId: desktop.resumeExplanationId,
      selectionStartLine: 2,
      selectionEndLine: 3,
      updatedAt: "2026-08-09T00:00:00Z"
    }));
    const explanation = {
      ...sampleFiles[0].explanations[0],
      id: "explanation:recent",
      projectId: "project:recent",
      fileId: "file:recent"
    };
    desktop.pickAndScanProject.mockResolvedValue({
      grantId: "grant:reauthorized",
      rootPath: "/selected/recent",
      files: [
        {
          id: "file:recent",
          name: "recent.ts",
          path: "/selected/recent/recent.ts",
          relativePath: "recent.ts",
          language: "typescript",
          capability: sampleFiles[0].capability
        }
      ],
      nodes: [],
      truncated: false,
      skippedEntries: 0
    });
    desktop.loadCodeFile.mockResolvedValue({
      ...sampleFiles[0],
      id: "file:recent",
      projectId: "project:recent",
      path: "/selected/recent/recent.ts",
      relativePath: "recent.ts",
      source: "local",
      isLoaded: true,
      explanations: [explanation]
    });
  });

  it("waits for deferred resume initialization before opening the native picker", async () => {
    let resolveResume!: (state: ReaderResumeState | null) => void;
    const deferredResume = new Promise<ReaderResumeState | null>((resolve) => {
      resolveResume = resolve;
    });
    desktop.loadReaderResumeState.mockReset();
    desktop.loadReaderResumeState.mockReturnValue(deferredResume);

    const { result } = renderHook(() => useWorkspaceFiles());
    let continuePromise!: Promise<void>;
    act(() => {
      continuePromise = result.current.continueRecentProject();
    });
    await waitFor(() => expect(desktop.loadReaderResumeState).toHaveBeenCalledOnce());
    expect(result.current.resumeInitializationStatus).toBe("loading");
    expect(desktop.pickAndScanProject).not.toHaveBeenCalled();

    resolveResume({
      projectId: "project:recent",
      fileId: "file:recent",
      explanationId: "explanation:recent",
      selectionStartLine: 2,
      selectionEndLine: 3,
      updatedAt: "2026-08-09T00:00:00Z"
    });
    await act(async () => continuePromise);

    expect(desktop.pickAndScanProject).toHaveBeenCalledOnce();
    expect(result.current.selectedFile.id).toBe("file:recent");
    expect(result.current.selectedExplanation?.id).toBe("explanation:recent");
    expect(result.current.selectedCodeSelection).toEqual({ startLine: 2, endLine: 3 });
  });

  it("reauthorizes through the picker and restores a matching target", async () => {
    const { result } = renderHook(() => useWorkspaceFiles());
    await waitFor(() => expect(result.current.persistenceStatus).toBe("ready"));
    await act(async () => result.current.continueRecentProject());
    expect(desktop.pickAndScanProject).toHaveBeenCalledOnce();
    expect(result.current.selectedFile.id).toBe("file:recent");
    expect(result.current.selectedExplanation?.id).toBe("explanation:recent");
    expect(result.current.selectedCodeSelection).toEqual({ startLine: 2, endLine: 3 });
    expect(result.current.workspaceStatus).toContain("已重新授权并恢复最近阅读位置");
  });

  it("does not restore a target when the reauthorized project identity differs", async () => {
    desktop.guideProjectId = "project:different";
    const { result } = renderHook(() => useWorkspaceFiles());
    await waitFor(() => expect(result.current.persistenceStatus).toBe("ready"));
    await act(async () => result.current.continueRecentProject());
    expect(desktop.pickAndScanProject).toHaveBeenCalledOnce();
    expect(result.current.workspaceStatus).toContain("所选项目与最近记录不匹配");
  });

  it("falls back to the recommended target when the saved target was deleted", async () => {
    desktop.resumeExplanationId = "explanation:deleted";
    const { result } = renderHook(() => useWorkspaceFiles());
    await waitFor(() => expect(result.current.persistenceStatus).toBe("ready"));
    await act(async () => result.current.continueRecentProject());
    expect(result.current.selectedExplanation?.id).toBe("explanation:recent");
    expect(result.current.workspaceStatus).toContain("最近目标已删除或失效");
  });

  it("keeps the preview safe when reauthorization is cancelled or expired", async () => {
    desktop.pickAndScanProject.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useWorkspaceFiles());
    await waitFor(() => expect(result.current.persistenceStatus).toBe("ready"));
    await act(async () => result.current.continueRecentProject());
    expect(desktop.pickAndScanProject).toHaveBeenCalledOnce();
    expect(result.current.selectedFile.source).toBe("sample");
  });
});
