import { describe, expect, it } from "vitest";
import type { CodeFile, Explanation } from "../../types/explanation";
import { computeProjectProgress } from "./useProjectProgress";

function file(id: string, explanations: Explanation[]): CodeFile {
  return {
    id,
    name: id,
    path: `/sample/${id}`,
    relativePath: id,
    language: "typescript",
    code: "",
    explanations,
    capability: {
      previewKind: "code",
      canPreview: true,
      canExplain: true,
      language: "typescript",
      sizeBytes: 1
    }
  };
}

function explanation(
  id: string,
  readingState: Explanation["readingState"],
  updatedAt: string
): Explanation {
  return {
    id,
    filePath: "x.ts",
    targetType: "function",
    targetName: id,
    startLine: 1,
    endLine: 2,
    codeMeaning: "test",
    status: "valid",
    readingState,
    createdAt: updatedAt,
    updatedAt
  };
}

describe("computeProjectProgress", () => {
  it("returns zero progress for empty file list", () => {
    const progress = computeProjectProgress([]);
    expect(progress.totalFiles).toBe(0);
    expect(progress.explainedFiles).toBe(0);
    expect(progress.totalExplanations).toBe(0);
    expect(progress.completionPercent).toBe(0);
    expect(progress.lastReadFileId).toBeNull();
  });

  it("counts explained files and explanations", () => {
    const progress = computeProjectProgress([
      file("a.ts", [explanation("e1", "unread", "1"), explanation("e2", "understood", "2")]),
      file("b.ts", [explanation("e3", "read", "3")]),
      file("c.ts", [])
    ]);
    expect(progress.totalFiles).toBe(3);
    expect(progress.explainedFiles).toBe(2);
    expect(progress.totalExplanations).toBe(3);
    expect(progress.readExplanations).toBe(2);
    expect(progress.understoodExplanations).toBe(1);
    expect(progress.completionPercent).toBe(33);
  });

  it("applies reading state overrides", () => {
    const progress = computeProjectProgress([file("a.ts", [explanation("e1", "unread", "1")])], {
      e1: "understood"
    });
    expect(progress.understoodExplanations).toBe(1);
    expect(progress.completionPercent).toBe(100);
  });

  it("tracks the most recently updated explanation as continue-reading target", () => {
    const progress = computeProjectProgress([
      file("a.ts", [explanation("e1", "read", "2026-01-01T00:00:00.000Z")]),
      file("b.ts", [explanation("e2", "read", "2026-07-07T12:00:00.000Z")]),
      file("c.ts", [explanation("e3", "read", "2026-03-01T00:00:00.000Z")])
    ]);
    expect(progress.lastReadFileId).toBe("b.ts");
    expect(progress.lastReadExplanationId).toBe("e2");
    expect(progress.lastReadAt).toBe("2026-07-07T12:00:00.000Z");
  });

  it("does not pick an unread/newly-generated node as continue-reading target", () => {
    // e1 is read (old), e2 is unread but has a newer timestamp. The continue
    // target should stay on e1, not jump to the unread e2.
    const progress = computeProjectProgress([
      file("a.ts", [explanation("e1", "read", "2026-01-01T00:00:00.000Z")]),
      file("b.ts", [explanation("e2", "unread", "2026-07-07T12:00:00.000Z")])
    ]);
    expect(progress.lastReadFileId).toBe("a.ts");
    expect(progress.lastReadExplanationId).toBe("e1");
  });

  it("falls back to the first unread explanation when nothing has been read", () => {
    const progress = computeProjectProgress([
      file("a.ts", [explanation("e1", "unread", "2026-01-01T00:00:00.000Z")]),
      file("b.ts", [explanation("e2", "unread", "2026-07-07T12:00:00.000Z")])
    ]);
    expect(progress.lastReadFileId).toBe("a.ts");
    expect(progress.lastReadExplanationId).toBe("e1");
  });
});
