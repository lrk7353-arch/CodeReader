import { describe, expect, it } from "vitest";
import type { CodeFile } from "../../types/explanation";
import { baseName, parentPath, resolveWorkspaceName } from "./workspacePaths";

describe("baseName", () => {
  it("returns the last segment of a posix path", () => {
    expect(baseName("/home/user/projects/baseline_v4")).toBe("baseline_v4");
  });

  it("treats backslashes as separators", () => {
    expect(baseName("C:\\Users\\me\\scratch")).toBe("scratch");
  });

  it("strips one or more trailing slashes before splitting", () => {
    expect(baseName("/home/user/projects/baseline_v4/")).toBe("baseline_v4");
    expect(baseName("dir//")).toBe("dir");
  });

  it("returns the single name when there is no separator", () => {
    expect(baseName("model.py")).toBe("model.py");
  });

  it("falls back to the original input for an empty path", () => {
    expect(baseName("")).toBe("");
  });
});

describe("parentPath", () => {
  it("drops the last segment of a posix path and the leading slash", () => {
    expect(parentPath("/home/user/projects/baseline_v4")).toBe("home/user/projects");
  });

  it("treats backslashes as separators", () => {
    expect(parentPath("C:\\Users\\me\\scratch\\model.py")).toBe("C:/Users/me/scratch");
  });

  it("ignores trailing slashes via boolean filtering", () => {
    expect(parentPath("a/b/")).toBe("a");
  });

  it("returns an empty string for a single name", () => {
    expect(parentPath("model.py")).toBe("");
  });

  it("returns an empty string for an empty path", () => {
    expect(parentPath("")).toBe("");
  });
});

describe("resolveWorkspaceName", () => {
  it("uses the first local project root basename when present", () => {
    expect(
      resolveWorkspaceName([
        codeFile({ projectRoot: "/home/user/projects/baseline_v4", source: "local" }),
        codeFile({
          id: "file:other",
          projectRoot: "/home/user/projects/other",
          source: "local"
        })
      ])
    ).toBe("baseline_v4");
  });

  it("falls back to the parent directory of a local file path", () => {
    expect(
      resolveWorkspaceName([
        codeFile({ path: "C:\\Users\\me\\scratch\\model.py", source: "local" })
      ])
    ).toBe("scratch");
  });

  it("falls back to the file name when the local file has no parent directory", () => {
    expect(resolveWorkspaceName([codeFile({ path: "model.py", source: "local" })])).toBe(
      "model.py"
    );
  });

  it("returns examples for sample-only workspaces", () => {
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
