import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  createUserAnnotation,
  deleteUserAnnotation,
  isDesktopRuntime,
  saveReaderPreference,
  updateUserAnnotation
} from "../../services/desktopWorkspace";
import type {
  CodeFile,
  Explanation,
  ReaderPreference,
  UserAnnotation,
  UserAnnotationKind
} from "../../types/explanation";
import { errorMessage } from "../appError";

interface UseReaderKnowledgeOptions {
  file: CodeFile;
  explanation?: Explanation;
  setFiles: Dispatch<SetStateAction<CodeFile[]>>;
  setWorkspaceStatus: (message: string) => void;
}

export function useReaderKnowledge({
  file,
  explanation,
  setFiles,
  setWorkspaceStatus
}: UseReaderKnowledgeOptions) {
  const [busy, setBusy] = useState(false);
  const activeTargetKey = `${file.projectId ?? "preview"}:${file.id}:${explanation?.id ?? "none"}`;
  const activeTargetKeyRef = useRef(activeTargetKey);
  activeTargetKeyRef.current = activeTargetKey;
  const displayMode = file.readerPreference?.displayMode ?? "plain";

  const reportIfCurrent = useCallback(
    (requestKey: string, message: string) => {
      if (activeTargetKeyRef.current === requestKey) setWorkspaceStatus(message);
    },
    [setWorkspaceStatus]
  );

  const addAnnotation = useCallback(
    async (kind: UserAnnotationKind, body: string) => {
      const trimmed = body.trim();
      if (!explanation || !trimmed) return false;
      const projectId = file.projectId ?? "project:sample";
      const requestKey = `${projectId}:${file.id}:${explanation.id}`;
      setBusy(true);
      try {
        const annotation = isDesktopRuntime()
          ? await createUserAnnotation(projectId, explanation.id, kind, trimmed)
          : previewAnnotation(projectId, explanation.id, kind, trimmed);
        setFiles((current) =>
          updateExplanation(current, projectId, explanation.id, (target) => ({
            ...target,
            annotations: [...(target.annotations ?? []), annotation]
          }))
        );
        reportIfCurrent(requestKey, "我的记录已保存。");
        return true;
      } catch (cause) {
        reportIfCurrent(requestKey, `保存记录失败：${errorMessage(cause)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [explanation, file.id, file.projectId, reportIfCurrent, setFiles]
  );

  const editAnnotation = useCallback(
    async (annotation: UserAnnotation, kind: UserAnnotationKind, body: string) => {
      const trimmed = body.trim();
      if (!explanation || !trimmed) return false;
      const projectId = file.projectId ?? "project:sample";
      const requestKey = `${projectId}:${file.id}:${explanation.id}`;
      setBusy(true);
      try {
        const saved = isDesktopRuntime()
          ? await updateUserAnnotation(projectId, explanation.id, annotation.id, kind, trimmed)
          : { ...annotation, kind, body: trimmed, updatedAt: new Date().toISOString() };
        setFiles((current) =>
          updateExplanation(current, projectId, explanation.id, (target) => ({
            ...target,
            annotations: (target.annotations ?? []).map((item) =>
              item.id === annotation.id ? saved : item
            )
          }))
        );
        reportIfCurrent(requestKey, "我的记录已更新。");
        return true;
      } catch (cause) {
        reportIfCurrent(requestKey, `更新记录失败：${errorMessage(cause)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [explanation, file.id, file.projectId, reportIfCurrent, setFiles]
  );

  const removeAnnotation = useCallback(
    async (annotation: UserAnnotation) => {
      if (!explanation) return false;
      const projectId = file.projectId ?? "project:sample";
      const requestKey = `${projectId}:${file.id}:${explanation.id}`;
      setBusy(true);
      try {
        if (isDesktopRuntime()) {
          await deleteUserAnnotation(projectId, explanation.id, annotation.id);
        }
        setFiles((current) =>
          updateExplanation(current, projectId, explanation.id, (target) => ({
            ...target,
            annotations: (target.annotations ?? []).filter((item) => item.id !== annotation.id)
          }))
        );
        reportIfCurrent(requestKey, "我的记录已删除。");
        return true;
      } catch (cause) {
        reportIfCurrent(requestKey, `删除记录失败：${errorMessage(cause)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [explanation, file.id, file.projectId, reportIfCurrent, setFiles]
  );

  const changeDisplayMode = useCallback(
    async (nextMode: ReaderPreference["displayMode"]) => {
      const projectId = file.projectId ?? "project:sample";
      setBusy(true);
      try {
        const preference = isDesktopRuntime()
          ? await saveReaderPreference(projectId, nextMode)
          : previewPreference(projectId, nextMode);
        setFiles((current) => updateProjectPreference(current, projectId, preference));
        if (activeTargetKeyRef.current.startsWith(`${projectId}:`)) {
          setWorkspaceStatus(`解释模式已切换为${nextMode === "plain" ? "通俗" : "详细"}。`);
        }
        return true;
      } catch (cause) {
        if (activeTargetKeyRef.current.startsWith(`${projectId}:`)) {
          setWorkspaceStatus(`保存解释模式失败：${errorMessage(cause)}`);
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [file.projectId, setFiles, setWorkspaceStatus]
  );

  return {
    addAnnotation,
    busy,
    changeDisplayMode,
    displayMode,
    editAnnotation,
    removeAnnotation
  };
}

export function updateExplanation(
  files: CodeFile[],
  projectId: string,
  explanationId: string,
  update: (explanation: Explanation) => Explanation
) {
  return files.map((file) =>
    (file.projectId ?? "project:sample") === projectId
      ? {
          ...file,
          explanations: file.explanations.map((item) =>
            item.id === explanationId ? update(item) : item
          )
        }
      : file
  );
}

export function updateProjectPreference(
  files: CodeFile[],
  projectId: string,
  preference: ReaderPreference
) {
  return files.map((file) =>
    (file.projectId ?? "project:sample") === projectId
      ? { ...file, readerPreference: preference }
      : file
  );
}

function previewAnnotation(
  projectId: string,
  explanationId: string,
  kind: UserAnnotationKind,
  body: string
): UserAnnotation {
  const timestamp = new Date().toISOString();
  return {
    id: `annotation:preview:${crypto.randomUUID()}`,
    projectId,
    explanationId,
    kind,
    body,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function previewPreference(
  projectId: string,
  displayMode: ReaderPreference["displayMode"]
): ReaderPreference {
  return { projectId, displayMode, updatedAt: new Date().toISOString() };
}
