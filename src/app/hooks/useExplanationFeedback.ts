import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  isDesktopRuntime,
  persistExplanationFeedback,
  persistReadingState
} from "../../services/desktopWorkspace";
import type {
  CodeFile,
  Explanation,
  ExplanationFeedbackType,
  ReadingState
} from "../../types/explanation";
import { errorMessage } from "../appError";

interface UseExplanationFeedbackOptions {
  file: CodeFile;
  explanation?: Explanation;
  setFiles: Dispatch<SetStateAction<CodeFile[]>>;
  setReadingStates: Dispatch<SetStateAction<Record<string, ReadingState>>>;
  setWorkspaceStatus: Dispatch<SetStateAction<string>>;
  refreshPersistedProjectGuide: (projectId: string) => Promise<void>;
}

export function useExplanationFeedback({
  file,
  explanation,
  setFiles,
  setReadingStates,
  setWorkspaceStatus,
  refreshPersistedProjectGuide
}: UseExplanationFeedbackOptions) {
  const onReadingStateChange = useCallback(
    async (state: ReadingState) => {
      if (!explanation) {
        return;
      }
      setReadingStates((current) => ({
        ...current,
        [explanation.id]: state
      }));
      setFiles((current) =>
        current.map((item) =>
          item.id === file.id
            ? {
                ...item,
                explanations: item.explanations.map((entry) =>
                  entry.id === explanation.id ? { ...entry, readingState: state } : entry
                )
              }
            : item
        )
      );

      if (isTransientExplanation(explanation)) {
        setWorkspaceStatus("临时多行选择状态已更新，仅保存在当前界面。");
        return;
      }

      if (!isDesktopRuntime() || !file.projectId) {
        setWorkspaceStatus("阅读状态已更新，浏览器预览不写入本地库。");
        return;
      }

      try {
        await persistReadingState(file.projectId, explanation.id, state);
        await refreshPersistedProjectGuide(file.projectId);
        setWorkspaceStatus(`阅读状态已保存：${explanation.targetName ?? explanation.targetType}`);
      } catch (error) {
        setWorkspaceStatus(errorMessage(error));
      }
    },
    [
      explanation,
      file.id,
      file.projectId,
      refreshPersistedProjectGuide,
      setFiles,
      setReadingStates,
      setWorkspaceStatus
    ]
  );

  const onFeedback = useCallback(
    async (feedbackType: ExplanationFeedbackType) => {
      if (!explanation) {
        return;
      }
      if (isTransientExplanation(explanation)) {
        setWorkspaceStatus("临时多行选择反馈已记录在当前界面，暂不写入 SQLite。");
        return;
      }
      if (!isDesktopRuntime() || !file.projectId) {
        setWorkspaceStatus("解释反馈已记录在当前预览，桌面端会写入本地库。");
        return;
      }

      try {
        await persistExplanationFeedback(file.projectId, explanation.id, feedbackType);
        setWorkspaceStatus(`解释反馈已保存：${feedbackType}`);
        if (feedbackType === "regenerate_requested") {
          await persistReadingState(file.projectId, explanation.id, "needs_reexplain");
          setReadingStates((current) => ({
            ...current,
            [explanation.id]: "needs_reexplain"
          }));
          await refreshPersistedProjectGuide(file.projectId);
        }
      } catch (error) {
        setWorkspaceStatus(errorMessage(error));
      }
    },
    [
      explanation,
      file.projectId,
      refreshPersistedProjectGuide,
      setReadingStates,
      setWorkspaceStatus
    ]
  );

  return { onFeedback, onReadingStateChange };
}

export function isTransientExplanation(explanation: Explanation) {
  return explanation.status === "transient" || explanation.id.startsWith("range:");
}
