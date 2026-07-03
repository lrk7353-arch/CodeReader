import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeFile, Explanation, ReadingState } from "../../types/explanation";
import { isTransientExplanation, useExplanationFeedback } from "./useExplanationFeedback";

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => false),
  persistExplanationFeedback: vi.fn(() => Promise.resolve()),
  persistReadingState: vi.fn(() => Promise.resolve())
}));

vi.mock("../../services/desktopWorkspace", () => ({
  isDesktopRuntime: mocks.isDesktopRuntime,
  persistExplanationFeedback: mocks.persistExplanationFeedback,
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
    mocks.persistReadingState.mockReset();
    mocks.persistExplanationFeedback.mockResolvedValue(undefined);
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

  it("persists regenerate_requested feedback and demotes reading state to needs_reexplain", async () => {
    mocks.isDesktopRuntime.mockReturnValue(true);
    const file = codeFile({ projectId: "project-1" });
    const entry = explanation({ id: "exp-1", targetName: "compute" });
    file.explanations.push(entry);
    const refresh = vi.fn(() => Promise.resolve());

    const probe = renderProbe({ file, explanation: entry, refresh });

    await probe.api.onFeedback("regenerate_requested");

    expect(mocks.persistExplanationFeedback).toHaveBeenCalledWith(
      "project-1",
      "exp-1",
      "regenerate_requested"
    );
    expect(mocks.persistReadingState).toHaveBeenCalledWith("project-1", "exp-1", "needs_reexplain");
    expect(mocks.persistReadingState).toHaveBeenCalledTimes(1);
    expect(probe.readingStates["exp-1"]).toBe("needs_reexplain");
    expect(refresh).toHaveBeenCalledWith("project-1");
    expect(probe.getStatus()).toContain("解释反馈已保存");
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
