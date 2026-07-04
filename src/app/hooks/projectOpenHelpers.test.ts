import { describe, expect, it } from "vitest";
import type {
  FileCapability,
  ProjectFileEntry,
  ProjectScanResult,
  ProjectTreeNode
} from "../../types/explanation";
import {
  buildProjectFilePlaceholders,
  buildProjectOpenPlan,
  buildProjectScanNote
} from "./projectOpenHelpers";

describe("buildProjectFilePlaceholders", () => {
  it("maps each project file entry into a placeholder preserving entry fields", () => {
    const entryA = projectFileEntry({
      id: "file:a",
      name: "model.py",
      path: "/root/src/model.py",
      relativePath: "src/model.py",
      language: "python",
      capability: capability({ canPreview: true, canExplain: true })
    });
    const entryB = projectFileEntry({
      id: "file:b",
      name: "view.ts",
      path: "/root/src/view.ts",
      relativePath: "src/view.ts",
      language: "typescript",
      capability: capability({ canPreview: false, canExplain: false })
    });
    const project = projectScanResult({ rootPath: "/root", files: [entryA, entryB] });

    const placeholders = buildProjectFilePlaceholders(project);

    expect(placeholders).toHaveLength(2);
    expect(placeholders[0]).toEqual({
      ...entryA,
      projectRoot: "/root",
      code: "",
      explanations: [],
      codeNodes: [],
      source: "local",
      isLoaded: false
    });
    expect(placeholders[1]).toEqual({
      ...entryB,
      projectRoot: "/root",
      code: "",
      explanations: [],
      codeNodes: [],
      source: "local",
      isLoaded: false
    });
  });

  it("overrides an entry projectRoot with the project root path", () => {
    const entry = projectFileEntry({
      id: "file:a",
      relativePath: "a.py",
      projectRoot: "/somewhere/else"
    });
    const project = projectScanResult({ rootPath: "/root", files: [entry] });

    const [placeholder] = buildProjectFilePlaceholders(project);

    expect(placeholder.projectRoot).toBe("/root");
  });

  it("returns an empty list when the project has no files", () => {
    const project = projectScanResult({ rootPath: "/root", files: [] });

    expect(buildProjectFilePlaceholders(project)).toEqual([]);
  });

  it("marks every placeholder as an unloaded local file with empty code", () => {
    const entry = projectFileEntry({ id: "file:a", relativePath: "a.py" });
    const project = projectScanResult({ rootPath: "/root", files: [entry] });

    const [placeholder] = buildProjectFilePlaceholders(project);

    expect(placeholder.source).toBe("local");
    expect(placeholder.isLoaded).toBe(false);
    expect(placeholder.code).toBe("");
    expect(placeholder.explanations).toEqual([]);
    expect(placeholder.codeNodes).toEqual([]);
  });
});

describe("buildProjectScanNote", () => {
  it("returns the truncated note when the scan was truncated", () => {
    const project = projectScanResult({ truncated: true, skippedEntries: 0 });

    expect(buildProjectScanNote(project)).toBe("，扫描已达到安全预算");
  });

  it("prefers the truncated note over skipped entries", () => {
    const project = projectScanResult({ truncated: true, skippedEntries: 5 });

    expect(buildProjectScanNote(project)).toBe("，扫描已达到安全预算");
  });

  it("returns the skipped entries note when not truncated but entries were skipped", () => {
    const project = projectScanResult({ truncated: false, skippedEntries: 3 });

    expect(buildProjectScanNote(project)).toBe("，跳过 3 个不可读取项");
  });

  it("returns an empty note when not truncated and nothing was skipped", () => {
    const project = projectScanResult({ truncated: false, skippedEntries: 0 });

    expect(buildProjectScanNote(project)).toBe("");
  });

  it("returns an empty note when skippedEntries is zero even if it is present", () => {
    const project = projectScanResult({ truncated: false, skippedEntries: 0 });

    expect(buildProjectScanNote(project)).toBe("");
  });
});

describe("buildProjectOpenPlan", () => {
  it("keeps the preferred reading path file when it is previewable", () => {
    const entryA = projectFileEntry({ id: "file:a", relativePath: "a.py" });
    const entryB = projectFileEntry({ id: "file:b", relativePath: "b.py" });
    const project = projectScanResult({ files: [entryA, entryB] });

    const plan = buildProjectOpenPlan(project, "file:b");

    expect(plan.placeholders).toHaveLength(2);
    expect(plan.previewableFiles.map((file) => file.id)).toEqual(["file:a", "file:b"]);
    expect(plan.preferredFileId).toBe("file:b");
  });

  it("falls back to the first previewable file when the preferred file is unsafe", () => {
    const safe = projectFileEntry({ id: "file:safe", relativePath: "safe.py" });
    const unsafe = projectFileEntry({
      id: "file:unsafe",
      relativePath: "unsafe.bin",
      capability: capability({ canPreview: false, canExplain: false })
    });
    const project = projectScanResult({ files: [safe, unsafe] });

    const plan = buildProjectOpenPlan(project, "file:unsafe");

    expect(plan.previewableFiles.map((file) => file.id)).toEqual(["file:safe"]);
    expect(plan.preferredFileId).toBe("file:safe");
  });

  it("keeps placeholders but has no preferred file when nothing can be previewed", () => {
    const unsafe = projectFileEntry({
      id: "file:unsafe",
      capability: capability({ canPreview: false, canExplain: false })
    });
    const project = projectScanResult({ files: [unsafe] });

    const plan = buildProjectOpenPlan(project, "file:unsafe");

    expect(plan.placeholders).toHaveLength(1);
    expect(plan.previewableFiles).toEqual([]);
    expect(plan.preferredFileId).toBeUndefined();
  });

  it("includes the scan note used by the workspace status", () => {
    const project = projectScanResult({ truncated: true, skippedEntries: 12 });

    const plan = buildProjectOpenPlan(project);

    expect(plan.scanNote).toBe(buildProjectScanNote(project));
  });
});

function capability(overrides: Partial<FileCapability> = {}): FileCapability {
  return {
    previewKind: "code",
    canPreview: true,
    canExplain: true,
    language: "python",
    sizeBytes: 100,
    ...overrides
  };
}

function projectFileEntry(overrides: Partial<ProjectFileEntry> = {}): ProjectFileEntry {
  return {
    id: "file:a",
    name: "model.py",
    path: "/root/src/model.py",
    relativePath: "src/model.py",
    language: "python",
    capability: capability(),
    ...overrides
  };
}

function projectScanResult(overrides: Partial<ProjectScanResult> = {}): ProjectScanResult {
  return {
    rootPath: "/root",
    files: [projectFileEntry()],
    nodes: [] as ProjectTreeNode[],
    truncated: false,
    skippedEntries: 0,
    ...overrides
  };
}
