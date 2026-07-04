import type { CodeFile, ProjectFileEntry, ProjectScanResult } from "../../types/explanation";

export interface ProjectOpenPlan {
  placeholders: CodeFile[];
  previewableFiles: ProjectFileEntry[];
  preferredFileId?: string;
  scanNote: string;
}

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

export function buildProjectOpenPlan(
  project: ProjectScanResult,
  preferredFileId?: string
): ProjectOpenPlan {
  const placeholders = buildProjectFilePlaceholders(project);
  const previewableFiles = project.files.filter((file) => file.capability.canPreview);
  const previewablePreferredFileId = previewableFiles.some((file) => file.id === preferredFileId)
    ? preferredFileId
    : previewableFiles[0]?.id;

  return {
    placeholders,
    previewableFiles,
    preferredFileId: previewablePreferredFileId,
    scanNote: buildProjectScanNote(project)
  };
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
