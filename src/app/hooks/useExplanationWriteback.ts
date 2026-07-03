import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  CodeFile,
  Explanation,
  GenerateExplanationResult,
  ReadingState
} from "../../types/explanation";

export function upsertExplanation(explanations: Explanation[], next: Explanation): Explanation[] {
  const existingIndex = explanations.findIndex((explanation) => explanation.id === next.id);
  if (existingIndex === -1) {
    return [...explanations, next];
  }
  return explanations.map((explanation, index) => (index === existingIndex ? next : explanation));
}

interface UseExplanationWritebackOptions {
  file: CodeFile;
  setFiles: Dispatch<SetStateAction<CodeFile[]>>;
  setReadingStates: Dispatch<SetStateAction<Record<string, ReadingState>>>;
  setSelectedExplanationId: Dispatch<SetStateAction<string>>;
}

export function useExplanationWriteback({
  file,
  setFiles,
  setReadingStates,
  setSelectedExplanationId
}: UseExplanationWritebackOptions) {
  const onGenerated = useCallback(
    (result: GenerateExplanationResult) => {
      setFiles((current) =>
        current.map((entry) =>
          entry.id === file.id
            ? {
                ...entry,
                explanations: upsertExplanation(entry.explanations, result.explanation)
              }
            : entry
        )
      );
      setSelectedExplanationId(result.explanation.id);
      setReadingStates((current) => ({
        ...current,
        [result.explanation.id]: result.explanation.readingState
      }));
    },
    [file.id, setFiles, setReadingStates, setSelectedExplanationId]
  );

  return { onGenerated };
}
