import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeFile, Explanation, ReadingState } from "../../types/explanation";
import { isTransientExplanation, useExplanationFeedback } from "./useExplanationFeedback";

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => false),
  persistExplanationFeedback: vi.fn(() => Promise.resolve()),
  persistCognitionState: vi.fn(() => Promise.resolve({ revision: 0 })),
  persistReadingState: vi.fn(() => Promise.resolve())
}));

vi.mock("../../services/desktopWorkspace", () => ({
  isDesktopRuntime: mocks.isDesktopRuntime,
  persistExplanationFeedback: mocks.persistExplanationFeedback,
  persistCognitionState: mocks.persistCognitionState,
  persistReadingState: mocks.persistReadingState
}));

interface ProbeHandle {
  api: ReturnType<typeof useExplanationFeedback>;
  files: CodeFile[];
  readingStates: Record<string, ReadingState>;
  getStatus: () => string;
  refresh: (projectId: string) => Promise<void>;
}

function renderProbe({
  file,
  explanation: entry,
  refresh
}: {
  file: CodeFile;
  explanation?: Explanation;
  refresh?: (projectId: string) => Promise<void>;
}): ProbeHandle {
  const files: CodeFile[] = [file];
  const readingStates: Record<string, ReadingState> = {};
  let status = "";
  const apiRef: { current: ReturnType<typeof useExplanationFeedback> | null } = {
    current: null
  };
  const refreshMock: (projectId: string) => Promise<void> =
    refresh ?? vi.fn(() => Promise.resolve());

  function Probe() {
    const api = useExplanationFeedback({
      file,
      explanation: entry,
      setFiles: (updater) => {
        const next = typeof updater === "function" ? updater(files) : updater;
        files.length = 0;
        files.push(...next);
      },
      setReadingStates: (updater) => {
        const next = typeof updater === "function" ? updater(readingStates) : updater;
        for (const key of Object.keys(readingStates)) {
          delete readingStates[key];
        }
        Object.assign(readingStates, next);
      },
      setWorkspaceStatus: (next) => {
        status = typeof next === "function" ? next(status) : next;
      },
      refreshPersistedProjectGuide: refreshMock
    });
    apiRef.current = api;
    return null;
  }

  renderToStaticMarkup(createElement(Probe));
  if (!apiRef.current) {
    throw new Error("probe did not mount");
  }
  return {
    api: apiRef.current,
    files,
    readingStates,
    getStatus: () => status,
    refresh: refreshMock
  };
}

describe("useExplanationFeedback helpers", () => {
  it("flags explanations whose status is transient", () => {
    expect(isTransientExplanation(explanation({ id: "stable", status: "valid" }))).toBe(false);
    expect(isTransientExplanation(explanation({ id: "stable", status: "transient" }))).toBe(true);
  });

  it("flags range-style explanation ids even when status is valid", () => {
    expect(isTransientExplanation(explanation({ id: "range:file:1-3", status: "valid" }))).toBe(
      true
    );
  });
});

describe("useExplanationFeedback callbacks", () => {
  beforeEach(() => {
    mocks.isDesktopRuntime.mockReturnValue(false);
    mocks.persistExplanationFeedback.mockReset();
    mocks.persistCognitionState.mockReset();
    mocks.persistReadingState.mockReset();
    mocks.persistExplanationFeedback.mockResolvedValue(undefined);
    mocks.persistCognitionState.mockResolvedValue({ revision: 0 });
    mocks.persistReadingState.mockResolvedValue(undefined);
  });

  it("updates local reading state and file explanations without persisting in browser preview", async () => {
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({ id: "exp-1", targetName: "compute" });
    file.explanations.push(entry);
    const refresh = vi.fn(() => Promise.resolve());

    const probe = renderProbe({ file, explanation: entry, refresh });

    await probe.api.onReadingStateChange("read");

    expect(probe.readingStates["exp-1"]).toBe("read");
    expect(probe.files[0].explanations[0].readingState).toBe("read");
    expect(probe.getStatus()).toContain("浏览器预览不写入本地库");
    expect(mocks.persistReadingState).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("short-circuits persistence for transient explanations while updating transient UI state", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({ id: "range:file:1-3", status: "valid" });
    file.explanations.push(entry);
    const refresh = vi.fn(() => Promise.resolve());

    const probe = renderProbe({ file, explanation: entry, refresh });

    await probe.api.onReadingStateChange("read");

    expect(probe.readingStates["range:file:1-3"]).toBe("read");
    expect(probe.files[0].explanations[0].readingState).toBe("read");
    expect(probe.getStatus()).toContain("临时多行选择状态已更新");
    expect(mocks.persistReadingState).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();

    await probe.api.onFeedback("helpful");

    expect(probe.getStatus()).toContain("临时多行选择反馈已记录");
    expect(mocks.persistExplanationFeedback).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("persists reading state on desktop and refreshes the persisted project guide", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({ id: "exp-1", targetName: "compute" });
    file.explanations.push(entry);
    const refresh = vi.fn(() => Promise.resolve());

    const probe = renderProbe({ file, explanation: entry, refresh });

    await probe.api.onReadingStateChange("read");

    expect(mocks.persistReadingState).toHaveBeenCalledWith("project-1", "exp-1", "read");
    expect(mocks.persistReadingState).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith("project-1");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(probe.getStatus()).toContain("阅读状态已保存");
    expect(probe.getStatus()).toContain("compute");
    expect(probe.readingStates["exp-1"]).toBe("read");
    expect(probe.files[0].explanations[0].readingState).toBe("read");
  });

  it("serializes rapid cognition changes so the latest intent wins locally and in persistence", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({ id: "exp-1", targetName: "compute", cognitionRevision: 4 });
    file.explanations.push(entry);
    let resolveFirst: ((value: { revision: number }) => void) | undefined;
    mocks.persistCognitionState
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ revision: 6 });
    const probe = renderProbe({ file, explanation: entry });

    const understood = probe.api.onReadingStateChange({
      visitState: "read",
      masteryState: "understood",
      reviewState: "current"
    });
    const needsReview = probe.api.onReadingStateChange({
      visitState: "read",
      masteryState: "unconfirmed",
      reviewState: "needs_review"
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.persistCognitionState).toHaveBeenCalledTimes(1);
    resolveFirst?.({ revision: 5 });
    await Promise.all([understood, needsReview]);

    expect(mocks.persistCognitionState).toHaveBeenNthCalledWith(
      1,
      "project-1",
      "exp-1",
      { visitState: "read", masteryState: "understood", reviewState: "current" },
      4
    );
    expect(mocks.persistCognitionState).toHaveBeenNthCalledWith(
      2,
      "project-1",
      "exp-1",
      { visitState: "read", masteryState: "unconfirmed", reviewState: "needs_review" },
      5
    );
    expect(probe.files[0].explanations[0].cognitionState).toEqual({
      visitState: "read",
      masteryState: "unconfirmed",
      reviewState: "needs_review"
    });
    expect(probe.files[0].explanations[0].readingState).toBe("needs_reexplain");
    expect(probe.files[0].explanations[0].cognitionRevision).toBe(6);
  });

  it("persists regenerate_requested through cognition while retaining visit and mastery", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({
      id: "exp-1",
      targetName: "compute",
      readingState: "understood",
      cognitionRevision: 4,
      cognitionState: { visitState: "read", masteryState: "understood", reviewState: "current" }
    });
    file.explanations.push(entry);
    const refresh = vi.fn(() => Promise.resolve());

    const probe = renderProbe({ file, explanation: entry, refresh });

    await probe.api.onFeedback("regenerate_requested");

    expect(mocks.persistExplanationFeedback).toHaveBeenCalledWith(
      "project-1",
      "exp-1",
      "regenerate_requested"
    );
    expect(mocks.persistCognitionState).toHaveBeenCalledWith(
      "project-1",
      "exp-1",
      { visitState: "read", masteryState: "understood", reviewState: "needs_review" },
      4
    );
    expect(mocks.persistReadingState).not.toHaveBeenCalled();
    expect(probe.readingStates["exp-1"]).toBe("needs_reexplain");
    expect(probe.files[0].explanations[0].cognitionState).toEqual({
      visitState: "read",
      masteryState: "understood",
      reviewState: "needs_review"
    });
    expect(refresh).toHaveBeenCalledWith("project-1");
    expect(probe.getStatus()).toContain("解释反馈已保存");
  });

  it("queues request re-explain behind a rapid cognition click and keeps the final UI intent", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({ id: "exp-1", cognitionRevision: 4 });
    file.explanations.push(entry);
    let resolveFirst: ((value: { revision: number }) => void) | undefined;
    mocks.persistCognitionState
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ revision: 6 });
    const probe = renderProbe({ file, explanation: entry });

    const understood = probe.api.onReadingStateChange({
      visitState: "read",
      masteryState: "understood",
      reviewState: "current"
    });
    const reexplain = probe.api.onFeedback("regenerate_requested");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.persistCognitionState).toHaveBeenCalledTimes(1);
    resolveFirst?.({ revision: 5 });
    await Promise.all([understood, reexplain]);

    expect(mocks.persistCognitionState).toHaveBeenNthCalledWith(
      2,
      "project-1",
      "exp-1",
      { visitState: "read", masteryState: "understood", reviewState: "needs_review" },
      5
    );
    expect(probe.files[0].explanations[0].cognitionState).toEqual({
      visitState: "read",
      masteryState: "understood",
      reviewState: "needs_review"
    });
    expect(probe.readingStates["exp-1"]).toBe("needs_reexplain");
  });

  it("rolls cognition state back to the confirmed snapshot after a stale save", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.persistCognitionState.mockRejectedValueOnce(
      new Error("Cognition state is stale; reload the current target before saving.")
    );
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({ id: "exp-1" });
    file.explanations.push(entry);
    const probe = renderProbe({ file, explanation: entry });

    await probe.api.onReadingStateChange({
      visitState: "read",
      masteryState: "understood",
      reviewState: "current"
    });

    expect(probe.readingStates["exp-1"]).toBe("unread");
    expect(probe.files[0].explanations[0].cognitionState).toEqual({
      visitState: "unread",
      masteryState: "unconfirmed",
      reviewState: "current"
    });
    expect(probe.getStatus()).toContain("stale");
  });

  it("rolls request-reexplain UI state back when feedback persistence fails", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.persistExplanationFeedback.mockRejectedValueOnce(new Error("disk unavailable"));
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({
      id: "exp-1",
      readingState: "understood",
      cognitionState: { visitState: "read", masteryState: "understood", reviewState: "current" }
    });
    file.explanations.push(entry);
    const probe = renderProbe({ file, explanation: entry });

    await probe.api.onFeedback("regenerate_requested");

    expect(probe.readingStates["exp-1"]).toBe("understood");
    expect(probe.files[0].explanations[0].cognitionState).toEqual(entry.cognitionState);
    expect(probe.getStatus()).toContain("disk unavailable");
    expect(mocks.persistCognitionState).not.toHaveBeenCalled();
  });

  it("records feedback in the browser preview without invoking any persistence", async () => {
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({ id: "exp-1" });
    file.explanations.push(entry);
    const refresh = vi.fn(() => Promise.resolve());

    const probe = renderProbe({ file, explanation: entry, refresh });

    await probe.api.onFeedback("helpful");

    expect(probe.getStatus()).toContain("解释反馈已记录在当前预览");
    expect(probe.getStatus()).toContain("桌面端会写入本地库");
    expect(mocks.persistExplanationFeedback).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("no-ops when no explanation is provided to the hook", async () => {
    const file = codeFile({ projectId: "project-1" });
    const refresh = vi.fn(() => Promise.resolve());

    const probe = renderProbe({ file, refresh });

    await probe.api.onReadingStateChange("read");
    await probe.api.onFeedback("helpful");

    expect(mocks.persistReadingState).not.toHaveBeenCalled();
    expect(mocks.persistExplanationFeedback).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(probe.readingStates).toEqual({});
    expect(probe.files[0].explanations).toEqual([]);
  });

  it("no-ops reading-state changes when no file projectId is associated", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    const file = codeFile({});
    const entry = explanation({ id: "exp-1", targetName: "compute" });
    file.explanations.push(entry);
    const refresh = vi.fn(() => Promise.resolve());

    const probe = renderProbe({ file, explanation: entry, refresh });

    await probe.api.onReadingStateChange("read");

    expect(probe.readingStates["exp-1"]).toBe("read");
    expect(mocks.persistReadingState).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(probe.getStatus()).toContain("浏览器预览不写入本地库");
  });
});

function explanation(overrides: Partial<Explanation>): Explanation {
  return {
    id: "explanation",
    filePath: "/tmp/model.py",
    targetType: "function",
    codeMeaning: "",
    status: "valid",
    readingState: "unread",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides
  };
}

function codeFile(overrides: Partial<CodeFile>): CodeFile {
  return {
    id: "file:test",
    name: "model.py",
    path: "/tmp/model.py",
    language: "python",
    code: "",
    explanations: [],
    codeNodes: [],
    source: "sample",
    isLoaded: true,
    ...overrides
  };
}
