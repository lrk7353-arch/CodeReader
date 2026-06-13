import { describe, expect, it } from "vitest";
import type { Explanation } from "../../types/explanation";
import { buildFocusedTargetList, COMPACT_TARGET_LIMIT } from "./targetList";

describe("focused target list", () => {
  it("keeps the file target and centers the selected function in the default compact window", () => {
    const explanations = [explanation("file", 1, "file"), ...functions(30)];
    const result = buildFocusedTargetList(explanations, "function-20", 201);

    expect(result.items).toHaveLength(COMPACT_TARGET_LIMIT);
    expect(result.items[0]?.id).toBe("file");
    expect(result.items.some((item) => item.id === "function-20")).toBe(true);
    expect(result.hiddenCount).toBe(explanations.length - COMPACT_TARGET_LIMIT);
  });

  it("uses the active editor line when the selected target is file-level", () => {
    const explanations = [explanation("file", 1, "file"), ...functions(30)];
    const result = buildFocusedTargetList(explanations, "file", 245);
    const visibleIds = result.items.map((item) => item.id);

    expect(visibleIds).toContain("function-24");
    expect(visibleIds).not.toContain("function-1");
  });

  it("does not compact a short list", () => {
    const explanations = [explanation("file", 1, "file"), ...functions(4)];

    expect(buildFocusedTargetList(explanations, "function-2", 21)).toEqual({
      items: explanations,
      hiddenCount: 0
    });
  });
});

function functions(count: number) {
  return Array.from({ length: count }, (_, index) =>
    explanation(`function-${index + 1}`, index * 10 + 1, "function")
  );
}

function explanation(
  id: string,
  startLine: number,
  targetType: Explanation["targetType"]
): Explanation {
  return {
    id,
    filePath: "sample.ts",
    targetType,
    targetName: id,
    startLine,
    endLine: startLine + 5,
    codeMeaning: "test",
    status: "valid",
    readingState: "unread",
    createdAt: "1",
    updatedAt: "1"
  };
}
