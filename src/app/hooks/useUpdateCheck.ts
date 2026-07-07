import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "upToDate"; currentVersion: string; latestVersion: string }
  | {
      status: "updateAvailable";
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
      releaseName?: string;
    }
  | { status: "unavailable"; message: string };

type BackendUpdateCheckResult = {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  release_name: string | null;
};

export function useUpdateCheck() {
  const [state, setState] = useState<UpdateCheckState>({ status: "idle" });

  const check = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const result = await invoke<BackendUpdateCheckResult>("check_for_updates");
      const currentVersion = result.current_version;
      const latestVersion = result.latest_version ?? currentVersion;
      if (result.update_available && result.release_url) {
        setState({
          status: "updateAvailable",
          currentVersion,
          latestVersion,
          releaseUrl: result.release_url,
          releaseName: result.release_name ?? undefined
        });
        return;
      }
      setState({ status: "upToDate", currentVersion, latestVersion });
    } catch (error) {
      setState({
        status: "unavailable",
        message: error instanceof Error ? error.message : "Update check failed"
      });
    }
  }, []);

  return { state, check };
}
