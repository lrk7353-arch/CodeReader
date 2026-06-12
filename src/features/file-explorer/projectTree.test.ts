import { describe, expect, it } from "vitest";
import type { ProjectTreeNode } from "../../types/explanation";
import { buildProjectTree } from "./projectTree";

describe("buildProjectTree", () => {
  it("builds stable directory hierarchy and keeps duplicate names distinct", () => {
    const nodes: ProjectTreeNode[] = [
      directory("src", "src"),
      directory("admin", "src/admin", "src"),
      directory("public", "src/public", "src"),
      file("admin-index", "index.ts", "src/admin/index.ts", "admin"),
      file("public-index", "index.ts", "src/public/index.ts", "public"),
      file("readme", "README.md", "README.md")
    ];

    const tree = buildProjectTree(nodes);

    expect(tree.map((item) => item.name)).toEqual(["src", "README.md"]);
    expect(tree[0].children.map((item) => item.name)).toEqual(["admin", "public"]);
    expect(tree[0].children[0].children[0].id).toBe("admin-index");
    expect(tree[0].children[1].children[0].id).toBe("public-index");
  });

  it("keeps nodes with missing parents visible at the root", () => {
    const tree = buildProjectTree([file("orphan", "orphan.ts", "orphan.ts", "missing-directory")]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("orphan");
  });
});

function directory(id: string, relativePath: string, parentId?: string): ProjectTreeNode {
  return {
    id,
    parentId,
    name: relativePath.split("/").pop() ?? relativePath,
    path: `/project/${relativePath}`,
    relativePath,
    kind: "directory"
  };
}

function file(id: string, name: string, relativePath: string, parentId?: string): ProjectTreeNode {
  return {
    id,
    parentId,
    name,
    path: `/project/${relativePath}`,
    relativePath,
    kind: "file",
    capability: {
      previewKind: "code",
      canPreview: true,
      canExplain: true,
      language: "typescript",
      sizeBytes: 32
    }
  };
}
