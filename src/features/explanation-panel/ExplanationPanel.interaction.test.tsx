// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  CodeFile,
  Explanation,
  ExplanationFeedbackType,
  ReadingState
} from "../../types/explanation";
import { ExplanationPanel } from "./ExplanationPanel";

describe("ExplanationPanel workspace interactions", () => {
  it("records helpful feedback", async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();

    renderPanel({ onFeedback });

    await user.click(screen.getByRole("button", { name: "有帮助" }));

    expect(onFeedback).toHaveBeenCalledWith("helpful");
  });

  it("records suspicious feedback from the explanation action row", async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();

    renderPanel({ onFeedback });

    await user.click(screen.getByTitle("这条解释不对劲"));

    expect(onFeedback).toHaveBeenCalledWith("suspicious");
  });

  it("requests explanation regeneration", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    renderPanel({ onGenerate });

    await user.click(screen.getByRole("button", { name: "重新解释" }));

    expect(onGenerate).toHaveBeenCalled();
  });

  it("disables generation while a request is in flight", () => {
    renderPanel({ generationStatus: "generating" });

    expect(screen.getByRole("button", { name: "生成中" })).toBeDisabled();
  });

  it("shows inline generation progress without leaving the panel", () => {
    renderPanel({ generationStatus: "generating" });

    expect(screen.getByRole("status")).toHaveTextContent("正在等待模型返回");
    expect(screen.getByRole("status")).toHaveTextContent("已用时 0 秒");
  });

  it("disables generation until the context bundle is ready", () => {
    renderPanel({ contextStatus: "loading" });

    expect(screen.getByRole("button", { name: "重新解释" })).toBeDisabled();
  });

  it("disables generation for deleted explanations", () => {
    renderPanel({ explanation: explanation({ status: "deleted" }) });

    expect(screen.getByRole("button", { name: "代码已删除" })).toBeDisabled();
  });

  it("changes the reading state", async () => {
    const user = userEvent.setup();
    const onReadingStateChange = vi.fn();

    renderPanel({ onReadingStateChange });

    await user.click(screen.getByRole("button", { name: "已理解" }));

    expect(onReadingStateChange).toHaveBeenCalledWith("understood");
  });

  it("renders the capability state when no explanation is available", () => {
    renderPanel({
      explanation: undefined,
      file: codeFile({ capability: unpreviewableCapability() })
    });

    expect(screen.getByText("无法预览此文件")).toBeInTheDocument();
    expect(screen.getByText("不可预览")).toBeInTheDocument();
  });
});

interface PanelOverrides {
  onFeedback?: (feedbackType: ExplanationFeedbackType) => void;
  onGenerate?: () => void;
  onReadingStateChange?: (state: ReadingState) => void;
  explanation?: Explanation | undefined;
  generationStatus?: "idle" | "generating" | "error";
  contextStatus?: "unavailable" | "loading" | "ready" | "error";
  file?: CodeFile;
}

function renderPanel(overrides: PanelOverrides = {}) {
  const file = overrides.file ?? codeFile({});
  const entry = "explanation" in overrides ? overrides.explanation : explanation();
  if (entry) {
    file.explanations = [entry];
  }

  render(
    <ExplanationPanel
      file={file}
      contextStatus={overrides.contextStatus ?? "ready"}
      explanation={entry}
      generationStatus={overrides.generationStatus ?? "idle"}
      onFeedback={overrides.onFeedback ?? vi.fn()}
      onGenerate={overrides.onGenerate ?? vi.fn()}
      onSelectAffected={vi.fn()}
      onReadingStateChange={overrides.onReadingStateChange ?? vi.fn()}
    />
  );
}

function explanation(overrides: Partial<Explanation> = {}): Explanation {
  return {
    id: "exp-1",
    filePath: "/tmp/model.py",
    targetType: "function",
    targetName: "compute",
    startLine: 10,
    endLine: 20,
    codeMeaning: "计算入口",
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
    capability: {
      previewKind: "code",
      canPreview: true,
      canExplain: true,
      language: "python",
      sizeBytes: 1
    },
    ...overrides
  };
}

function unpreviewableCapability() {
  return {
    previewKind: "unavailable" as const,
    canPreview: false,
    canExplain: false,
    language: "python" as const,
    reason: "超出预览体积上限",
    sizeBytes: 99_999_999
  };
}
