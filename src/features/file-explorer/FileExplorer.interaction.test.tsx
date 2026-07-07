// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Explanation, ProjectTreeNode, SampleFile } from "../../types/explanation";
import { FileExplorer } from "./FileExplorer";

describe("FileExplorer workspace interactions", () => {
  it("selects a file and notifies the workspace", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();

    render(
      <FileExplorer
        files={[file("alpha.py", []), file("beta.py", [])]}
        selectedFileId="alpha.py"
        workspaceName="examples"
        onSelectFile={onSelectFile}
        onSelectExplanation={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "beta.py" }));

    expect(onSelectFile).toHaveBeenCalledWith("beta.py");
  });

  it("selects an explanation target under the active file", async () => {
    const user = userEvent.setup();
    const onSelectExplanation = vi.fn();
    const activeFile = file("alpha.py", [explanation("compute", 10, "function")]);

    render(
      <FileExplorer
        files={[activeFile]}
        selectedFileId="alpha.py"
        workspaceName="examples"
        onSelectFile={vi.fn()}
        onSelectExplanation={onSelectExplanation}
      />
    );

    await user.click(screen.getByRole("button", { name: "compute" }));

    expect(onSelectExplanation).toHaveBeenCalledWith("compute");
  });

  it("collapses and re-expands the target list", async () => {
    const user = userEvent.setup();
    const activeFile = file("alpha.py", [explanation("compute", 10, "function")]);

    render(
      <FileExplorer
        files={[activeFile]}
        selectedFileId="alpha.py"
        workspaceName="examples"
        onSelectFile={vi.fn()}
        onSelectExplanation={vi.fn()}
      />
    );

    const collapse = screen.getByRole("button", { name: "收起结构列表" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "compute" })).toBeInTheDocument();

    await user.click(collapse);

    const expand = screen.getByRole("button", { name: "展开结构列表" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "compute" })).not.toBeInTheDocument();

    await user.click(expand);

    expect(screen.getByRole("button", { name: "compute" })).toBeInTheDocument();
  });

  it("expands all targets beyond the compact limit and returns to the focused view", async () => {
    const user = userEvent.setup();
    const explanations = Array.from({ length: 10 }, (_, index) =>
      explanation(`fn-${index + 1}`, index * 5 + 1, "function")
    );
    const activeFile = file("alpha.py", explanations);

    render(
      <FileExplorer
        files={[activeFile]}
        selectedFileId="alpha.py"
        workspaceName="examples"
        onSelectFile={vi.fn()}
        onSelectExplanation={vi.fn()}
      />
    );

    expect(screen.getByText(/结构 10/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "fn-10" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /浏览全部 10 项/ }));

    expect(screen.getByRole("button", { name: "fn-10" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /回到当前位置附近/ }));

    expect(screen.queryByRole("button", { name: "fn-10" })).not.toBeInTheDocument();
  });

  it("keeps the project tree visible when a file has a very long structure list", async () => {
    const user = userEvent.setup();
    const explanations = Array.from({ length: 60 }, (_, index) =>
      explanation(`fn-${index + 1}`, index * 5 + 1, "function")
    );
    const activeFile = file("alpha.py", explanations);
    const sibling = file("beta.py", []);

    render(
      <FileExplorer
        files={[activeFile, sibling]}
        selectedFileId="alpha.py"
        workspaceName="examples"
        onSelectFile={vi.fn()}
        onSelectExplanation={vi.fn()}
      />
    );

    // The compact list is capped, so fn-60 (the last item) is not rendered
    // until the user expands. The sibling file remains visible and clickable,
    // proving the long structure list did not push the project tree away.
    expect(screen.queryByRole("button", { name: "fn-60" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "beta.py" })).toBeInTheDocument();

    // The compact target list element exists and is scrollable (the CSS caps
    // it with max-height + overflow-y: auto so it does not grow unbounded).
    const targetList = document.querySelector(".target-list");
    expect(targetList).toBeTruthy();

    // Expanding still works for a very long list.
    await user.click(screen.getByRole("button", { name: /浏览全部 60 项/ }));
    expect(screen.getByRole("button", { name: "fn-60" })).toBeInTheDocument();
    // Sibling is still visible after expand (expanded list scrolls in its own box).
    expect(screen.getByRole("button", { name: "beta.py" })).toBeInTheDocument();
  });

  it("switches between files and reading-path tabs", async () => {
    const user = userEvent.setup();

    render(
      <FileExplorer
        files={[file("alpha.py", [])]}
        selectedFileId="alpha.py"
        workspaceName="examples"
        onSelectFile={vi.fn()}
        onSelectExplanation={vi.fn()}
      />
    );

    const guideTab = screen.getByRole("tab", { name: "阅读路径" });
    await user.click(guideTab);
    expect(guideTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/打开一个项目后/)).toBeInTheDocument();

    const filesTab = screen.getByRole("tab", { name: "文件" });
    await user.click(filesTab);
    expect(filesTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "alpha.py" })).toBeInTheDocument();
  });

  it("expands and collapses project directories", async () => {
    const user = userEvent.setup();
    const nodes: ProjectTreeNode[] = [
      node("src", "src", "directory"),
      node("src/alpha.py", "alpha.py", "file", "src")
    ];

    render(
      <FileExplorer
        files={[file("alpha.py", [])]}
        projectNodes={nodes}
        selectedFileId="src/alpha.py"
        workspaceName="my-project"
        onSelectFile={vi.fn()}
        onSelectExplanation={vi.fn()}
      />
    );

    const directory = screen.getByRole("button", { name: "src" });
    expect(directory).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "alpha.py" })).toBeInTheDocument();

    await user.click(directory);
    expect(directory).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "alpha.py" })).not.toBeInTheDocument();

    await user.click(directory);
    expect(directory).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "alpha.py" })).toBeInTheDocument();
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
    filePath: "alpha.py",
    targetType,
    targetName: id,
    startLine,
    endLine: startLine + 3,
    codeMeaning: "test",
    status: "valid",
    readingState: "unread",
    createdAt: "1",
    updatedAt: "1"
  };
}

function node(
  id: string,
  name: string,
  kind: "directory" | "file",
  parentId?: string
): ProjectTreeNode {
  return {
    id,
    parentId,
    name,
    path: id,
    relativePath: id,
    kind
  };
}
