import type { CodeFile } from "../../types/explanation";

export function baseName(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).pop() ?? path;
}

export function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function resolveWorkspaceName(files: CodeFile[]): string {
  const localRoot = files.find((file) => file.projectRoot)?.projectRoot;
  if (localRoot) {
    return baseName(localRoot);
  }
  const localFile = files.find((file) => file.source === "local");
  if (localFile) {
    return baseName(parentPath(localFile.path)) || localFile.name;
  }
  return "examples";
}
