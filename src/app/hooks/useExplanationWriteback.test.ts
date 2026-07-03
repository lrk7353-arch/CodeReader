import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  CodeFile,
  Explanation,
  GenerateExplanationResult,
  ReadingState
} from "../../types/explanation";
import { upsertExplanation, useExplanationWriteback } from "./useExplanationWriteback";

interface ProbeHandle {
  api: ReturnType<typeof useExplanationWriteback>;
  files: CodeFile[];
  readingStates: Record<string, ReadingState>;
  selectedExplanationId: string;
}

function renderProbe({
  files: initialFiles,
  selectedFileId
}: {
  files: CodeFile[];
  selectedFileId: string;
}): ProbeHandle {
  const files: CodeFile[] = [...initialFiles];
  const foundFile = files.find((entry) => entry.id === selectedFileId);
  if (!foundFile) {
    throw new Error(`renderProbe: no file with id "${selectedFileId}" in initial files`);
  }
  const selectedFile: CodeFile = foundFile;
  const readingStates: Record<string, ReadingState> = {};
  let selectedExplanationId = "";
  const apiRef: { current: ReturnType<typeof useExplanationWriteback> | null } = {
    current: null
  };

  function Probe() {
    const api = useExplanationWriteback({
      file: selectedFile,
      setFiles: (updater) => {
        const next = typeof updater === "function" ? updater(files) : updater;
        files.length = 0;
        files.push(...next);
      },
      setReadingStates: (updater) => {
        const next = typeof updater === "function" ? updater(readingStates) : updater;
        for (const key of Object.keys(readingStates)) {
          delete readingStates[key];
        }
        Object.assign(readingStates, next);
      },
      setSelectedExplanationId: (next) => {
        selectedExplanationId = typeof next === "function" ? next(selectedExplanationId) : next;
      }
    });
    apiRef.current = api;
    return null;
  }

  renderToStaticMarkup(createElement(Probe));
  if (!apiRef.current) {
    throw new Error("probe did not mount");
  }
  return {
    api: apiRef.current,
    files,
    readingStates,
    get selectedExplanationId() {
      return selectedExplanationId;
    }
  };
}

describe("upsertExplanation helper", () => {
  it("appends a new explanation when the id is unique", () => {
    const initial = [explanation({ id: "exp-1" })];
    const next = explanation({ id: "exp-2" });
    const result = upsertExplanation(initial, next);
    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.id)).toEqual(["exp-1", "exp-2"]);
    expect(result[1]).toBe(next);
  });

  it("appends to an empty explanations array without losing the entry", () => {
    const result = upsertExplanation([], explanation({ id: "exp-1" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("exp-1");
  });

  it("replaces an existing explanation while preserving sibling order", () => {
    const first = explanation({ id: "exp-1", codeMeaning: "first" });
    const middle = explanation({ id: "exp-2", codeMeaning: "middle" });
    const tail = explanation({ id: "exp-3", codeMeaning: "tail" });
    const replacement = explanation({ id: "exp-2", codeMeaning: "middle v2" });

    const result = upsertExplanation([first, middle, tail], replacement);

    expect(result.map((entry) => entry.id)).toEqual(["exp-1", "exp-2", "exp-3"]);
    expect(result[0]).toBe(first);
    expect(result[1]).toBe(replacement);
    expect(result[2]).toBe(tail);
  });

  it("never produces duplicates when ids collide", () => {
    const initial = [explanation({ id: "exp-1" }), explanation({ id: "exp-2" })];
    const replacement = explanation({ id: "exp-1", codeMeaning: "updated" });
    const result = upsertExplanation(initial, replacement);
    expect(result).toHaveLength(2);
    expect(result.filter((entry) => entry.id === "exp-1")).toHaveLength(1);
    expect(result[0].codeMeaning).toBe("updated");
    expect(result[1].id).toBe("exp-2");
  });
});

describe("useExplanationWriteback onGenerated", () => {
  it("updates only the target file while leaving siblings untouched", () => {
    const target = codeFile({ id: "file:target" });
    const sibling = codeFile({ id: "file:other" });
    const probe = renderProbe({ files: [target, sibling], selectedFileId: target.id });
    const targetExplanationsSnapshot = target.explanations;
    const siblingFileSnapshot = sibling;
    const siblingExplanationsSnapshot = sibling.explanations;

    probe.api.onGenerated(result({ explanation: explanation({ id: "exp-target" }) }));

    expect(probe.files).toHaveLength(2);
    expect(probe.files[0].id).toBe("file:target");
    expect(probe.files[1]).toBe(siblingFileSnapshot);
    expect(probe.files[0].explanations.map((entry) => entry.id)).toEqual(["exp-target"]);
    expect(probe.files[0].explanations).not.toBe(targetExplanationsSnapshot);
    expect(probe.files[1].explanations).toBe(siblingExplanationsSnapshot);
    expect(sibling.explanations).toBe(siblingExplanationsSnapshot);
  });

  it("does not duplicate when the explanation id already exists in the target file", () => {
    const target = codeFile({ id: "file:target" });
    const existing = explanation({ id: "exp-1", codeMeaning: "old" });
    target.explanations.push(existing);
    const probe = renderProbe({ files: [target], selectedFileId: target.id });

    probe.api.onGenerated(
      result({ explanation: explanation({ id: "exp-1", codeMeaning: "fresh" }) })
    );

    expect(probe.files[0].explanations).toHaveLength(1);
    expect(probe.files[0].explanations[0].codeMeaning).toBe("fresh");
    expect(probe.files[0].explanations[0]).not.toBe(existing);
  });

  it("selects the freshly generated explanation id", () => {
    const target = codeFile({ id: "file:target" });
    const probe = renderProbe({ files: [target], selectedFileId: target.id });

    probe.api.onGenerated(
      result({ explanation: explanation({ id: "range:file:1-5", readingState: "understood" }) })
    );

    expect(probe.selectedExplanationId).toBe("range:file:1-5");
  });

  it("merges the new reading state with previously tracked states", () => {
    const target = codeFile({ id: "file:target" });
    const probe = renderProbe({ files: [target], selectedFileId: target.id });
    probe.readingStates["exp-prev"] = "read";

    probe.api.onGenerated(
      result({ explanation: explanation({ id: "exp-new", readingState: "questioned" }) })
    );

    expect(probe.readingStates).toEqual({
      "exp-prev": "read",
      "exp-new": "questioned"
    });
  });

  it("appends, replaces and clears reading state in line with the explanation list", () => {
    const target = codeFile({ id: "file:target" });
    const first = explanation({ id: "exp-1", readingState: "unread" });
    target.explanations.push(first);
    const probe = renderProbe({ files: [target], selectedFileId: target.id });

    probe.api.onGenerated(
      result({ explanation: explanation({ id: "exp-2", readingState: "read" }) })
    );
    expect(probe.files[0].explanations.map((entry) => entry.id)).toEqual(["exp-1", "exp-2"]);
    expect(probe.selectedExplanationId).toBe("exp-2");
    expect(probe.readingStates).toEqual({ "exp-2": "read" });

    probe.api.onGenerated(
      result({ explanation: explanation({ id: "exp-2", readingState: "understood" }) })
    );
    expect(probe.files[0].explanations).toHaveLength(2);
    expect(probe.files[0].explanations[0].id).toBe("exp-1");
    expect(probe.files[0].explanations[1].readingState).toBe("understood");
    expect(probe.readingStates).toEqual({ "exp-2": "understood" });
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

function result(
  overrides: { explanation: Explanation } & Partial<GenerateExplanationResult>
): GenerateExplanationResult {
  return {
    contextId: "ctx-1",
    provider: "openai",
    model: "gpt-test",
    attempts: 1,
    ...overrides
  };
}
