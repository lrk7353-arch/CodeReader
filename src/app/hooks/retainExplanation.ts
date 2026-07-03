import type { CodeSelection } from "../../features/code-viewer/MonacoCodeViewer";
import type { Explanation } from "../../types/explanation";

export function pickRetainedExplanation(
  explanations: Explanation[],
  selectedExplanationId: string,
  affectedExplanationIds: string[]
): Explanation | undefined {
  return (
    explanations.find((item) => item.id === selectedExplanationId) ??
    explanations.find((item) => affectedExplanationIds.includes(item.id)) ??
    explanations.find((item) => item.status !== "valid") ??
    explanations[0]
  );
}

export function codeSelectionForExplanation(explanation?: Explanation): CodeSelection {
  if (!explanation || explanation.targetType === "file" || !explanation.startLine) {
    return { startLine: 1, endLine: 1 };
  }
  return {
    startLine: explanation.startLine,
    endLine: explanation.endLine ?? explanation.startLine
  };
}
