import { useMemo } from "react";
import type { CodeFile, ReadingState } from "../../types/explanation";

export interface ProjectProgress {
  totalFiles: number;
  explainedFiles: number;
  totalExplanations: number;
  readExplanations: number;
  understoodExplanations: number;
  lastReadFileId: string | null;
  lastReadExplanationId: string | null;
  lastReadAt: string | null;
  completionPercent: number;
}

/**
 * Compute project-level reading progress across all loaded files. Unlike the
 * reading-path progress (which only covers the recommended path), this covers
 * every explanation in every loaded file so the user can see how much of the
 * project they have actually read.
 */
export function computeProjectProgress(
  files: CodeFile[],
  readingStateOverrides: Record<string, ReadingState> = {}
): ProjectProgress {
  const totalFiles = files.length;
  let explainedFiles = 0;
  let totalExplanations = 0;
  let readExplanations = 0;
  let understoodExplanations = 0;
  let lastReadFileId: string | null = null;
  let lastReadExplanationId: string | null = null;
  let lastReadAt: string | null = null;
  let firstUnreadFileId: string | null = null;
  let firstUnreadExplanationId: string | null = null;

  for (const file of files) {
    const explanations = file.explanations ?? [];
    if (explanations.length > 0) {
      explainedFiles += 1;
    }
    for (const explanation of explanations) {
      totalExplanations += 1;
      const state = readingStateOverrides[explanation.id] ?? explanation.readingState;
      const isRead = state === "read" || state === "understood";
      if (isRead) {
        readExplanations += 1;
      }
      if (state === "understood") {
        understoodExplanations += 1;
      }
      // "Continue reading" should target the most recently read explanation,
      // not a freshly generated/migrated one. Only read/understood count.
      if (isRead) {
        const updatedAt = explanation.updatedAt ?? "";
        if (updatedAt && (!lastReadAt || updatedAt > lastReadAt)) {
          lastReadAt = updatedAt;
          lastReadFileId = file.id;
          lastReadExplanationId = explanation.id;
        }
      } else if (!firstUnreadFileId) {
        // Fallback: first unread explanation if nothing has been read yet.
        firstUnreadFileId = file.id;
        firstUnreadExplanationId = explanation.id;
      }
    }
  }

  // Prefer the last read target; fall back to the first unread so the user
  // always has a "continue reading" entry point.
  const continueFileId = lastReadFileId ?? firstUnreadFileId;
  const continueExplanationId = lastReadExplanationId ?? firstUnreadExplanationId;

  const completionPercent =
    totalExplanations === 0 ? 0 : Math.round((understoodExplanations / totalExplanations) * 100);

  return {
    totalFiles,
    explainedFiles,
    totalExplanations,
    readExplanations,
    understoodExplanations,
    lastReadFileId: continueFileId,
    lastReadExplanationId: continueExplanationId,
    lastReadAt,
    completionPercent
  };
}

export function useProjectProgress(
  files: CodeFile[],
  readingStateOverrides: Record<string, ReadingState> = {}
): ProjectProgress {
  return useMemo(
    () => computeProjectProgress(files, readingStateOverrides),
    [files, readingStateOverrides]
  );
}
