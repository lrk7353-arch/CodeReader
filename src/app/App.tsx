import { useMemo, useState } from "react";
import { sampleFiles } from "../data/sampleProject";
import type { Explanation, ReadingState } from "../types/explanation";
import { FileExplorer } from "../features/file-explorer/FileExplorer";
import { CodeViewerPlaceholder } from "../features/code-viewer/CodeViewerPlaceholder";
import { ExplanationPanel } from "../features/explanation-panel/ExplanationPanel";

export function App() {
  const [selectedFileId, setSelectedFileId] = useState(sampleFiles[0]?.id ?? "");
  const [selectedExplanationId, setSelectedExplanationId] = useState("exp-file-login-controller");
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
          <span>Sprint 0</span>
        </div>
      </header>

      <section className="workspace" aria-label="CodeReader workspace">
        <FileExplorer
          files={sampleFiles}
          selectedFileId={selectedFile.id}
          selectedExplanationId={selectedExplanation?.id}
          onSelectFile={setSelectedFileId}
          onSelectExplanation={setSelectedExplanationId}
        />
        <CodeViewerPlaceholder
          file={selectedFile}
          selectedExplanation={selectedExplanation}
          onSelectExplanation={setSelectedExplanationId}
        />
        <ExplanationPanel explanation={selectedExplanation} onReadingStateChange={updateReadingState} />
      </section>

      <footer className="statusbar">
        <span>{selectedFile.path}</span>
        <span>{selectedExplanation?.status ?? "valid"}</span>
        <span>{selectedExplanation?.readingState ?? "unread"}</span>
      </footer>
    </main>
  );
}
