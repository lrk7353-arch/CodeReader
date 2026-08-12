import type { WorkspaceNavigationTarget } from "./hooks/useWorkspaceFiles";

export const RELATED_NAVIGATION_HISTORY_LIMIT = 20;

export function pushRelatedNavigationOrigin(
  history: WorkspaceNavigationTarget[],
  origin: WorkspaceNavigationTarget
): WorkspaceNavigationTarget[] {
  return [
    ...history
      .filter((item) => item.projectId === origin.projectId)
      .slice(1 - RELATED_NAVIGATION_HISTORY_LIMIT),
    origin
  ];
}

export function latestRelatedNavigationOrigin(
  history: WorkspaceNavigationTarget[],
  projectId?: string
): WorkspaceNavigationTarget | undefined {
  return history.filter((item) => item.projectId === projectId).at(-1);
}

export function removeRelatedNavigationOrigin(
  history: WorkspaceNavigationTarget[],
  origin: WorkspaceNavigationTarget
): WorkspaceNavigationTarget[] {
  const originIndex = history.lastIndexOf(origin);
  return originIndex < 0
    ? history
    : [...history.slice(0, originIndex), ...history.slice(originIndex + 1)];
}
