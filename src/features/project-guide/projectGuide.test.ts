import { describe, expect, it } from "vitest";
import type { CodeFile, ProjectGuide, ReadingState } from "../../types/explanation";
import {
  aggregateReadingStates,
  deriveGuideProgress,
  progressPercent,
  summarizeCognitionProgress
} from "./projectGuide";

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
    expect(result.progress.read).toBe(2);
    expect(progressPercent(result.progress)).toBe(50);
  });

  it("counts only key-path mastery across visit-only, model-new, and review combinations", () => {
    const guide = projectGuide();
    const result = deriveGuideProgress(
      guide,
      [
        file("entry", ["read"]),
        file("business", ["unread", "needs_reexplain"]),
        file("outside-path", ["understood", "understood", "understood"])
      ],
      {}
    );

    expect(result.progress.total).toBe(2);
    expect(result.progress.masteryPercent).toBe(0);
    expect(progressPercent(result.progress)).toBe(0);
    expect(result.readingPath.map((step) => step.readingState)).toEqual([
      "read",
      "needs_reexplain"
    ]);
  });

  it("uses the same orthogonal aggregation and half-up percentage as desktop persistence", () => {
    const progress = summarizeCognitionProgress([
      { visitState: "read", masteryState: "understood", reviewState: "needs_review" },
      { visitState: "read", masteryState: "unconfirmed", reviewState: "current" },
      { visitState: "unread", masteryState: "understood", reviewState: "current" }
    ]);

    expect(progress).toMatchObject({
      total: 3,
      unread: 1,
      read: 2,
      understood: 2,
      needsReexplain: 1,
      questioned: 0,
      suspicious: 0,
      masteryPercent: 67
    });
  });

  it("uses only legacy-origin markers for compatibility path display without changing cognition totals", () => {
    const entry = file("entry", ["understood"]);
    entry.explanations[0].annotations = [annotation("annotation:legacy-state:entry", "question")];
    const business = file("business", ["read"]);
    business.explanations[0].annotations = [annotation("annotation:new-risk", "risk")];

    const result = deriveGuideProgress(projectGuide(), [entry, business]);

    expect(result.readingPath.map((step) => step.readingState)).toEqual(["questioned", "read"]);
    expect(result.progress).toMatchObject({
      read: 2,
      understood: 1,
      masteryPercent: 50,
      questioned: 0,
      suspicious: 0
    });
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

function annotation(id: string, kind: "question" | "risk") {
  return {
    id,
    projectId: "project:test",
    explanationId: "test",
    kind,
    body: "test",
    createdAt: "1",
    updatedAt: "1"
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
      needsReexplain: 0,
      masteryPercent: 0
    }
  };
}
