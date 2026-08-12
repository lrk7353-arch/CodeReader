import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronRight, Link2, MessageSquareText, NotebookPen } from "lucide-react";
import { cognitionFor } from "../reading-state/cognition";
import type {
  CodeFile,
  Explanation,
  ProjectGuide,
  ReaderPreference,
  UserAnnotation,
  UserAnnotationKind
} from "../../types/explanation";

export interface RelatedNavigationTarget {
  id: string;
  fileId: string;
  explanationId?: string;
  relationKind: string;
  label: string;
  startLine?: number;
  endLine?: number;
  status?: Explanation["status"];
  targetType?: Explanation["targetType"];
}

export interface ReviewQueueItem {
  fileId: string;
  explanationId: string;
  fileName: string;
  label: string;
  reason: string;
}

interface CognitionToolsProps {
  busy: boolean;
  displayMode: ReaderPreference["displayMode"];
  explanation: Explanation;
  file: CodeFile;
  files: CodeFile[];
  projectGuide?: ProjectGuide;
  projectName: string;
  canGoBack: boolean;
  onAddAnnotation: (kind: UserAnnotationKind, body: string) => Promise<boolean>;
  onChangeDisplayMode: (mode: ReaderPreference["displayMode"]) => Promise<boolean>;
  onEditAnnotation: (
    annotation: UserAnnotation,
    kind: UserAnnotationKind,
    body: string
  ) => Promise<boolean>;
  onNavigate: (target: RelatedNavigationTarget) => Promise<boolean>;
  onNavigateReview: (item: ReviewQueueItem) => Promise<void>;
  onRemoveAnnotation: (annotation: UserAnnotation) => Promise<boolean>;
  onGoBack: () => Promise<void>;
}

export function CognitionTools({
  busy,
  displayMode,
  explanation,
  file,
  files,
  projectGuide,
  projectName,
  canGoBack,
  onAddAnnotation,
  onChangeDisplayMode,
  onEditAnnotation,
  onNavigate,
  onNavigateReview,
  onRemoveAnnotation,
  onGoBack
}: CognitionToolsProps) {
  const related = useMemo(
    () => buildRelatedNavigationTargets(file, explanation, files),
    [explanation, file, files]
  );
  const reviewQueue = useMemo(() => buildReviewQueue(files), [files]);
  return (
    <>
      <CognitionHierarchy
        busy={busy}
        explanation={explanation}
        file={file}
        files={files}
        projectGuide={projectGuide}
        projectName={projectName}
        onNavigate={onNavigate}
      />
      <div className="reader-mode-switch" role="group" aria-label="解释深度">
        <span>解释深度</span>
        <button
          type="button"
          className={displayMode === "plain" ? "active" : undefined}
          aria-pressed={displayMode === "plain"}
          disabled={busy}
          onClick={() => void onChangeDisplayMode("plain")}
        >
          通俗
        </button>
        <button
          type="button"
          className={displayMode === "detailed" ? "active" : undefined}
          aria-pressed={displayMode === "detailed"}
          disabled={busy}
          onClick={() => void onChangeDisplayMode("detailed")}
        >
          详细
        </button>
      </div>
      <RelatedTargets
        targets={related}
        canGoBack={canGoBack}
        onNavigate={onNavigate}
        onGoBack={onGoBack}
      />
      <ReviewQueue items={reviewQueue} onNavigate={onNavigateReview} />
      <AnnotationEditor
        annotations={explanation.annotations ?? []}
        busy={busy}
        explanationId={explanation.id}
        onAdd={onAddAnnotation}
        onEdit={onEditAnnotation}
        onRemove={onRemoveAnnotation}
      />
    </>
  );
}

function CognitionHierarchy({
  explanation,
  file,
  files,
  projectGuide,
  projectName,
  busy,
  onNavigate
}: {
  explanation: Explanation;
  file: CodeFile;
  files: CodeFile[];
  projectGuide?: ProjectGuide;
  projectName: string;
  busy: boolean;
  onNavigate: (target: RelatedNavigationTarget) => Promise<boolean>;
}) {
  const [scope, setScope] = useState<"project" | "module" | "file" | "target">("target");
  const [selectedModule, setSelectedModule] = useState(() =>
    moduleNameFor(file.relativePath ?? file.name)
  );
  const moduleName = moduleNameFor(file.relativePath ?? file.name);
  useEffect(() => setSelectedModule(moduleName), [moduleName]);
  const hierarchy = useMemo(
    () => buildCognitionHierarchy(files, file.projectId),
    [file.projectId, files]
  );
  const projectSummary = projectGuide
    ? `${projectGuide.mapItems.length} 个关键文件，${projectGuide.readingPath.length} 个关键阅读步骤，路径掌握度 ${projectGuide.progress.masteryPercent}%。`
    : "当前以已加载文件建立项目理解；项目指南暂不可用。";
  const moduleFiles = hierarchy.find((item) => item.name === selectedModule)?.files ?? [];
  const projectTarget = projectGuide?.readingPath.length
    ? hierarchyTargetForFile(
        files.find((candidate) => candidate.id === projectGuide.readingPath[0]?.fileId),
        "project",
        projectName
      )
    : hierarchyTargetForFile(file, "project", projectName);
  const moduleTarget = hierarchyTargetForFile(moduleFiles[0], "module", selectedModule);
  const fileTarget = hierarchyTargetForFile(file, "file", file.name);
  const targetTarget: RelatedNavigationTarget = {
    id: `hierarchy:target:${explanation.id}`,
    fileId: file.id,
    explanationId: explanation.id,
    relationKind: "hierarchy",
    label: explanation.targetName ?? explanation.anchorText ?? explanation.targetType,
    startLine: explanation.startLine,
    endLine: explanation.endLine,
    status: explanation.status
  };
  const summaries = {
    project: projectSummary,
    module: `${selectedModule} 包含 ${moduleFiles.length} 个可阅读文件。`,
    file:
      file.explanations.find((item) => item.targetType === "file")?.codeMeaning ??
      `${file.name} 是当前真实代码文件。`,
    target: explanation.codeMeaning
  };
  const levels = [
    ["project", projectName],
    ["module", selectedModule],
    ["file", file.name],
    ["target", explanation.targetName ?? explanation.anchorText ?? explanation.targetType]
  ] as const;
  return (
    <section className="cognition-hierarchy" aria-label="解释层级">
      <nav aria-label="项目到代码目标">
        {levels.map(([level, label], index) => (
          <span key={level}>
            {index > 0 ? <ChevronRight size={13} aria-hidden="true" /> : null}
            <button
              type="button"
              aria-current={scope === level ? "location" : undefined}
              disabled={busy}
              onClick={async () => {
                const target =
                  level === "project"
                    ? projectTarget
                    : level === "module"
                      ? moduleTarget
                      : level === "file"
                        ? fileTarget
                        : targetTarget;
                if (target && (await onNavigate(target))) setScope(level);
              }}
            >
              {label}
            </button>
          </span>
        ))}
      </nav>
      <p>
        <strong>{levels.find(([level]) => level === scope)?.[1]}：</strong>
        {summaries[scope]}
      </p>
      {scope === "project" ? (
        <div className="cognition-hierarchy-options" aria-label="选择模块">
          {hierarchy.map((module) => (
            <button
              type="button"
              key={module.name}
              disabled={busy}
              onClick={async () => {
                const target = hierarchyTargetForFile(module.files[0], "module", module.name);
                if (!target || !(await onNavigate(target))) return;
                setSelectedModule(module.name);
                setScope("module");
              }}
            >
              <strong>{module.name}</strong>
              <small>{module.files.length} 个文件</small>
            </button>
          ))}
        </div>
      ) : null}
      {scope === "module" ? (
        <div className="cognition-hierarchy-options" aria-label={`选择 ${selectedModule} 中的文件`}>
          {moduleFiles.map((candidate) => (
            <button
              type="button"
              key={candidate.id}
              disabled={busy}
              onClick={async () => {
                if (candidate.id === file.id) {
                  setScope("file");
                  return;
                }
                const fileExplanation = candidate.explanations.find(
                  (item) => item.targetType === "file" && item.status !== "deleted"
                );
                const moved = await onNavigate({
                  id: `hierarchy:file:${candidate.id}`,
                  fileId: candidate.id,
                  explanationId: fileExplanation?.id,
                  relationKind: "hierarchy",
                  label: candidate.relativePath ?? candidate.name,
                  startLine: fileExplanation?.startLine ?? 1,
                  endLine: fileExplanation?.endLine ?? 1
                });
                if (moved) setScope("file");
              }}
            >
              <strong>{candidate.name}</strong>
              <small>{candidate.relativePath ?? candidate.name}</small>
            </button>
          ))}
        </div>
      ) : null}
      {scope === "file" ? (
        <div className="cognition-hierarchy-options" aria-label={`选择 ${file.name} 中的代码目标`}>
          {buildFileHierarchyTargets(file).map((target) => (
            <button
              type="button"
              key={target.id}
              disabled={busy}
              onClick={async () => {
                if (await onNavigate(target)) setScope("target");
              }}
            >
              <strong>{target.label}</strong>
              <small>
                {target.targetType}
                {target.startLine ? ` · L${target.startLine}` : ""}
              </small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface CognitionHierarchyModule {
  name: string;
  files: CodeFile[];
}

interface CognitionHierarchyTarget extends RelatedNavigationTarget {
  targetType: Explanation["targetType"];
}

/** Every hierarchy level resolves to concrete code rather than a local-only summary. */
function hierarchyTargetForFile(
  candidate: CodeFile | undefined,
  relationKind: string,
  label: string
): RelatedNavigationTarget | undefined {
  if (!candidate) return undefined;
  const explanation =
    candidate.explanations.find(
      (item) => item.targetType === "file" && item.status !== "deleted"
    ) ?? candidate.explanations.find((item) => item.status !== "deleted");
  return {
    id: `hierarchy:${relationKind}:${candidate.id}`,
    fileId: candidate.id,
    explanationId: explanation?.id,
    relationKind: "hierarchy",
    label,
    startLine: explanation?.startLine ?? 1,
    endLine: explanation?.endLine ?? explanation?.startLine ?? 1,
    status: explanation?.status
  };
}

export function buildCognitionHierarchy(
  files: CodeFile[],
  projectId?: string
): CognitionHierarchyModule[] {
  const modules = new Map<string, CodeFile[]>();
  for (const candidate of files) {
    if (projectId && candidate.projectId !== projectId) continue;
    const name = moduleNameFor(candidate.relativePath ?? candidate.name);
    modules.set(name, [...(modules.get(name) ?? []), candidate]);
  }
  return [...modules.entries()]
    .map(([name, moduleFiles]) => ({
      name,
      files: moduleFiles.sort((left, right) =>
        (left.relativePath ?? left.name).localeCompare(right.relativePath ?? right.name)
      )
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildFileHierarchyTargets(file: CodeFile): CognitionHierarchyTarget[] {
  const targets = new Map<string, CognitionHierarchyTarget>();
  for (const item of file.explanations.filter((candidate) => candidate.status !== "deleted")) {
    targets.set(`explanation:${item.id}`, {
      id: `hierarchy:target:${item.id}`,
      fileId: file.id,
      explanationId: item.id,
      relationKind: "hierarchy",
      label: item.targetName ?? item.anchorText ?? item.targetType,
      startLine: item.startLine,
      endLine: item.endLine,
      status: item.status,
      targetType: item.targetType
    });
  }
  for (const node of file.codeNodes ?? []) {
    const matchingExplanation = file.explanations.find(
      (item) =>
        item.status !== "deleted" &&
        ((node.symbolId && item.symbolId === node.symbolId) ||
          (item.startLine === node.startLine && item.endLine === node.endLine))
    );
    if (matchingExplanation) continue;
    targets.set(`node:${node.id}`, {
      id: `hierarchy:node:${node.id}`,
      fileId: file.id,
      relationKind: "hierarchy",
      label: node.name,
      startLine: node.startLine,
      endLine: node.endLine,
      targetType: node.nodeType
    });
  }
  return [...targets.values()].sort(
    (left, right) => (left.startLine ?? 0) - (right.startLine ?? 0)
  );
}

function RelatedTargets({
  targets,
  canGoBack,
  onNavigate,
  onGoBack
}: {
  targets: RelatedNavigationTarget[];
  canGoBack: boolean;
  onNavigate: (target: RelatedNavigationTarget) => Promise<boolean>;
  onGoBack: () => Promise<void>;
}) {
  if (!canGoBack && targets.length === 0) return null;
  return (
    <section className="related-targets" aria-labelledby="related-targets-title">
      <h3 id="related-targets-title">
        <Link2 size={14} aria-hidden="true" /> 相关代码
      </h3>
      <div>
        {canGoBack ? (
          <button type="button" onClick={() => void onGoBack()}>
            <ArrowLeft size={14} aria-hidden="true" /> 返回跳转前位置
          </button>
        ) : null}
        {targets.map((target) => (
          <button key={target.id} type="button" onClick={() => void onNavigate(target)}>
            <span>{relationLabel(target.relationKind)}</span>
            <strong>{target.label}</strong>
            {target.startLine ? <small>L{target.startLine}</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function ReviewQueue({
  items,
  onNavigate
}: {
  items: ReviewQueueItem[];
  onNavigate: (item: ReviewQueueItem) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <details className="review-queue">
      <summary>复查队列（{items.length}）</summary>
      <ul>
        {items.map((item) => (
          <li key={`${item.fileId}:${item.explanationId}`}>
            <button type="button" onClick={() => void onNavigate(item)}>
              <strong>{item.label}</strong>
              <span>{item.fileName}</span>
              <small>{item.reason}</small>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AnnotationEditor({
  annotations,
  busy,
  explanationId,
  onAdd,
  onEdit,
  onRemove
}: {
  annotations: UserAnnotation[];
  busy: boolean;
  explanationId: string;
  onAdd: (kind: UserAnnotationKind, body: string) => Promise<boolean>;
  onEdit: (annotation: UserAnnotation, kind: UserAnnotationKind, body: string) => Promise<boolean>;
  onRemove: (annotation: UserAnnotation) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<UserAnnotationKind>("note");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<UserAnnotation>();
  useEffect(() => {
    setEditing(undefined);
    setBody("");
  }, [explanationId]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = editing ? await onEdit(editing, kind, body) : await onAdd(kind, body);
    if (saved) {
      setBody("");
      setEditing(undefined);
    }
  };
  return (
    <section className="annotation-editor" aria-labelledby="annotations-title">
      <h3 id="annotations-title">
        <NotebookPen size={14} aria-hidden="true" /> 我的记录
      </h3>
      {annotations.length ? (
        <ul>
          {annotations.map((annotation) => (
            <li key={annotation.id}>
              <span className={`annotation-kind ${annotation.kind}`}>
                {annotationKindLabel(annotation.kind)}
              </span>
              <p>{annotation.body || "旧版标记（无正文）"}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(annotation);
                  setKind(annotation.kind);
                  setBody(annotation.body);
                }}
              >
                编辑
              </button>
              <button type="button" disabled={busy} onClick={() => void onRemove(annotation)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="annotation-empty">还没有个人记录。</p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <label>
          类型
          <select
            value={kind}
            disabled={busy}
            onChange={(event) => setKind(event.target.value as UserAnnotationKind)}
          >
            <option value="note">笔记</option>
            <option value="question">问题</option>
            <option value="risk">风险</option>
          </select>
        </label>
        <label>
          内容
          <textarea
            value={body}
            disabled={busy}
            maxLength={4000}
            onChange={(event) => setBody(event.target.value)}
            placeholder="记录你自己的理解、问题或风险判断"
          />
        </label>
        <div>
          {editing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(undefined);
                setBody("");
              }}
            >
              取消编辑
            </button>
          ) : null}
          <button type="submit" disabled={busy || !body.trim()}>
            <MessageSquareText size={14} aria-hidden="true" />
            {editing ? "保存修改" : "添加记录"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function buildRelatedNavigationTargets(
  file: CodeFile,
  explanation: Explanation,
  files: CodeFile[]
): RelatedNavigationTarget[] {
  const targets: RelatedNavigationTarget[] = [];
  const relations = file.relatedTargets ?? [];
  for (const relation of relations) {
    if (relation.explanationId === explanation.id) {
      const resolved = resolveExplanation(files, relation.relatedExplanationId);
      targets.push({
        id: relation.id,
        fileId: relation.relatedFileId ?? resolved?.file.id ?? file.id,
        explanationId: relation.relatedExplanationId,
        relationKind: relation.relationKind,
        label:
          relation.relatedTargetName ??
          resolved?.explanation.targetName ??
          resolved?.explanation.anchorText ??
          (relation.relatedTargetType
            ? `${relation.relatedTargetType}${relation.relatedStartLine ? ` L${relation.relatedStartLine}` : ""}`
            : relation.relatedExplanationId),
        startLine: relation.relatedStartLine ?? resolved?.explanation.startLine,
        endLine: relation.relatedEndLine ?? resolved?.explanation.endLine,
        status: relation.relatedStatus ?? resolved?.explanation.status
      });
    } else if (relation.relatedExplanationId === explanation.id) {
      const resolved = resolveExplanation(files, relation.explanationId);
      if (resolved) {
        targets.push({
          id: `${relation.id}:reverse`,
          fileId: resolved.file.id,
          explanationId: relation.explanationId,
          relationKind: `reverse:${relation.relationKind}`,
          label:
            resolved.explanation.targetName ??
            resolved.explanation.anchorText ??
            relation.explanationId,
          startLine: resolved.explanation.startLine,
          endLine: resolved.explanation.endLine,
          status: resolved.explanation.status
        });
      }
    }
  }
  addLineRelations(targets, file, explanation, explanation.dependsOnLines, "depends_on");
  addLineRelations(targets, file, explanation, explanation.affectsLines, "affects");
  const deduplicated = new Map<string, RelatedNavigationTarget>();
  for (const target of targets) {
    const key = `${target.fileId}:${target.explanationId ?? "line"}:${target.startLine ?? 0}:${target.relationKind}`;
    if (!deduplicated.has(key)) deduplicated.set(key, target);
  }
  return [...deduplicated.values()];
}

export function buildReviewQueue(files: CodeFile[]): ReviewQueueItem[] {
  return files.flatMap((file) =>
    file.explanations.flatMap((explanation) => {
      const cognition = cognitionFor(explanation);
      const statusNeedsReview = ["stale", "invalid", "deleted", "new_unexplained"].includes(
        explanation.status
      );
      if (cognition.reviewState !== "needs_review" && !statusNeedsReview) return [];
      return [
        {
          fileId: file.id,
          explanationId: explanation.id,
          fileName: file.relativePath ?? file.name,
          label: explanation.targetName ?? explanation.anchorText ?? explanation.targetType,
          reason:
            cognition.reviewState === "needs_review"
              ? "理解记录需复查"
              : statusReviewLabel(explanation.status)
        }
      ];
    })
  );
}

function addLineRelations(
  targets: RelatedNavigationTarget[],
  file: CodeFile,
  explanation: Explanation,
  lines: number[] | undefined,
  relationKind: string
) {
  for (const line of lines ?? []) {
    const related = file.explanations
      .filter(
        (item) =>
          item.id !== explanation.id &&
          item.startLine !== undefined &&
          item.startLine <= line &&
          (item.endLine ?? item.startLine) >= line
      )
      .sort(
        (left, right) =>
          (left.endLine ?? left.startLine ?? 0) -
          (left.startLine ?? 0) -
          ((right.endLine ?? right.startLine ?? 0) - (right.startLine ?? 0))
      )[0];
    targets.push({
      id: `derived:${explanation.id}:${relationKind}:${line}`,
      fileId: file.id,
      explanationId: related?.id,
      relationKind,
      label: related?.targetName ?? related?.anchorText ?? `${file.name} 第 ${line} 行`,
      startLine: line,
      endLine: line,
      status: related?.status,
      targetType: "line"
    });
  }
}

function resolveExplanation(files: CodeFile[], explanationId: string) {
  for (const file of files) {
    const explanation = file.explanations.find((item) => item.id === explanationId);
    if (explanation) return { file, explanation };
  }
  return undefined;
}

function moduleNameFor(relativePath: string) {
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  return segments.length > 1 ? segments.slice(0, -1).join("/") : "项目根目录";
}

function relationLabel(kind: string): string {
  if (kind.startsWith("reverse:")) return `被${relationLabel(kind.slice(8))}`;
  return (
    {
      depends_on: "依赖",
      affects: "影响",
      calls: "调用",
      data_flow: "数据流",
      risk: "风险关联"
    }[kind] ?? kind
  );
}

function annotationKindLabel(kind: UserAnnotationKind) {
  return { note: "笔记", question: "问题", risk: "风险" }[kind];
}

function statusReviewLabel(status: Explanation["status"]) {
  return {
    valid: "当前",
    stale: "相关上下文变化",
    invalid: "目标代码变化",
    new_unexplained: "新增目标待解释",
    deleted: "目标已删除",
    transient: "临时目标"
  }[status];
}
