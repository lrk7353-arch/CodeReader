import { describe, expect, it } from "vitest";
import type { CodeFile, CodeNode, Explanation } from "../../types/explanation";
import { seedBrowserHydratedFile, stripUnexplainableFile } from "./hydrateLoadedFile";

describe("stripUnexplainableFile", () => {
  it("clears codeNodes and explanations while keeping other CodeFile fields", () => {
    const file = codeFile({
      codeNodes: [codeNode({ id: "node:1" })],
      explanations: [explanation({ id: "exp:1" })],
      databasePath: "/tmp/db.sqlite",
      projectId: "proj-1"
    });

    const stripped = stripUnexplainableFile(file);

    expect(stripped.codeNodes).toEqual([]);
    expect(stripped.explanations).toEqual([]);
    expect(stripped.id).toBe("file:test");
    expect(stripped.name).toBe("model.py");
    expect(stripped.path).toBe("/tmp/model.py");
    expect(stripped.code).toBe("print('hi')");
    expect(stripped.language).toBe("python");
    expect(stripped.databasePath).toBe("/tmp/db.sqlite");
    expect(stripped.projectId).toBe("proj-1");
  });

  it("does not mutate the input file", () => {
    const file = codeFile({
      codeNodes: [codeNode({ id: "node:1" })],
      explanations: [explanation({ id: "exp:1" })]
    });
    const snapshot = {
      ...file,
      codeNodes: [...file.codeNodes!],
      explanations: [...file.explanations]
    };

    stripUnexplainableFile(file);

    expect(file).toEqual(snapshot);
  });

  it("returns a new object reference rather than the same file", () => {
    const file = codeFile({ codeNodes: [], explanations: [] });

    const stripped = stripUnexplainableFile(file);

    expect(stripped).not.toBe(file);
  });
});

describe("seedBrowserHydratedFile", () => {
  it("returns a file shaped like the hydrate result with seed explanations and empty databasePath", () => {
    const file = codeFile({
      databasePath: "/tmp/old.sqlite",
      explanations: [explanation({ id: "exp:old" })],
      projectId: "proj-1"
    });
    const seeds = [explanation({ id: "exp:seed-1" }), explanation({ id: "exp:seed-2" })];

    const seeded = seedBrowserHydratedFile(file, seeds);

    expect(seeded).toEqual({
      ...file,
      databasePath: "",
      explanations: seeds
    });
    expect(seeded.databasePath).toBe("");
    expect(seeded.explanations).toBe(seeds);
    expect(seeded.id).toBe(file.id);
    expect(seeded.projectId).toBe("proj-1");
  });

  it("keeps the original file fields except databasePath and explanations", () => {
    const file = codeFile({
      codeNodes: [codeNode({ id: "node:1" })],
      fileHash: "abc123",
      parseError: false,
      source: "local",
      isLoaded: true
    });
    const seeds = [explanation({ id: "exp:seed-1" })];

    const seeded = seedBrowserHydratedFile(file, seeds);

    expect(seeded.codeNodes).toEqual(file.codeNodes);
    expect(seeded.fileHash).toBe("abc123");
    expect(seeded.parseError).toBe(false);
    expect(seeded.source).toBe("local");
    expect(seeded.isLoaded).toBe(true);
  });

  it("does not mutate the input file", () => {
    const file = codeFile({
      databasePath: "/tmp/old.sqlite",
      explanations: [explanation({ id: "exp:old" })]
    });
    const snapshot = {
      ...file,
      explanations: [...file.explanations]
    };
    const seeds = [explanation({ id: "exp:seed-1" })];

    seedBrowserHydratedFile(file, seeds);

    expect(file).toEqual(snapshot);
    expect(file.databasePath).toBe("/tmp/old.sqlite");
    expect(file.explanations).toEqual([expect.objectContaining({ id: "exp:old" })]);
  });

  it("does not mutate the seed explanations array", () => {
    const file = codeFile({ explanations: [] });
    const seeds = [explanation({ id: "exp:seed-1" })];

    const seeded = seedBrowserHydratedFile(file, seeds);

    expect(seeds).toEqual([expect.objectContaining({ id: "exp:seed-1" })]);
    expect(seeded.explanations).toBe(seeds);
  });
});

function codeFile(overrides: Partial<CodeFile>): CodeFile {
  return {
    id: "file:test",
    name: "model.py",
    path: "/tmp/model.py",
    language: "python",
    code: "print('hi')",
    explanations: [],
    codeNodes: [],
    source: "sample",
    isLoaded: true,
    ...overrides
  };
}

function codeNode(overrides: Partial<CodeNode>): CodeNode {
  return {
    id: "node:1",
    filePath: "/tmp/model.py",
    nodeType: "function",
    name: "doStuff",
    startLine: 1,
    endLine: 3,
    codeHash: "hash-1",
    anchorText: "def doStuff",
    ...overrides
  };
}

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
