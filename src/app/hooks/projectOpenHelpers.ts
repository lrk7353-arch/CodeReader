import type { CodeFile, ProjectScanResult } from "../../types/explanation";

export function buildProjectFilePlaceholders(project: ProjectScanResult): CodeFile[] {
  return project.files.map((file) => ({
    ...file,
    projectRoot: project.rootPath,
    code: "",
    explanations: [],
    codeNodes: [],
    source: "local",
    isLoaded: false
  }));
}

export function buildProjectScanNote(project: ProjectScanResult): string {
  if (project.truncated) {
    return "，扫描已达到安全预算";
  }
  if (project.skippedEntries > 0) {
    return `，跳过 ${project.skippedEntries} 个不可读取项`;
  }
  return "";
}
