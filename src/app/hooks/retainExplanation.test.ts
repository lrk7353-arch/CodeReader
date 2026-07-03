import { describe, expect, it } from "vitest";
import type { Explanation } from "../../types/explanation";
import { codeSelectionForExplanation, pickRetainedExplanation } from "./retainExplanation";

describe("pickRetainedExplanation", () => {
  it("returns the explanation matching the selected id when present", () => {
    const first = explanation({ id: "exp-1" });
    const second = explanation({ id: "exp-2" });
    const third = explanation({ id: "exp-3" });

    const result = pickRetainedExplanation([first, second, third], "exp-2", []);

    expect(result).toBe(second);
  });

  it("falls back to the first explanation whose id is in affected ids", () => {
    const first = explanation({ id: "exp-1", status: "valid" });
    const second = explanation({ id: "exp-2", status: "valid" });
    const third = explanation({ id: "exp-3", status: "valid" });

    const result = pickRetainedExplanation([first, second, third], "missing", ["exp-3"]);

    expect(result).toBe(third);
  });

  it("falls back to the first explanation whose status is not valid", () => {
    const first = explanation({ id: "exp-1", status: "valid" });
    const second = explanation({ id: "exp-2", status: "stale" });
    const third = explanation({ id: "exp-3", status: "invalid" });

    const result = pickRetainedExplanation([first, second, third], "missing", []);

    expect(result).toBe(second);
  });

  it("falls back to the first explanation when all are valid and no ids match", () => {
    const first = explanation({ id: "exp-1", status: "valid" });
    const second = explanation({ id: "exp-2", status: "valid" });

    const result = pickRetainedExplanation([first, second], "missing", []);

    expect(result).toBe(first);
  });

  it("returns undefined when the explanation list is empty", () => {
    const result = pickRetainedExplanation([], "exp-1", ["exp-1"]);

    expect(result).toBeUndefined();
  });

  it("prefers the selected id over an affected id", () => {
    const first = explanation({ id: "exp-1", status: "valid" });
    const second = explanation({ id: "exp-2", status: "valid" });

    const result = pickRetainedExplanation([first, second], "exp-1", ["exp-2"]);

    expect(result).toBe(first);
  });

  it("prefers an affected id over a non-valid status", () => {
    const first = explanation({ id: "exp-1", status: "stale" });
    const second = explanation({ id: "exp-2", status: "valid" });

    const result = pickRetainedExplanation([first, second], "missing", ["exp-2"]);

    expect(result).toBe(second);
  });
});

describe("codeSelectionForExplanation", () => {
  it("returns {1,1} for undefined explanation", () => {
    expect(codeSelectionForExplanation(undefined)).toEqual({ startLine: 1, endLine: 1 });
  });

  it("returns {1,1} for a file-target explanation", () => {
    const file = explanation({ id: "exp-1", targetType: "file", startLine: 10, endLine: 20 });

    expect(codeSelectionForExplanation(file)).toEqual({ startLine: 1, endLine: 1 });
  });

  it("returns {1,1} when startLine is missing", () => {
    const missing = explanation({ id: "exp-1", targetType: "function" });

    expect(codeSelectionForExplanation(missing)).toEqual({ startLine: 1, endLine: 1 });
  });

  it("returns the target start and end lines when both are present", () => {
    const ranged = explanation({ id: "exp-1", targetType: "range", startLine: 12, endLine: 34 });

    expect(codeSelectionForExplanation(ranged)).toEqual({ startLine: 12, endLine: 34 });
  });

  it("falls back endLine to startLine when endLine is missing", () => {
    const single = explanation({ id: "exp-1", targetType: "line", startLine: 7 });

    expect(codeSelectionForExplanation(single)).toEqual({ startLine: 7, endLine: 7 });
  });

  it("does not mutate the input explanation", () => {
    const input = explanation({ id: "exp-1", targetType: "range", startLine: 5, endLine: 9 });
    const snapshot = { ...input };

    codeSelectionForExplanation(input);

    expect(input).toEqual(snapshot);
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
