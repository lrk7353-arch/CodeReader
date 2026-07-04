import type { CodeFile } from "../../types/explanation";

interface WorkspaceRefreshGuardInput {
  file: CodeFile;
  isDesktop: boolean;
  refreshInFlight: boolean;
}

export function canRefreshLoadedFile({
  file,
  isDesktop,
  refreshInFlight
}: WorkspaceRefreshGuardInput): boolean {
  return isDesktop && file.source === "local" && file.isLoaded === true && !refreshInFlight;
}
