import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  isDesktopRuntime,
  persistExplanationFeedback,
  persistCognitionState,
  persistReadingState
} from "../../services/desktopWorkspace";
import type {
  CodeFile,
  Explanation,
  ExplanationFeedbackType,
  CognitionState,
  ReadingState
} from "../../types/explanation";
import {
  cognitionFor,
  cognitionFromReadingState,
  readingStateProjection
} from "../../features/reading-state/cognition";
import { errorMessage } from "../appError";

interface UseExplanationFeedbackOptions {
  file: CodeFile;
  explanation?: Explanation;
  setFiles: Dispatch<SetStateAction<CodeFile[]>>;
  setReadingStates: Dispatch<SetStateAction<Record<string, ReadingState>>>;
  setWorkspaceStatus: Dispatch<SetStateAction<string>>;
  refreshPersistedProjectGuide: (projectId: string) => Promise<void>;
}

interface ConfirmedCognitionSnapshot {
  cognition: CognitionState;
  readingState: ReadingState;
}

export function useExplanationFeedback({
  file,
  explanation,
  setFiles,
  setReadingStates,
  setWorkspaceStatus,
  refreshPersistedProjectGuide
}: UseExplanationFeedbackOptions) {
  const cognitionSaveChains = useRef(new Map<string, Promise<void>>());
  const cognitionRevisions = useRef(new Map<string, number>());
  const cognitionIntents = useRef(new Map<string, CognitionState>());
  const confirmedCognitions = useRef(new Map<string, ConfirmedCognitionSnapshot>());
  const cognitionIntentVersions = useRef(new Map<string, number>());
  const applyCognitionLocally = useCallback(
    (cognition: CognitionState, readingState: ReadingState) => {
      if (!explanation) return;
      setReadingStates((current) => ({ ...current, [explanation.id]: readingState }));
      setFiles((current) =>
        current.map((item) =>
          item.id === file.id
            ? {
                ...item,
                explanations: item.explanations.map((entry) =>
                  entry.id === explanation.id
                    ? { ...entry, cognitionState: cognition, readingState }
                    : entry
                )
              }
            : item
        )
      );
    },
    [explanation, file.id, setFiles, setReadingStates]
  );
  const snapshotFor = useCallback(
    (targetKey: string): ConfirmedCognitionSnapshot => {
      const existing = confirmedCognitions.current.get(targetKey);
      if (existing) return existing;
      const snapshot = {
        cognition: explanation ? cognitionFor(explanation) : cognitionFromReadingState("unread"),
        readingState: explanation?.readingState ?? "unread"
      };
      confirmedCognitions.current.set(targetKey, snapshot);
      return snapshot;
    },
    [explanation]
  );
  const beginCognitionIntent = useCallback((targetKey: string, cognition: CognitionState) => {
    const version = (cognitionIntentVersions.current.get(targetKey) ?? 0) + 1;
    cognitionIntentVersions.current.set(targetKey, version);
    cognitionIntents.current.set(targetKey, cognition);
    return version;
  }, []);
  const rollbackCognitionIntent = useCallback(
    (targetKey: string, version: number, snapshot: ConfirmedCognitionSnapshot) => {
      if (cognitionIntentVersions.current.get(targetKey) !== version) return;
      cognitionIntents.current.set(targetKey, snapshot.cognition);
      applyCognitionLocally(snapshot.cognition, snapshot.readingState);
    },
    [applyCognitionLocally]
  );
  const enqueueCognitionSave = useCallback(
    async (projectId: string, cognition: CognitionState) => {
      if (!explanation) return;
      const targetKey = `${projectId}:${explanation.id}`;
      const previous = cognitionSaveChains.current.get(targetKey) ?? Promise.resolve();
      const save = previous
        .catch(() => undefined)
        .then(async () => {
          const expectedRevision =
            cognitionRevisions.current.get(targetKey) ?? explanation.cognitionRevision;
          const saved = await persistCognitionState(
            projectId,
            explanation.id,
            cognition,
            expectedRevision
          );
          cognitionRevisions.current.set(targetKey, saved.revision);
          setFiles((current) =>
            current.map((item) =>
              item.id === file.id
                ? {
                    ...item,
                    explanations: item.explanations.map((entry) =>
                      entry.id === explanation.id
                        ? { ...entry, cognitionRevision: saved.revision }
                        : entry
                    )
                  }
                : item
            )
          );
        });
      cognitionSaveChains.current.set(targetKey, save);
      await save;
    },
    [explanation, file.id, setFiles]
  );
  const onReadingStateChange = useCallback(
    async (state: CognitionState | ReadingState) => {
      if (!explanation) {
        return;
      }
      const legacyInvocation = typeof state === "string";
      const cognition = legacyInvocation ? cognitionFromReadingState(state) : state;
      const legacyState = legacyInvocation
        ? state
        : readingStateProjection(cognition, explanation.readingState);
      const targetKey = file.projectId ? `${file.projectId}:${explanation.id}` : undefined;
      const snapshot = targetKey ? snapshotFor(targetKey) : undefined;
      const intentVersion = targetKey ? beginCognitionIntent(targetKey, cognition) : undefined;
      applyCognitionLocally(cognition, legacyState);

      if (isTransientExplanation(explanation)) {
        setWorkspaceStatus("临时多行选择状态已更新，仅保存在当前界面。");
        return;
      }

      if (!isDesktopRuntime() || !file.projectId) {
        setWorkspaceStatus("阅读状态已更新，浏览器预览不写入本地库。");
        return;
      }
      const projectId = file.projectId;

      try {
        if (legacyInvocation) {
          await persistReadingState(projectId, explanation.id, legacyState);
        } else {
          await enqueueCognitionSave(projectId, cognition);
        }
        if (targetKey) {
          confirmedCognitions.current.set(targetKey, { cognition, readingState: legacyState });
        }
        await refreshPersistedProjectGuide(projectId);
        setWorkspaceStatus(
          `${legacyInvocation ? "阅读状态" : "认知状态"}已保存：${explanation.targetName ?? explanation.targetType}`
        );
      } catch (error) {
        if (targetKey && snapshot && intentVersion !== undefined) {
          rollbackCognitionIntent(targetKey, intentVersion, snapshot);
        }
        setWorkspaceStatus(errorMessage(error));
      }
    },
    [
      explanation,
      applyCognitionLocally,
      beginCognitionIntent,
      enqueueCognitionSave,
      file.projectId,
      refreshPersistedProjectGuide,
      setWorkspaceStatus,
      rollbackCognitionIntent,
      snapshotFor
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

      let optimistic:
        | { targetKey: string; version: number; snapshot: ConfirmedCognitionSnapshot }
        | undefined;
      try {
        const projectId = file.projectId;
        if (feedbackType === "regenerate_requested") {
          const targetKey = `${projectId}:${explanation.id}`;
          const snapshot = snapshotFor(targetKey);
          const current = cognitionIntents.current.get(targetKey) ?? cognitionFor(explanation);
          const cognition: CognitionState = {
            ...current,
            reviewState: "needs_review"
          };
          const version = beginCognitionIntent(targetKey, cognition);
          optimistic = { targetKey, version, snapshot };
          const legacyState = readingStateProjection(cognition, explanation.readingState);
          applyCognitionLocally(cognition, legacyState);
        }
        await persistExplanationFeedback(file.projectId, explanation.id, feedbackType);
        setWorkspaceStatus(`解释反馈已保存：${feedbackType}`);
        if (feedbackType === "regenerate_requested") {
          await enqueueCognitionSave(projectId, {
            ...cognitionIntents.current.get(`${projectId}:${explanation.id}`)!,
            reviewState: "needs_review"
          });
          if (optimistic) {
            confirmedCognitions.current.set(optimistic.targetKey, {
              cognition: cognitionIntents.current.get(optimistic.targetKey)!,
              readingState: readingStateProjection(
                cognitionIntents.current.get(optimistic.targetKey)!,
                explanation.readingState
              )
            });
          }
          await refreshPersistedProjectGuide(projectId);
        }
      } catch (error) {
        if (optimistic) {
          rollbackCognitionIntent(optimistic.targetKey, optimistic.version, optimistic.snapshot);
        }
        setWorkspaceStatus(errorMessage(error));
      }
    },
    [
      explanation,
      applyCognitionLocally,
      beginCognitionIntent,
      enqueueCognitionSave,
      file.projectId,
      refreshPersistedProjectGuide,
      setWorkspaceStatus,
      rollbackCognitionIntent,
      snapshotFor
    ]
  );

  return { onFeedback, onReadingStateChange };
}

export function isTransientExplanation(explanation: Explanation) {
  return explanation.status === "transient" || explanation.id.startsWith("range:");
}
