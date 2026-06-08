import type { Explanation, SampleFile } from "../../types/explanation";

interface CodeViewerPlaceholderProps {
  file: SampleFile;
  selectedExplanation?: Explanation;
  onSelectExplanation: (explanationId: string) => void;
}

export function CodeViewerPlaceholder({ file, selectedExplanation, onSelectExplanation }: CodeViewerPlaceholderProps) {
  const lines = file.code.split("\n");

  function explanationForLine(lineNumber: number) {
    return file.explanations.find((explanation) => {
      if (explanation.targetType === "file") {
        return false;
      }
      const start = explanation.startLine ?? 0;
      const end = explanation.endLine ?? start;
      return lineNumber >= start && lineNumber <= end;
    });
  }

  return (
    <section className="code-viewer" aria-label="Code viewer">
      <div className="editor-toolbar">
        <span>{file.path}</span>
        <span>{file.language}</span>
      </div>
      <pre className="code-lines">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const explanation = explanationForLine(lineNumber);
          const isSelected =
            selectedExplanation?.id === explanation?.id ||
            (selectedExplanation?.targetType === "file" && lineNumber === 1);

          return (
            <button
              className={isSelected ? "code-line selected" : explanation ? "code-line explained" : "code-line"}
              key={`${file.id}-${lineNumber}`}
              type="button"
              onClick={() => onSelectExplanation(explanation?.id ?? file.explanations[0]?.id ?? "")}
            >
              <span className="line-number">{lineNumber}</span>
              <code>{line || " "}</code>
            </button>
          );
        })}
      </pre>
    </section>
  );
}
