// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CodeFile, Explanation, RelatedTarget } from "../../types/explanation";
import {
  buildCognitionHierarchy,
  buildFileHierarchyTargets,
  buildRelatedNavigationTargets,
  buildReviewQueue,
  CognitionTools
} from "./CognitionTools";

describe("cognition loop builders", () => {
  it("resolves persisted cross-file relations and stable line relations", () => {
    const source = explanation({
      id: "exp:source",
      dependsOnLines: [8],
      affectsLines: [14]
    });
    const local = explanation({
      id: "exp:local",
      targetName: "validate",
      startLine: 7,
      endLine: 9
    });
    const target = explanation({ id: "exp:target", targetName: "saveUser" });
    const relation: RelatedTarget = {
      id: "relation:one",
      projectId: "project:test",
      explanationId: source.id,
      relatedExplanationId: target.id,
      relationKind: "calls",
      relatedFileId: "file:target",
      relatedTargetName: "saveUser",
      relatedStartLine: 22,
      createdAt: "2026-08-09T00:00:00.000Z"
    };
    const sourceFile = codeFile({
      id: "file:source",
      explanations: [source, local],
      relatedTargets: [relation]
    });
    const targetFile = codeFile({ id: "file:target", explanations: [target] });

    const built = buildRelatedNavigationTargets(sourceFile, source, [sourceFile, targetFile]);

    expect(built).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fileId: "file:target", explanationId: "exp:target" }),
        expect.objectContaining({
          fileId: "file:source",
          explanationId: "exp:local",
          startLine: 8
        }),
        expect.objectContaining({ fileId: "file:source", startLine: 14 })
      ])
    );
  });

  it("queues only changed or explicitly review-bound targets", () => {
    const file = codeFile({
      explanations: [
        explanation({ id: "current" }),
        explanation({ id: "changed", status: "invalid" }),
        explanation({
          id: "review",
          cognitionState: {
            visitState: "read",
            masteryState: "understood",
            reviewState: "needs_review"
          }
        })
      ]
    });
    expect(buildReviewQueue([file]).map((item) => item.explanationId)).toEqual([
      "changed",
      "review"
    ]);
  });

  it("builds project modules and selectable explained or structural code targets", () => {
    const main = codeFile({ relativePath: "src/main.ts" });
    const helper = codeFile({
      id: "file:helper",
      name: "helper.ts",
      relativePath: "lib/helper.ts",
      explanations: [explanation({ id: "exp:helper", targetName: "help", startLine: 3 })],
      codeNodes: [
        {
          id: "node:block",
          filePath: "lib/helper.ts",
          nodeType: "block",
          name: "fallback block",
          startLine: 10,
          endLine: 12,
          codeHash: "hash:block",
          anchorText: "if"
        }
      ]
    });

    expect(
      buildCognitionHierarchy([main, helper], "project:test").map((item) => item.name)
    ).toEqual(["lib", "src"]);
    expect(buildFileHierarchyTargets(helper)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ explanationId: "exp:helper", startLine: 3 }),
        expect.objectContaining({ targetType: "block", startLine: 10 })
      ])
    );
  });
});

describe("CognitionTools interactions", () => {
  it("keeps layer, mode, related navigation and personal records operable", async () => {
    const user = userEvent.setup();
    const source = explanation({
      id: "exp:source",
      annotations: [],
      dependsOnLines: [8]
    });
    const local = explanation({
      id: "exp:local",
      targetName: "validate",
      startLine: 7,
      endLine: 9
    });
    const file = codeFile({ explanations: [source, local] });
    const onChangeDisplayMode = vi.fn(() => Promise.resolve(true));
    const onAddAnnotation = vi.fn(() => Promise.resolve(true));
    const onNavigate = vi.fn(() => Promise.resolve(true));

    render(
      <CognitionTools
        busy={false}
        displayMode="plain"
        explanation={source}
        file={file}
        files={[file]}
        projectName="reader-project"
        canGoBack={true}
        onAddAnnotation={onAddAnnotation}
        onChangeDisplayMode={onChangeDisplayMode}
        onEditAnnotation={vi.fn(() => Promise.resolve(true))}
        onNavigate={onNavigate}
        onNavigateReview={vi.fn(() => Promise.resolve())}
        onRemoveAnnotation={vi.fn(() => Promise.resolve(true))}
        onGoBack={vi.fn(() => Promise.resolve())}
      />
    );

    await user.click(screen.getByRole("button", { name: "reader-project" }));
    expect(screen.getByText(/当前以已加载文件建立项目理解/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "详细" }));
    expect(onChangeDisplayMode).toHaveBeenCalledWith("detailed");
    await user.click(screen.getByRole("button", { name: /依赖.*validate/ }));
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ explanationId: "exp:local" })
    );

    await user.type(
      screen.getByPlaceholderText("记录你自己的理解、问题或风险判断"),
      "这里为什么重试？"
    );
    await user.selectOptions(screen.getByLabelText("类型"), "question");
    await user.click(screen.getByRole("button", { name: "添加记录" }));
    expect(onAddAnnotation).toHaveBeenCalledWith("question", "这里为什么重试？");
  });

  it("drills from project to module, file, and a positioned code target", async () => {
    const user = userEvent.setup();
    const current = codeFile({ relativePath: "src/main.ts", explanations: [explanation()] });
    const targetExplanation = explanation({
      id: "exp:helper",
      targetType: "function",
      targetName: "help",
      startLine: 9,
      endLine: 12
    });
    const helper = codeFile({
      id: "file:helper",
      name: "helper.ts",
      relativePath: "lib/helper.ts",
      explanations: [targetExplanation],
      codeNodes: [
        {
          id: "node:block",
          filePath: "lib/helper.ts",
          nodeType: "block",
          name: "fallback block",
          startLine: 20,
          endLine: 23,
          codeHash: "hash:block",
          anchorText: "if"
        },
        {
          id: "node:line",
          filePath: "lib/helper.ts",
          nodeType: "line",
          name: "return line",
          startLine: 25,
          endLine: 25,
          codeHash: "hash:line",
          anchorText: "return"
        }
      ]
    });
    const onNavigate = vi.fn(() => Promise.resolve(true));
    const common = {
      busy: false,
      displayMode: "plain" as const,
      files: [current, helper],
      projectName: "reader-project",
      canGoBack: true,
      onAddAnnotation: vi.fn(() => Promise.resolve(true)),
      onChangeDisplayMode: vi.fn(() => Promise.resolve(true)),
      onEditAnnotation: vi.fn(() => Promise.resolve(true)),
      onNavigate,
      onNavigateReview: vi.fn(() => Promise.resolve()),
      onRemoveAnnotation: vi.fn(() => Promise.resolve(true)),
      onGoBack: vi.fn(() => Promise.resolve())
    };
    const view = render(
      <CognitionTools {...common} explanation={current.explanations[0]} file={current} />
    );

    await user.click(screen.getByRole("button", { name: "reader-project" }));
    await user.click(screen.getByRole("button", { name: /lib.*1 个文件/ }));
    await user.click(screen.getByRole("button", { name: /helper\.ts.*lib\/helper\.ts/ }));
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileId: "file:helper", startLine: 1 })
    );

    view.rerender(<CognitionTools {...common} explanation={targetExplanation} file={helper} />);
    await user.click(screen.getByRole("button", { name: /help.*function.*L9/ }));
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileId: "file:helper", explanationId: "exp:helper", startLine: 9 })
    );
    await user.click(screen.getByRole("button", { name: "helper.ts" }));
    await user.click(screen.getByRole("button", { name: /fallback block.*block.*L20/ }));
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fileId: "file:helper",
        startLine: 20,
        endLine: 23,
        targetType: "block"
      })
    );
    await user.click(screen.getByRole("button", { name: "helper.ts" }));
    await user.click(screen.getByRole("button", { name: /return line.*line.*L25/ }));
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fileId: "file:helper",
        startLine: 25,
        endLine: 25,
        targetType: "line"
      })
    );
    await user.click(screen.getByRole("button", { name: /返回跳转前位置/ }));
    expect(common.onGoBack).toHaveBeenCalledOnce();
  });

  it("does not claim a deeper hierarchy scope when real target navigation fails", async () => {
    const user = userEvent.setup();
    const current = codeFile({ relativePath: "src/main.ts", explanations: [explanation()] });
    const helper = codeFile({
      id: "file:helper",
      name: "helper.ts",
      relativePath: "lib/helper.ts",
      explanations: [explanation({ id: "exp:helper", targetName: "help" })]
    });
    const onNavigate = vi.fn(() => Promise.resolve(false));
    render(
      <CognitionTools
        busy={false}
        displayMode="plain"
        explanation={current.explanations[0]}
        file={current}
        files={[current, helper]}
        projectName="reader-project"
        canGoBack={false}
        onAddAnnotation={vi.fn(() => Promise.resolve(true))}
        onChangeDisplayMode={vi.fn(() => Promise.resolve(true))}
        onEditAnnotation={vi.fn(() => Promise.resolve(true))}
        onNavigate={onNavigate}
        onNavigateReview={vi.fn(() => Promise.resolve())}
        onRemoveAnnotation={vi.fn(() => Promise.resolve(true))}
        onGoBack={vi.fn(() => Promise.resolve())}
      />
    );

    await user.click(screen.getByRole("button", { name: "reader-project" }));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("group", { name: "选择模块" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "reader-project" })).not.toHaveAttribute(
      "aria-current",
      "location"
    );
  });
});

function explanation(overrides: Partial<Explanation> = {}): Explanation {
  return {
    id: "exp:test",
    filePath: "src/main.ts",
    targetType: "function",
    targetName: "main",
    startLine: 1,
    endLine: 5,
    codeMeaning: "执行当前功能",
    status: "valid",
    readingState: "read",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides
  };
}

function codeFile(overrides: Partial<CodeFile> = {}): CodeFile {
  return {
    id: "file:test",
    name: "main.ts",
    path: "src/main.ts",
    projectId: "project:test",
    relativePath: "src/main.ts",
    language: "typescript",
    code: "",
    explanations: [],
    source: "sample",
    isLoaded: true,
    ...overrides
  };
}
