// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CodeFile,
  ContextBundle,
  Explanation,
  GenerateExplanationResult,
  ModelConfig
} from "../../types/explanation";
import { useModelWorkflow } from "./useModelWorkflow";

const mocks = vi.hoisted(() => ({
  generateExplanation: vi.fn(),
  getModelConfig: vi.fn(),
  isDesktopRuntime: vi.fn(() => true),
  resetModelConfig: vi.fn(),
  saveModelConfig: vi.fn()
}));

vi.mock("../../services/desktopWorkspace", () => ({
  generateExplanation: mocks.generateExplanation,
  getModelConfig: mocks.getModelConfig,
  isDesktopRuntime: mocks.isDesktopRuntime,
  resetModelConfig: mocks.resetModelConfig,
  saveModelConfig: mocks.saveModelConfig
}));

describe("useModelWorkflow generation flow", () => {
  beforeEach(() => {
    mocks.generateExplanation.mockReset();
    mocks.getModelConfig.mockReset();
    mocks.isDesktopRuntime.mockReset();
    mocks.resetModelConfig.mockReset();
    mocks.saveModelConfig.mockReset();

    mocks.isDesktopRuntime.mockReturnValue(true);
    mocks.getModelConfig.mockResolvedValue(modelConfig());
  });

  it("closes the confirmation dialog before waiting for model generation", async () => {
    const deferred = createDeferred<GenerateExplanationResult>();
    mocks.generateExplanation.mockReturnValue(deferred.promise);
    const onGenerated = vi.fn();
    const onWorkspaceStatus = vi.fn();
    let latest: ReturnType<typeof useModelWorkflow> | undefined;

    function Probe() {
      latest = useModelWorkflow({
        file: codeFile(),
        explanation: explanation(),
        contextBundle: contextBundle(),
        contextStatus: "ready",
        onGenerated,
        onWorkspaceStatus
      });
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(current(latest).config?.configured).toBe(true);
    });

    act(() => {
      current(latest).generation.request();
    });
    expect(current(latest).generation.confirmOpen).toBe(true);

    act(() => {
      void current(latest).generation.confirm();
    });

    await waitFor(() => {
      expect(current(latest).generation.confirmOpen).toBe(false);
      expect(current(latest).generation.status).toBe("generating");
    });
    expect(mocks.generateExplanation).toHaveBeenCalledWith(codeFile(), explanation());

    await act(async () => {
      deferred.resolve(generationResult());
      await deferred.promise;
    });

    await waitFor(() => {
      expect(current(latest).generation.status).toBe("idle");
    });
    expect(onGenerated).toHaveBeenCalledWith(generationResult());
  });
});

function current(api: ReturnType<typeof useModelWorkflow> | undefined) {
  if (!api) {
    throw new Error("workflow probe did not render");
  }
  return api;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function modelConfig(): ModelConfig {
  return {
    endpoint: "http://127.0.0.1:11434/v1/chat/completions",
    model: "fixture-model",
    timeoutSeconds: 60,
    hasApiKey: false,
    configured: true,
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function explanation(): Explanation {
  return {
    id: "exp-1",
    filePath: "/tmp/model.py",
    targetType: "function",
    targetName: "compute",
    startLine: 1,
    endLine: 2,
    codeMeaning: "计算入口",
    status: "valid",
    readingState: "unread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function codeFile(): CodeFile {
  return {
    id: "file-1",
    name: "model.py",
    path: "/tmp/model.py",
    language: "python",
    code: "def compute():\n    return 1\n",
    explanations: [explanation()],
    codeNodes: [],
    source: "sample",
    isLoaded: true
  };
}

function contextBundle(): ContextBundle {
  return {
    contextId: "ctx-1",
    strategy: "function",
    target: {
      targetType: "function",
      targetName: "compute",
      filePath: "/tmp/model.py",
      startLine: 1,
      endLine: 2
    },
    snippets: [],
    signals: {
      referencedIdentifiers: [],
      definedIdentifiers: [],
      inputIdentifiers: [],
      outputIdentifiers: [],
      calledFunctions: []
    },
    sources: [],
    budget: {
      requestedMaxChars: 2000,
      effectiveMaxChars: 2000,
      usedChars: 0,
      maxSnippets: 0,
      omittedSnippets: 0,
      expandedForTarget: false,
      truncated: false
    },
    warnings: []
  };
}

function generationResult(): GenerateExplanationResult {
  return {
    explanation: explanation(),
    contextId: "ctx-1",
    provider: "fixture",
    model: "fixture-model",
    attempts: 1
  };
}
