import type { ProjectTreeNode } from "../../types/explanation";

export interface ProjectTreeItem extends ProjectTreeNode {
  children: ProjectTreeItem[];
}

export function buildProjectTree(nodes: ProjectTreeNode[]): ProjectTreeItem[] {
  const items = new Map<string, ProjectTreeItem>();
  for (const node of nodes) {
    items.set(node.id, {
      ...node,
      children: []
    });
  }

  const roots: ProjectTreeItem[] = [];
  for (const item of items.values()) {
    const parent = item.parentId ? items.get(item.parentId) : undefined;
    if (parent?.kind === "directory") {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  sortTree(roots);
  return roots;
}

function sortTree(items: ProjectTreeItem[]) {
  items.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "en", {
      numeric: true,
      sensitivity: "base"
    });
  });
  for (const item of items) {
    sortTree(item.children);
  }
}
