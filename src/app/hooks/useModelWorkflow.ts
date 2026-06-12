import { useCallback, useEffect, useState } from "react";
import type { ContextPreviewStatus } from "../../features/context-preview/ContextPreview";
import {
  generateExplanation,
  getModelConfig,
  isDesktopRuntime,
  resetModelConfig,
  saveModelConfig
} from "../../services/desktopWorkspace";
import type {
  CodeFile,
  ContextBundle,
  Explanation,
  GenerateExplanationResult,
  ModelConfig,
  SaveModelConfigInput
} from "../../types/explanation";
import { errorMessage } from "../appError";

export type GenerationStatus = "idle" | "generating" | "error";

interface UseModelWorkflowOptions {
  file: CodeFile;
  explanation?: Explanation;
  contextBundle?: ContextBundle;
  contextStatus: ContextPreviewStatus;
  onGenerated: (result: GenerateExplanationResult) => void;
  onWorkspaceStatus: (message: string) => void;
}

export function useModelWorkflow({
  file,
  explanation,
  contextBundle,
  contextStatus,
  onGenerated,
  onWorkspaceStatus
}: UseModelWorkflowOptions) {
  const [config, setConfig] = useState<ModelConfig>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [generationError, setGenerationError] = useState("");

  useEffect(() => {
    if (!isDesktopRuntime()) {
      return;
    }
    let cancelled = false;
    void getModelConfig()
      .then((nextConfig) => {
        if (!cancelled) {
          setConfig(nextConfig);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          onWorkspaceStatus(`模型配置读取失败：${errorMessage(cause)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onWorkspaceStatus]);

  useEffect(() => {
    setConfirmOpen(false);
    setGenerationStatus("idle");
    setGenerationError("");
  }, [explanation?.id, file.id]);

  const requestGeneration = useCallback(() => {
    if (!isDesktopRuntime()) {
      onWorkspaceStatus("真实解释生成需要在 Tauri 桌面端运行。");
      return;
    }
    if (!explanation || !contextBundle || contextStatus !== "ready") {
      setGenerationStatus("error");
      setGenerationError("上下文尚未准备完成，请稍后重试。");
      return;
    }
    if (!config?.configured) {
      setSettingsError("");
      setSettingsOpen(true);
      onWorkspaceStatus("请先配置模型端点、模型名称和 API Key。");
      return;
    }
    setGenerationError("");
    setGenerationStatus("idle");
    setConfirmOpen(true);
  }, [config?.configured, contextBundle, contextStatus, explanation, onWorkspaceStatus]);

  const confirmGeneration = useCallback(async () => {
    if (!explanation || !contextBundle || !config) {
      return;
    }
    setGenerationStatus("generating");
    setGenerationError("");
    try {
      const result = await generateExplanation(file, explanation);
      onGenerated(result);
      setConfirmOpen(false);
      setGenerationStatus("idle");
      onWorkspaceStatus(
        `解释已生成并保存：${result.model}${result.attempts > 1 ? "（结构修复后通过）" : ""}`
      );
    } catch (cause) {
      const message = errorMessage(cause);
      setGenerationStatus("error");
      setGenerationError(message);
      onWorkspaceStatus(message);
    }
  }, [config, contextBundle, explanation, file, onGenerated, onWorkspaceStatus]);

  const persistConfig = useCallback(
    async (input: SaveModelConfigInput) => {
      setSettingsBusy(true);
      setSettingsError("");
      try {
        const nextConfig = await saveModelConfig(input);
        setConfig(nextConfig);
        if (nextConfig.configured) {
          setSettingsOpen(false);
          onWorkspaceStatus(`模型配置已保存：${nextConfig.model}`);
        } else {
          setSettingsError("端点和模型已保存；远程端点还需要填写 API Key。");
        }
      } catch (cause) {
        setSettingsError(errorMessage(cause));
      } finally {
        setSettingsBusy(false);
      }
    },
    [onWorkspaceStatus]
  );

  const clearConfig = useCallback(async () => {
    setSettingsBusy(true);
    setSettingsError("");
    try {
      const nextConfig = await resetModelConfig();
      setConfig(nextConfig);
      setSettingsOpen(false);
      onWorkspaceStatus("模型配置和 API Key 已清除。");
    } catch (cause) {
      setSettingsError(errorMessage(cause));
    } finally {
      setSettingsBusy(false);
    }
  }, [onWorkspaceStatus]);

  const openSettings = useCallback(() => {
    if (!isDesktopRuntime()) {
      onWorkspaceStatus("模型配置需要在 Tauri 桌面端运行。");
      return;
    }
    setSettingsError("");
    setSettingsOpen(true);
  }, [onWorkspaceStatus]);

  const cancelGeneration = useCallback(() => {
    setConfirmOpen(false);
    setGenerationStatus("idle");
    setGenerationError("");
  }, []);

  return {
    config,
    generation: {
      confirmOpen,
      error: generationError,
      status: generationStatus,
      cancel: cancelGeneration,
      confirm: confirmGeneration,
      request: requestGeneration
    },
    settings: {
      busy: settingsBusy,
      error: settingsError,
      open: settingsOpen,
      close: () => setSettingsOpen(false),
      clear: clearConfig,
      openDialog: openSettings,
      save: persistConfig
    }
  };
}
