import type { CodeFile } from "../../types/explanation";

export function upsertFileInList(files: CodeFile[], file: CodeFile): CodeFile[] {
  const existingIndex = files.findIndex((item) => item.id === file.id || item.path === file.path);
  if (existingIndex === -1) {
    return [file, ...files];
  }
  return files.map((item, index) => (index === existingIndex ? file : item));
}
