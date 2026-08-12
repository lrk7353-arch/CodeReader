import { describe, expect, it } from "vitest";
import type { CodeFile, Explanation, ReaderPreference } from "../../types/explanation";
import { updateExplanation, updateProjectPreference } from "./useReaderKnowledge";

describe("reader knowledge target-bound updates", () => {
  it("updates the requested explanation without replacing the current or another project", () => {
    const files = [
      file("file:a", "project:a", [explanation("exp:a"), explanation("exp:b")]),
      file("file:c", "project:c", [explanation("exp:c")])
    ];
    const updated = updateExplanation(files, "project:a", "exp:a", (target) => ({
      ...target,
      codeMeaning: "late result for original target"
    }));

    expect(updated[0].explanations[0].codeMeaning).toBe("late result for original target");
    expect(updated[0].explanations[1]).toEqual(files[0].explanations[1]);
    expect(updated[1]).toBe(files[1]);
  });

  it("applies a project preference only to that project's loaded files", () => {
    const files = [file("file:a", "project:a", []), file("file:b", "project:b", [])];
    const preference: ReaderPreference = {
      projectId: "project:a",
      displayMode: "detailed",
      updatedAt: "2026-08-09T00:00:00.000Z"
    };
    const updated = updateProjectPreference(files, "project:a", preference);
    expect(updated[0].readerPreference).toEqual(preference);
    expect(updated[1]).toBe(files[1]);
  });
});

function explanation(id: string): Explanation {
  return {
    id,
    filePath: "src/main.ts",
    targetType: "function",
    codeMeaning: id,
    status: "valid",
    readingState: "read",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z"
  };
}

function file(id: string, projectId: string, explanations: Explanation[]): CodeFile {
  return {
    id,
    projectId,
    name: `${id}.ts`,
    path: `${id}.ts`,
    language: "typescript",
    code: "",
    explanations,
    source: "sample",
    isLoaded: true
  };
}
