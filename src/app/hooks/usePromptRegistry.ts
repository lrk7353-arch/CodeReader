import { useCallback, useEffect, useState } from "react";
import {
  isDesktopRuntime,
  listPromptVersions,
  rollbackPromptVersion,
  upsertPromptVersion
} from "../../services/desktopWorkspace";
import type { PromptVersionInfo, UpsertPromptVersionInput } from "../../types/explanation";
import { errorMessage } from "../appError";

export interface UsePromptRegistryOptions {
  onWorkspaceStatus: (message: string) => void;
}

export function usePromptRegistry({ onWorkspaceStatus }: UsePromptRegistryOptions) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [versions, setVersions] = useState<PromptVersionInfo[]>([]);

  const refresh = useCallback(async () => {
    if (!isDesktopRuntime()) {
      setVersions([]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await listPromptVersions();
      setVersions(next);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void refresh();
  }, [open, refresh]);

  const openDialog = useCallback(() => {
    if (!isDesktopRuntime()) {
      onWorkspaceStatus("Prompt 版本管理需要在 Tauri 桌面端运行。");
      return;
    }
    setError("");
    setOpen(true);
  }, [onWorkspaceStatus]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const upsert = useCallback(
    async (input: UpsertPromptVersionInput) => {
      setBusy(true);
      setError("");
      try {
        await upsertPromptVersion(input);
        const next = await listPromptVersions();
        setVersions(next);
        onWorkspaceStatus(`Prompt 版本已保存：${input.version}`);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [onWorkspaceStatus]
  );

  const rollback = useCallback(
    async (targetVersion: string, failedVersion: string, notes: string) => {
      setBusy(true);
      setError("");
      try {
        const result = await rollbackPromptVersion({
          targetVersion,
          failedVersion,
          notes: notes || null
        });
        const next = await listPromptVersions();
        setVersions(next);
        onWorkspaceStatus(
          `已回滚到 ${result.target.version}，${result.failed.version} 标记为 rolled_back。`
        );
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [onWorkspaceStatus]
  );

  return {
    busy,
    error,
    open,
    versions,
    close,
    openDialog,
    refresh,
    rollback,
    upsert
  };
}
