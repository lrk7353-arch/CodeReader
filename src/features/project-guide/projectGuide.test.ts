import { describe, expect, it } from "vitest";
import type { CodeFile, ProjectGuide, ReadingState } from "../../types/explanation";
import { aggregateReadingStates, deriveGuideProgress, progressPercent } from "./projectGuide";

describe("project guide progress", () => {
  it("uses risk and question states before completion states", () => {
    expect(aggregateReadingStates(["understood", "suspicious"])).toBe("suspicious");
    expect(aggregateReadingStates(["understood", "questioned"])).toBe("questioned");
    expect(aggregateReadingStates(["understood", "unread"])).toBe("read");
    expect(aggregateReadingStates(["understood", "understood"])).toBe("understood");
  });

  it("derives sample progress from persisted explanation states", () => {
    const guide = projectGuide();
    const result = deriveGuideProgress(
      guide,
      [file("entry", ["understood"]), file("business", ["understood", "unread"])],
      {}
    );

    expect(result.readingPath.map((step) => step.readingState)).toEqual(["understood", "read"]);
    expect(result.progress.understood).toBe(1);
    expect(result.progress.read).toBe(1);
    expect(progressPercent(result.progress)).toBe(100);
  });
});

function file(id: string, states: ReadingState[]): CodeFile {
  return {
    id,
    name: `${id}.ts`,
    path: `${id}.ts`,
    language: "typescript",
    code: "",
    explanations: states.map((readingState, index) => ({
      id: `${id}-${index}`,
      filePath: `${id}.ts`,
      targetType: "line",
      codeMeaning: "test",
      status: "valid",
      readingState,
      createdAt: "1",
      updatedAt: "1"
    }))
  };
}

function projectGuide(): ProjectGuide {
  return {
    projectId: "project:test",
    rootPath: "/test",
    generatedAt: "1",
    mapItems: [],
    readingPath: [
      {
        id: "path-entry",
        position: 1,
        fileId: "entry",
        relativePath: "entry.ts",
        role: "entry",
        reason: "entry",
        readingState: "unread"
      },
      {
        id: "path-business",
        position: 2,
        fileId: "business",
        relativePath: "business.ts",
        role: "business",
        reason: "business",
        readingState: "unread"
      }
    ],
    progress: {
      total: 2,
      unread: 2,
      read: 0,
      understood: 0,
      questioned: 0,
      suspicious: 0,
      needsReexplain: 0
    }
  };
}
