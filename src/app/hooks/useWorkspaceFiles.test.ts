import { describe, expect, it } from "vitest";
import type { CodeFile } from "../../types/explanation";
import {
  recentProjectNameFromRoot,
  resolveNavigationExplanation,
  resolveWorkspaceName,
  shouldApplyInitialWorkspaceHydration
} from "./useWorkspaceFiles";

describe("useWorkspaceFiles helpers", () => {
  it("does not let late sample hydration overwrite a touched workspace", () => {
    expect(shouldApplyInitialWorkspaceHydration(false, false)).toBe(true);
    expect(shouldApplyInitialWorkspaceHydration(true, false)).toBe(false);
    expect(shouldApplyInitialWorkspaceHydration(false, true)).toBe(false);
  });

  it("derives a compact workspace name from local roots and files", () => {
    expect(
      resolveWorkspaceName([
        codeFile({
          projectRoot: "/home/user/projects/baseline_v4",
          source: "local"
        })
      ])
    ).toBe("baseline_v4");

    expect(
      resolveWorkspaceName([
        codeFile({
          path: "C:\\Users\\me\\scratch\\model.py",
          source: "local"
        })
      ])
    ).toBe("scratch");

    expect(resolveWorkspaceName([codeFile({ source: "sample" })])).toBe("examples");
  });

  it("retains only a display name for the recent-project recovery entry", () => {
    expect(recentProjectNameFromRoot("/home/alice/private/code-reader")).toBe("code-reader");
    expect(recentProjectNameFromRoot("C:\\Users\\alice\\private\\reader-app\\")).toBe("reader-app");
    expect(recentProjectNameFromRoot("/")).toBe("");
  });

  it("validates a related target before navigation can replace the current context", () => {
    const available = codeFile({
      explanations: [
        {
          id: "exp:available",
          filePath: "/tmp/model.py",
          targetType: "function",
          startLine: 4,
          endLine: 8,
          codeMeaning: "available",
          status: "valid",
          readingState: "read",
          createdAt: "2026-08-09T00:00:00.000Z",
          updatedAt: "2026-08-09T00:00:00.000Z"
        }
      ]
    });
    expect(
      resolveNavigationExplanation(available, {
        fileId: available.id,
        explanationId: "exp:missing"
      })
    ).toBeUndefined();
    expect(
      resolveNavigationExplanation(available, { fileId: available.id, startLine: 6 })?.id
    ).toBe("exp:available");
  });
});

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
