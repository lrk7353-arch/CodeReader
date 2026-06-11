import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Files,
  FileText,
  FileWarning,
  Folder,
  FolderOpen,
  LoaderCircle,
  Route
} from "lucide-react";
import type { ProjectGuide, ProjectTreeNode, SampleFile } from "../../types/explanation";
import { ProjectGuidePanel } from "../project-guide/ProjectGuidePanel";
import { buildProjectTree, type ProjectTreeItem } from "./projectTree";
import { buildFocusedTargetList, COMPACT_TARGET_LIMIT } from "./targetList";

interface FileExplorerProps {
  files: SampleFile[];
  guideFocusToken?: number;
  projectGuide?: ProjectGuide;
  projectNodes?: ProjectTreeNode[];
  selectedFileId: string;
  selectedExplanationId?: string;
  activeLine?: number;
  loadingFileId?: string | null;
  workspaceName: string;
  onSelectFile: (fileId: string) => void;
  onSelectExplanation: (explanationId: string) => void;
}

export function FileExplorer({
  files,
  guideFocusToken = 0,
  projectGuide,
  projectNodes = [],
  selectedFileId,
  selectedExplanationId,
  activeLine,
  loadingFileId,
  workspaceName,
  onSelectFile,
  onSelectExplanation
}: FileExplorerProps) {
  const [activeView, setActiveView] = useState<"files" | "guide">(
    projectGuide ? "guide" : "files"
  );
  const [expandedDirectoryIds, setExpandedDirectoryIds] = useState<Set<string>>(new Set());
  const [collapsedTargetFileIds, setCollapsedTargetFileIds] = useState<Set<string>>(new Set());
  const [expandedTargetFileIds, setExpandedTargetFileIds] = useState<Set<string>>(new Set());
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
    setActiveView(projectGuide ? "guide" : "files");
  }, [guideFocusToken, projectGuide?.projectId]);

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

  const toggleTargetList = (fileId: string) => {
    setCollapsedTargetFileIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleAllTargets = (fileId: string) => {
    setExpandedTargetFileIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
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
      const capability = node.capability;
      const isLoading = loadingFileId === node.id;
      const isActive = selectedFileId === node.id;
      const rowClass = [
        "file-row",
        isActive ? "active" : "",
        capability?.canPreview === false ? "unavailable" : ""
      ]
        .filter(Boolean)
        .join(" ");

      const explanations = file?.explanations ?? [];
      const targetListCollapsed = collapsedTargetFileIds.has(node.id);
      const targetListExpanded = expandedTargetFileIds.has(node.id);
      const focusedTargets = buildFocusedTargetList(
        explanations,
        selectedExplanationId,
        activeLine
      );
      const visibleTargets = targetListExpanded ? explanations : focusedTargets.items;

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

          {isActive && explanations.length ? (
            <div
              className="target-list-shell"
              style={{ paddingLeft: `${22 + depth * 14}px` }}
            >
              <div className="target-list-header">
                <span>
                  结构 {explanations.length}
                  {!targetListExpanded && focusedTargets.hiddenCount > 0
                    ? ` · 附近 ${visibleTargets.length}`
                    : ""}
                </span>
                <button
                  className="target-list-toggle"
                  type="button"
                  onClick={() => toggleTargetList(node.id)}
                  aria-expanded={!targetListCollapsed}
                  title={targetListCollapsed ? "展开结构列表" : "收起结构列表"}
                  aria-label={targetListCollapsed ? "展开结构列表" : "收起结构列表"}
                >
                  {targetListCollapsed ? (
                    <ChevronRight size={14} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={14} aria-hidden="true" />
                  )}
                </button>
              </div>
              {!targetListCollapsed ? (
                <>
                  <div className="target-list">
                    {visibleTargets.map((explanation) => (
                      <button
                        className={
                          explanation.id === selectedExplanationId
                            ? "target-row active"
                            : "target-row"
                        }
                        type="button"
                        key={explanation.id}
                        onClick={() => onSelectExplanation(explanation.id)}
                        title={`${explanation.targetName ?? explanation.targetType}${
                          explanation.startLine
                            ? ` · ${explanation.startLine}-${explanation.endLine ?? explanation.startLine}`
                            : ""
                        }`}
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
                  {explanations.length > COMPACT_TARGET_LIMIT ? (
                    <button
                      className="target-list-more"
                      type="button"
                      onClick={() => toggleAllTargets(node.id)}
                    >
                      {targetListExpanded
                        ? `收起到当前位置附近 ${COMPACT_TARGET_LIMIT} 项`
                        : `显示全部 ${explanations.length} 项`}
                    </button>
                  ) : null}
                </>
              ) : null}
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

      <div className="explorer-tabs" role="tablist" aria-label="项目导航">
        <button
          className={activeView === "files" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={activeView === "files"}
          onClick={() => setActiveView("files")}
          title="文件"
        >
          <Files size={14} aria-hidden="true" />
          <span>文件</span>
        </button>
        <button
          className={activeView === "guide" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={activeView === "guide"}
          onClick={() => setActiveView("guide")}
          title="阅读路径"
        >
          <Route size={14} aria-hidden="true" />
          <span>阅读路径</span>
        </button>
      </div>

      {activeView === "files" ? (
        <div className="file-list" role="tabpanel">
          {renderNodes(tree, 0)}
        </div>
      ) : (
        <div role="tabpanel">
          <ProjectGuidePanel guide={projectGuide} onSelectFile={onSelectFile} />
        </div>
      )}
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
