import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  FileWarning,
  Folder,
  FolderOpen,
  LoaderCircle
} from "lucide-react";
import type { ProjectTreeNode, SampleFile } from "../../types/explanation";
import { buildProjectTree, type ProjectTreeItem } from "./projectTree";

interface FileExplorerProps {
  files: SampleFile[];
  projectNodes?: ProjectTreeNode[];
  selectedFileId: string;
  selectedExplanationId?: string;
  loadingFileId?: string | null;
  workspaceName: string;
  onSelectFile: (fileId: string) => void;
  onSelectExplanation: (explanationId: string) => void;
}

export function FileExplorer({
  files,
  projectNodes = [],
  selectedFileId,
  selectedExplanationId,
  loadingFileId,
  workspaceName,
  onSelectFile,
  onSelectExplanation
}: FileExplorerProps) {
  const [expandedDirectoryIds, setExpandedDirectoryIds] = useState<Set<string>>(new Set());
  const fileById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);
  const tree = useMemo(
    () =>
      projectNodes.length > 0
        ? buildProjectTree(projectNodes)
        : files.map<ProjectTreeItem>((file) => ({
            id: file.id,
            name: file.name,
            path: file.path,
            relativePath: file.relativePath ?? file.name,
            kind: "file",
            capability: file.capability,
            children: []
          })),
    [files, projectNodes]
  );

  useEffect(() => {
    if (projectNodes.length === 0) {
      setExpandedDirectoryIds(new Set());
      return;
    }
    const nodesById = new Map(projectNodes.map((node) => [node.id, node]));
    const validDirectories = new Set(
      projectNodes.filter((node) => node.kind === "directory").map((node) => node.id)
    );
    setExpandedDirectoryIds((currentExpanded) => {
      const expanded = new Set(
        [...currentExpanded].filter((directoryId) => validDirectories.has(directoryId))
      );
      let current = nodesById.get(selectedFileId);
      while (current?.parentId) {
        expanded.add(current.parentId);
        current = nodesById.get(current.parentId);
      }
      return expanded;
    });
  }, [projectNodes, selectedFileId]);

  const toggleDirectory = (directoryId: string) => {
    setExpandedDirectoryIds((current) => {
      const next = new Set(current);
      if (next.has(directoryId)) {
        next.delete(directoryId);
      } else {
        next.add(directoryId);
      }
      return next;
    });
  };

  const renderNodes = (nodes: ProjectTreeItem[], depth: number): ReactNode =>
    nodes.map((node) => {
      const rowStyle = { paddingLeft: `${8 + depth * 14}px` };
      if (node.kind === "directory") {
        const expanded = expandedDirectoryIds.has(node.id);
        return (
          <div className="tree-directory" key={node.id}>
            <button
              className="directory-row"
              type="button"
              style={rowStyle}
              onClick={() => toggleDirectory(node.id)}
              aria-expanded={expanded}
              title={node.relativePath}
            >
              {expanded ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronRight size={14} aria-hidden="true" />
              )}
              {expanded ? (
                <FolderOpen size={16} aria-hidden="true" />
              ) : (
                <Folder size={16} aria-hidden="true" />
              )}
              <span>{node.name}</span>
            </button>
            {expanded ? renderNodes(node.children, depth + 1) : null}
          </div>
        );
      }

      const file = fileById.get(node.id);
      const capability = file?.capability ?? node.capability;
      const isLoading = loadingFileId === node.id;
      const isActive = selectedFileId === node.id;
      const rowClass = [
        "file-row",
        isActive ? "active" : "",
        capability?.canPreview === false ? "unavailable" : ""
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <div className="file-group" key={node.id}>
          <button
            className={rowClass}
            type="button"
            style={rowStyle}
            onClick={() => onSelectFile(node.id)}
            aria-busy={isLoading}
            title={capability?.reason ?? node.relativePath}
          >
            {isLoading ? (
              <LoaderCircle className="spin-icon" size={16} aria-hidden="true" />
            ) : (
              <FileIcon previewKind={capability?.previewKind} />
            )}
            <span>{node.name}</span>
            {isLoading ? (
              <span className="row-meta">加载中</span>
            ) : capability?.canPreview === false ? (
              <span className="row-meta">不可预览</span>
            ) : capability?.canExplain === false ? (
              <span className="row-meta">只读</span>
            ) : null}
          </button>

          {isActive && file?.explanations.length ? (
            <div className="target-list" style={{ paddingLeft: `${22 + depth * 14}px` }}>
              {file.explanations.map((explanation) => (
                <button
                  className={
                    explanation.id === selectedExplanationId ? "target-row active" : "target-row"
                  }
                  type="button"
                  key={explanation.id}
                  onClick={() => onSelectExplanation(explanation.id)}
                >
                  <Braces
                    className={`target-status-icon ${explanation.status}`}
                    size={14}
                    aria-hidden="true"
                  />
                  <span>
                    {explanation.targetName ??
                      `${explanation.targetType}:${explanation.startLine ?? "file"}`}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <aside className="file-explorer" aria-label="Files">
      <div className="panel-title">
        <FolderOpen size={16} aria-hidden="true" />
        <span title={workspaceName}>{workspaceName}</span>
      </div>

      <div className="file-list">{renderNodes(tree, 0)}</div>
    </aside>
  );
}

function FileIcon({ previewKind }: { previewKind?: "code" | "text" | "unavailable" }) {
  if (previewKind === "text") {
    return <FileText size={16} aria-hidden="true" />;
  }
  if (previewKind === "unavailable") {
    return <FileWarning size={16} aria-hidden="true" />;
  }
  return <FileCode2 size={16} aria-hidden="true" />;
}
