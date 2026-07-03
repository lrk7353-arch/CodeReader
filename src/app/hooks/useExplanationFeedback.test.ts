import { describe, expect, it } from "vitest";
import type { Explanation } from "../../types/explanation";
import { isTransientExplanation } from "./useExplanationFeedback";

describe("useExplanationFeedback helpers", () => {
  it("flags explanations whose status is transient", () => {
    expect(isTransientExplanation(explanation({ id: "stable", status: "valid" }))).toBe(false);
    expect(isTransientExplanation(explanation({ id: "stable", status: "transient" }))).toBe(true);
  });

  it("flags range-style explanation ids even when status is valid", () => {
    expect(isTransientExplanation(explanation({ id: "range:file:1-3", status: "valid" }))).toBe(
      true
    );
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
