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
  const [lastGeneration, setLastGeneration] = useState<{
    explanationId: string;
    status: GenerationStatus;
    error: string;
    errorDetail: string;
    timestamp: string;
  } | null>(null);

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
    setConfirmOpen(false);
    setGenerationStatus("generating");
    setGenerationError("");
    const explanationId = explanation.id;
    const timestamp = new Date().toISOString();
    try {
      const result = await generateExplanation(file, explanation);
      onGenerated(result);
      setGenerationStatus("idle");
      setLastGeneration({
        explanationId,
        status: "idle",
        error: "",
        errorDetail: "",
        timestamp
      });
      onWorkspaceStatus(
        `解释已生成并保存：${result.model}${result.attempts > 1 ? "（结构修复后通过）" : ""}`
      );
    } catch (cause) {
      const message = errorMessage(cause);
      const detail = extractGenerationErrorDetail(cause);
      setGenerationStatus("error");
      setGenerationError(message);
      setLastGeneration({
        explanationId,
        status: "error",
        error: message,
        errorDetail: detail,
        timestamp
      });
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

  const copyGenerationError = useCallback(async () => {
    if (!lastGeneration || !lastGeneration.errorDetail) {
      return false;
    }
    const summary = formatGenerationErrorSummary(lastGeneration);
    try {
      await navigator.clipboard.writeText(summary);
      onWorkspaceStatus("已复制错误摘要到剪贴板，可粘贴到反馈包。");
      return true;
    } catch {
      onWorkspaceStatus("复制失败：剪贴板不可用。");
      return false;
    }
  }, [lastGeneration, onWorkspaceStatus]);

  return {
    config,
    generation: {
      confirmOpen,
      error: generationError,
      lastGeneration,
      status: generationStatus,
      cancel: cancelGeneration,
      confirm: confirmGeneration,
      copyError: copyGenerationError,
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

function extractGenerationErrorDetail(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}

function formatGenerationErrorSummary(entry: {
  explanationId: string;
  status: GenerationStatus;
  error: string;
  errorDetail: string;
  timestamp: string;
}): string {
  return [
    "CodeReader 解释生成错误摘要",
    `时间: ${entry.timestamp}`,
    `目标: ${entry.explanationId}`,
    `状态: ${entry.status}`,
    `错误: ${entry.error}`,
    "",
    "错误详情:",
    entry.errorDetail
  ].join("\n");
}
