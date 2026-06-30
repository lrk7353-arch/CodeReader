import { useCallback, useMemo, useState } from "react";
import { sampleFiles } from "../../data/sampleWorkspace";
import {
  buildRangeExplanation,
  buildSelectableExplanations,
  findExplanationForSelection
} from "../../features/explanations/selectableExplanations";
import type { CodeSelection } from "../../features/code-viewer/MonacoCodeViewer";
import type { CodeFile, Explanation, ReadingState } from "../../types/explanation";

interface UseWorkspaceSelectionOptions {
  files: CodeFile[];
  readingStates: Record<string, ReadingState>;
}

export function useWorkspaceSelection({ files, readingStates }: UseWorkspaceSelectionOptions) {
  const [selectedFileId, setSelectedFileId] = useState(files[0]?.id ?? "");
  const [selectedExplanationId, setSelectedExplanationId] = useState(
    files[0]?.explanations[0]?.id ?? ""
  );
  const [selectedCodeSelection, setSelectedCodeSelection] = useState<CodeSelection>({
    startLine: 1,
    endLine: 1
  });

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? files[0] ?? sampleFiles[0],
    [files, selectedFileId]
  );

  const selectableExplanations = useMemo(
    () => buildSelectableExplanations(selectedFile),
    [selectedFile]
  );

  const transientRangeExplanation = useMemo(() => {
    if (selectedFile.capability?.canExplain === false) {
      return undefined;
    }
    if (selectedCodeSelection.startLine === selectedCodeSelection.endLine) {
      return undefined;
    }
    if (findExplanationForSelection(selectableExplanations, selectedCodeSelection)) {
      return undefined;
    }
    return buildRangeExplanation(selectedFile, selectedCodeSelection);
  }, [selectableExplanations, selectedCodeSelection, selectedFile]);

  const hydratedExplanations = useMemo(() => {
    const explanations = transientRangeExplanation
      ? [...selectableExplanations, transientRangeExplanation]
      : selectableExplanations;
    return explanations.map((explanation) => ({
      ...explanation,
      readingState: readingStates[explanation.id] ?? explanation.readingState
    }));
  }, [readingStates, selectableExplanations, transientRangeExplanation]);

  const selectedExplanation = useMemo<Explanation | undefined>(() => {
    return (
      hydratedExplanations.find((item) => item.id === selectedExplanationId) ??
      hydratedExplanations[0]
    );
  }, [hydratedExplanations, selectedExplanationId]);

  const selectedFileForViewer = useMemo<CodeFile>(
    () => ({
      ...selectedFile,
      explanations: hydratedExplanations
    }),
    [hydratedExplanations, selectedFile]
  );

  const filesForExplorer = useMemo(
    () => files.map((file) => (file.id === selectedFile.id ? selectedFileForViewer : file)),
    [files, selectedFile.id, selectedFileForViewer]
  );

  const selectExplanation = useCallback(
    (explanationId: string) => {
      const explanation = hydratedExplanations.find((item) => item.id === explanationId);
      setSelectedExplanationId((current) => (current === explanationId ? current : explanationId));
      const rangeSelection = parseRangeSelection(explanationId);
      const nextSelection = explanation?.startLine
        ? {
            startLine: explanation.startLine,
            endLine: explanation.endLine ?? explanation.startLine
          }
        : rangeSelection
          ? rangeSelection
          : { startLine: 1, endLine: 1 };
      setSelectedCodeSelection((current) =>
        sameSelection(current, nextSelection) ? current : nextSelection
      );
    },
    [hydratedExplanations]
  );

  const setActiveLoadedFile = useCallback((file: CodeFile) => {
    setSelectedFileId(file.id);
    const explanations = buildSelectableExplanations(file);
    setSelectedExplanationId(explanations[0]?.id ?? "");
    setSelectedCodeSelection({ startLine: 1, endLine: 1 });
  }, []);

  const updateSelection = useCallback((selection: CodeSelection) => {
    setSelectedCodeSelection(selection);
  }, []);

  return {
    filesForExplorer,
    hydratedExplanations,
    selectedCodeSelection,
    selectedExplanation,
    selectedExplanationId,
    selectedFile,
    selectedFileForViewer,
    selectExplanation,
    setActiveLoadedFile,
    setSelectedCodeSelection,
    setSelectedExplanationId,
    setSelectedFileId,
    updateSelection
  };
}

function sameSelection(left: CodeSelection, right: CodeSelection) {
  return left.startLine === right.startLine && left.endLine === right.endLine;
}

function parseRangeSelection(explanationId: string): CodeSelection | undefined {
  const match = explanationId.match(/^range:.+:(\d+)-(\d+)$/);
  if (!match) {
    return undefined;
  }
  return {
    startLine: Number(match[1]),
    endLine: Number(match[2])
  };
}
