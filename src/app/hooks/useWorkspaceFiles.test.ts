import { describe, expect, it } from "vitest";
import type { CodeFile } from "../../types/explanation";
import { resolveWorkspaceName, shouldApplyInitialWorkspaceHydration } from "./useWorkspaceFiles";

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
