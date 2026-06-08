import { useCallback, useMemo, useState } from "react";
import { sampleFiles } from "../data/sampleProject";
import type { Explanation, ReadingState } from "../types/explanation";
import { FileExplorer } from "../features/file-explorer/FileExplorer";
import { MonacoCodeViewer, type CodeSelection } from "../features/code-viewer/MonacoCodeViewer";
import { ExplanationPanel } from "../features/explanation-panel/ExplanationPanel";

export function App() {
  const [selectedFileId, setSelectedFileId] = useState(sampleFiles[0]?.id ?? "");
  const [selectedExplanationId, setSelectedExplanationId] = useState("exp-file-login-controller");
  const [selectedCodeSelection, setSelectedCodeSelection] = useState<CodeSelection>({
    startLine: 1,
    endLine: 1
  });
  const [readingStates, setReadingStates] = useState<Record<string, ReadingState>>({});

  const selectedFile = useMemo(
    () => sampleFiles.find((file) => file.id === selectedFileId) ?? sampleFiles[0],
    [selectedFileId]
  );

  const selectedExplanation = useMemo<Explanation | undefined>(() => {
    const explanation = selectedFile.explanations.find((item) => item.id === selectedExplanationId);
    if (!explanation) {
      return selectedFile.explanations[0];
    }
    return {
      ...explanation,
      readingState: readingStates[explanation.id] ?? explanation.readingState
    };
  }, [readingStates, selectedExplanationId, selectedFile]);

  const selectExplanation = useCallback(
    (explanationId: string) => {
      const explanation = selectedFile.explanations.find((item) => item.id === explanationId);
      setSelectedExplanationId(explanationId);
      if (explanation?.startLine) {
        setSelectedCodeSelection({
          startLine: explanation.startLine,
          endLine: explanation.endLine ?? explanation.startLine
        });
      } else {
        setSelectedCodeSelection({ startLine: 1, endLine: 1 });
      }
    },
    [selectedFile]
  );

  const selectFile = useCallback((fileId: string) => {
    const file = sampleFiles.find((item) => item.id === fileId) ?? sampleFiles[0];
    setSelectedFileId(file.id);
    setSelectedExplanationId(file.explanations[0]?.id ?? "");
    setSelectedCodeSelection({ startLine: 1, endLine: 1 });
  }, []);

  const updateSelection = useCallback((selection: CodeSelection) => {
    setSelectedCodeSelection(selection);
  }, []);

  function updateReadingState(state: ReadingState) {
    if (!selectedExplanation) {
      return;
    }
    setReadingStates((current) => ({
      ...current,
      [selectedExplanation.id]: state
    }));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            CR
          </span>
          <div>
            <h1>CodeReader</h1>
            <p>单文件阅读闭环骨架</p>
          </div>
        </div>
        <div className="topbar-status">
          <span>Local</span>
          <span>Sprint 1</span>
        </div>
      </header>

      <section className="workspace" aria-label="CodeReader workspace">
        <FileExplorer
          files={sampleFiles}
          selectedFileId={selectedFile.id}
          selectedExplanationId={selectedExplanation?.id}
          onSelectFile={selectFile}
          onSelectExplanation={selectExplanation}
        />
        <MonacoCodeViewer
          file={selectedFile}
          selectedExplanation={selectedExplanation}
          onSelectExplanation={selectExplanation}
          onSelectionChange={updateSelection}
        />
        <ExplanationPanel explanation={selectedExplanation} onReadingStateChange={updateReadingState} />
      </section>

      <footer className="statusbar">
        <span>{selectedFile.path}</span>
        <span>
          {selectedCodeSelection.startLine === selectedCodeSelection.endLine
            ? `line:${selectedCodeSelection.startLine}`
            : `lines:${selectedCodeSelection.startLine}-${selectedCodeSelection.endLine}`}
        </span>
        <span>{selectedExplanation?.status ?? "valid"}</span>
        <span>{selectedExplanation?.readingState ?? "unread"}</span>
      </footer>
    </main>
  );
}
