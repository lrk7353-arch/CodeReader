import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Explanation, SampleFile } from "../../types/explanation";
import { FileExplorer } from "./FileExplorer";

describe("FileExplorer", () => {
  it("keeps long file structures compact around the selected target", () => {
    const longFile = file("long.py", [
      explanation("long.py", 1, "file"),
      ...Array.from({ length: 20 }, (_, index) =>
        explanation(`function-${index + 1}`, index * 10 + 1, "function")
      )
    ]);
    const markup = renderToStaticMarkup(
      <FileExplorer
        files={[longFile, file("other.py", [])]}
        selectedFileId={longFile.id}
        selectedExplanationId="function-15"
        activeLine={145}
        workspaceName="sample-project"
        onSelectFile={vi.fn()}
        onSelectExplanation={vi.fn()}
      />
    );

    expect(markup).toContain("结构 21 · 当前位置附近 8");
    expect(markup).toContain("浏览全部 21 项");
    expect(markup).toContain("function-15");
    expect(markup).not.toContain(">function-1<");
    expect(markup).toContain("other.py");
    expect(markup).toContain('aria-current="location"');
  });
});

function file(name: string, explanations: Explanation[]): SampleFile {
  return {
    id: name,
    name,
    path: `/sample/${name}`,
    relativePath: name,
    language: "python",
    code: "",
    explanations,
    capability: {
      previewKind: "code",
      canPreview: true,
      canExplain: true,
      language: "python",
      sizeBytes: 1
    }
  };
}

function explanation(
  id: string,
  startLine: number,
  targetType: Explanation["targetType"]
): Explanation {
  return {
    id,
    filePath: "long.py",
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
