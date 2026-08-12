// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeFile, Explanation } from "../../types/explanation";

const desktop = vi.hoisted(() => ({
  loadCodeFile: vi.fn()
}));

vi.mock("../../services/desktopWorkspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/desktopWorkspace")>()),
  isDesktopRuntime: () => false,
  loadCodeFile: desktop.loadCodeFile
}));

import { useWorkspaceFiles } from "./useWorkspaceFiles";

describe("useWorkspaceFiles related navigation", () => {
  beforeEach(() => desktop.loadCodeFile.mockReset());

  it("loads an unloaded target and commits its explanation and line range", async () => {
    const origin = codeFile({ id: "file:origin", projectId: "project:a" });
    const target = codeFile({
      id: "file:target",
      projectId: "project:a",
      grantId: "grant:a",
      isLoaded: false,
      explanations: []
    });
    desktop.loadCodeFile.mockResolvedValueOnce(
      codeFile({
        id: target.id,
        projectId: "project:a",
        grantId: "grant:a",
        explanations: [explanation({ id: "exp:target", startLine: 17, endLine: 21 })]
      })
    );
    const { result } = renderHook(() => useWorkspaceFiles());
    act(() => result.current.setFiles([origin, target]));

    let moved = false;
    await act(async () => {
      moved = await result.current.navigateToExplanation({
        projectId: "project:a",
        fileId: target.id,
        explanationId: "exp:target"
      });
    });

    expect(moved).toBe(true);
    expect(desktop.loadCodeFile).toHaveBeenCalledWith("file:target", "grant:a");
    expect(result.current.selectedFile.id).toBe("file:target");
    expect(result.current.selectedExplanation?.id).toBe("exp:target");
    expect(result.current.selectedCodeSelection).toEqual({ startLine: 17, endLine: 21 });
  });

  it("preserves file, explanation, and line context on authorization or target failure", async () => {
    const originExplanation = explanation({ id: "exp:origin", startLine: 4, endLine: 8 });
    const origin = codeFile({
      id: "file:origin",
      projectId: "project:a",
      explanations: [originExplanation]
    });
    const unauthorized = codeFile({
      id: "file:unauthorized",
      projectId: "project:a",
      grantId: undefined,
      isLoaded: false,
      explanations: []
    });
    const missingTarget = codeFile({
      id: "file:missing-target",
      projectId: "project:a",
      explanations: [explanation({ id: "exp:other" })]
    });
    const { result } = renderHook(() => useWorkspaceFiles());
    act(() => result.current.setFiles([origin, unauthorized, missingTarget]));
    act(() => result.current.selectExplanation("exp:origin"));

    for (const target of [
      { fileId: unauthorized.id, explanationId: "exp:any" },
      { fileId: missingTarget.id, explanationId: "exp:deleted" },
      { projectId: "project:b", fileId: missingTarget.id, explanationId: "exp:other" }
    ]) {
      let moved = true;
      await act(async () => {
        moved = await result.current.navigateToExplanation(target);
      });
      expect(moved).toBe(false);
      expect(result.current.selectedFile.id).toBe("file:origin");
      expect(result.current.selectedExplanation?.id).toBe("exp:origin");
      expect(result.current.selectedCodeSelection).toEqual({ startLine: 4, endLine: 8 });
    }
  });

  it("suppresses a late A navigation after rapid A to B navigation", async () => {
    const origin = codeFile({ id: "file:origin", projectId: "project:a" });
    const targetA = codeFile({
      id: "file:a",
      projectId: "project:a",
      grantId: "grant:a",
      isLoaded: false,
      explanations: []
    });
    const targetB = codeFile({
      id: "file:b",
      projectId: "project:a",
      grantId: "grant:a",
      isLoaded: false,
      explanations: []
    });
    const delayedA = deferred<CodeFile>();
    const delayedB = deferred<CodeFile>();
    desktop.loadCodeFile.mockImplementation((fileId: string) =>
      fileId === targetA.id ? delayedA.promise : delayedB.promise
    );
    const { result } = renderHook(() => useWorkspaceFiles());
    act(() => result.current.setFiles([origin, targetA, targetB]));

    let navigationA!: Promise<boolean>;
    let navigationB!: Promise<boolean>;
    act(() => {
      navigationA = result.current.navigateToExplanation({
        projectId: "project:a",
        fileId: targetA.id,
        explanationId: "exp:a"
      });
      navigationB = result.current.navigateToExplanation({
        projectId: "project:a",
        fileId: targetB.id,
        explanationId: "exp:b"
      });
    });
    delayedB.resolve(
      codeFile({
        id: targetB.id,
        projectId: "project:a",
        explanations: [explanation({ id: "exp:b", startLine: 30 })]
      })
    );
    await act(async () => expect(await navigationB).toBe(true));
    delayedA.resolve(
      codeFile({
        id: targetA.id,
        projectId: "project:a",
        explanations: [explanation({ id: "exp:a", startLine: 10 })]
      })
    );
    await act(async () => expect(await navigationA).toBe(false));

    expect(result.current.selectedFile.id).toBe("file:b");
    expect(result.current.selectedExplanation?.id).toBe("exp:b");
    expect(result.current.selectedCodeSelection.startLine).toBe(30);
  });

  it.each([
    ["function", 3, 5],
    ["block", 7, 9],
    ["line", 11, 11]
  ] as const)(
    "selects a version-bound unexplained %s target instead of an enclosing old explanation",
    async (targetType, startLine, endLine) => {
      const origin = codeFile({
        id: "file:origin",
        code: Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n"),
        fileHash: "hash:v1",
        explanations: [
          explanation({ id: "exp:origin", targetType: "file", startLine: 1, endLine: 12 })
        ],
        codeNodes:
          targetType === "line"
            ? []
            : [
                {
                  id: `node:${targetType}`,
                  filePath: "src/main.ts",
                  nodeType: targetType,
                  name: `${targetType} target`,
                  startLine,
                  endLine,
                  codeHash: `node-hash:${targetType}`,
                  anchorText: `${targetType} anchor`
                }
              ]
      });
      const { result } = renderHook(() => useWorkspaceFiles());
      act(() => result.current.setFiles([origin]));
      act(() => result.current.selectExplanation("exp:origin"));

      let moved = false;
      await act(async () => {
        moved = await result.current.navigateToExplanation({
          projectId: "project:a",
          fileId: origin.id,
          targetType,
          startLine,
          endLine
        });
      });

      expect(moved).toBe(true);
      expect(result.current.selectedExplanation).toMatchObject({
        targetType,
        startLine,
        endLine,
        status: "new_unexplained",
        fileHash: "hash:v1"
      });
      expect(result.current.selectedExplanation?.id).toContain(
        `:${targetType}:${startLine}-${endLine}:hash%3Av1`
      );
      expect(result.current.selectedExplanation?.id).not.toBe("exp:origin");

      await act(async () => {
        moved = await result.current.navigateToExplanation({
          projectId: "project:a",
          fileId: origin.id,
          explanationId: "exp:origin",
          startLine: 1,
          endLine: 12
        });
      });
      expect(moved).toBe(true);
      expect(result.current.selectedExplanation?.id).toBe("exp:origin");
      expect(result.current.selectedCodeSelection).toEqual({ startLine: 1, endLine: 12 });
    }
  );

  it.each([
    ["function", 3, 5],
    ["block", 7, 9],
    ["line", 99, 99]
  ] as const)(
    "rejects an invalid or out-of-range unexplained %s target atomically",
    async (targetType, startLine, endLine) => {
      const origin = codeFile({
        id: "file:origin",
        code: "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine",
        explanations: [explanation({ id: "exp:origin", startLine: 2, endLine: 2 })],
        codeNodes: []
      });
      const { result } = renderHook(() => useWorkspaceFiles());
      act(() => result.current.setFiles([origin]));
      act(() => result.current.selectExplanation("exp:origin"));

      let moved = true;
      await act(async () => {
        moved = await result.current.navigateToExplanation({
          projectId: "project:a",
          fileId: origin.id,
          targetType,
          startLine,
          endLine
        });
      });

      expect(moved).toBe(false);
      expect(result.current.selectedFile.id).toBe("file:origin");
      expect(result.current.selectedExplanation?.id).toBe("exp:origin");
      expect(result.current.selectedCodeSelection).toEqual({ startLine: 2, endLine: 2 });
    }
  );
});

function codeFile(overrides: Partial<CodeFile> = {}): CodeFile {
  return {
    id: "file:test",
    name: "main.ts",
    path: "src/main.ts",
    projectId: "project:a",
    relativePath: "src/main.ts",
    language: "typescript",
    code: "export function main() {}",
    explanations: [explanation()],
    codeNodes: [],
    source: "local",
    isLoaded: true,
    ...overrides
  };
}

function explanation(overrides: Partial<Explanation> = {}): Explanation {
  return {
    id: "exp:test",
    filePath: "src/main.ts",
    targetType: "function",
    targetName: "main",
    startLine: 1,
    endLine: 1,
    codeMeaning: "Main entry",
    status: "valid",
    readingState: "read",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
