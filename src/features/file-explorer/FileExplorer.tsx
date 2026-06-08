import { Braces, FileCode2, FolderOpen } from "lucide-react";
import type { SampleFile } from "../../types/explanation";

interface FileExplorerProps {
  files: SampleFile[];
  selectedFileId: string;
  selectedExplanationId?: string;
  onSelectFile: (fileId: string) => void;
  onSelectExplanation: (explanationId: string) => void;
}

export function FileExplorer({
  files,
  selectedFileId,
  selectedExplanationId,
  onSelectFile,
  onSelectExplanation
}: FileExplorerProps) {
  return (
    <aside className="file-explorer" aria-label="Files">
      <div className="panel-title">
        <FolderOpen size={16} aria-hidden="true" />
        <span>examples</span>
      </div>

      <div className="file-list">
        {files.map((file) => (
          <div className="file-group" key={file.id}>
            <button
              className={file.id === selectedFileId ? "file-row active" : "file-row"}
              type="button"
              onClick={() => {
                onSelectFile(file.id);
                onSelectExplanation(file.explanations[0]?.id ?? "");
              }}
            >
              <FileCode2 size={16} aria-hidden="true" />
              <span>{file.name}</span>
            </button>

            {file.id === selectedFileId ? (
              <div className="target-list">
                {file.explanations.map((explanation) => (
                  <button
                    className={explanation.id === selectedExplanationId ? "target-row active" : "target-row"}
                    type="button"
                    key={explanation.id}
                    onClick={() => onSelectExplanation(explanation.id)}
                  >
                    <Braces size={14} aria-hidden="true" />
                    <span>{explanation.targetName ?? `${explanation.targetType}:${explanation.startLine ?? "file"}`}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
