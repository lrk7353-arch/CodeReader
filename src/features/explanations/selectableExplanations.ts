import type {
  CodeFile,
  CodeNode,
  Explanation,
  ExplanationTargetType
} from "../../types/explanation";

interface LineSelection {
  startLine: number;
  endLine: number;
}

interface UnexplainedNavigationTarget extends LineSelection {
  targetType: "function" | "block" | "line";
}

export function buildSelectableExplanations(file: CodeFile): Explanation[] {
  if (file.capability?.canExplain === false) {
    return [];
  }
  if (file.explanations.length > 0) {
    return file.explanations;
  }

  const nodes =
    file.codeNodes && file.codeNodes.length > 0 ? file.codeNodes : [fallbackFileNode(file)];
  return nodes.map((node) => explanationFromNode(file, node));
}

export function buildRangeExplanation(file: CodeFile, selection: LineSelection): Explanation {
  const createdAt = new Date().toISOString();
  const startLine = Math.min(selection.startLine, selection.endLine);
  const endLine = Math.max(selection.startLine, selection.endLine);
  const selectedLines = selectedCodeLines(file.code, startLine, endLine);
  const lineCount = Math.max(1, endLine - startLine + 1);

  return {
    id: rangeExplanationId(file.id, { startLine, endLine }),
    filePath: file.path,
    fileHash: file.fileHash,
    targetType: "range",
    targetName: `lines ${startLine}-${endLine}`,
    startLine,
    endLine,
    codeHash: `range:${file.fileHash ?? file.id}:${startLine}-${endLine}`,
    anchorText: firstNonEmptyLine(selectedLines),
    codeMeaning: `你选中了 ${lineCount} 行代码，CodeReader 将它作为一个临时多行阅读目标。`,
    localMeaning:
      "当前选择没有完全命中已识别的函数或代码块，因此先展示为临时 range。后续可由 Context Builder 为这段范围构造上下文。",
    globalMeaning:
      "多行选择是 CodeReader 的 P0 阅读动作：用户应能从任意代码片段进入解释面板，而不是被迫只读预定义结构节点。",
    riskNotes: [],
    readerNotes: ["这是当前选择生成的临时解释目标，暂不写入 SQLite。"],
    status: "transient",
    readingState: "unread",
    createdAt,
    updatedAt: createdAt
  };
}

export function rangeExplanationId(fileId: string, selection: LineSelection) {
  return `range:${fileId}:${selection.startLine}-${selection.endLine}`;
}

export function buildUnexplainedNavigationTarget(
  file: CodeFile,
  target: {
    targetType: ExplanationTargetType;
    startLine?: number;
    endLine?: number;
  }
): Explanation | undefined {
  if (!isUnexplainedNavigationTargetType(target.targetType)) {
    return undefined;
  }
  const lineCount = Math.max(1, file.code.split(/\r\n|\r|\n/).length);
  const startLine = target.startLine;
  const endLine = target.endLine ?? startLine;
  if (
    startLine === undefined ||
    endLine === undefined ||
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine ||
    endLine > lineCount
  ) {
    return undefined;
  }

  const node =
    target.targetType === "line"
      ? undefined
      : file.codeNodes?.find(
          (item) =>
            item.nodeType === target.targetType &&
            item.startLine === startLine &&
            item.endLine === endLine
        );
  if (target.targetType !== "line" && !node) return undefined;

  const version = file.fileHash ?? file.snapshotId ?? codeVersion(file.code);
  const createdAt = new Date().toISOString();
  const selectedLines = selectedCodeLines(file.code, startLine, endLine);
  const label = node?.name ?? `line ${startLine}`;
  return {
    id: unexplainedNavigationTargetId(file.id, target.targetType, startLine, endLine, version),
    filePath: file.path,
    fileHash: file.fileHash,
    targetType: target.targetType,
    targetName: label,
    startLine,
    endLine,
    symbolId: node?.symbolId,
    codeHash: node?.codeHash ?? `line:${version}:${startLine}`,
    anchorText: node?.anchorText ?? firstNonEmptyLine(selectedLines),
    codeMeaning: "这是当前代码版本中的结构目标，尚未生成解释。",
    localMeaning: `该目标精确绑定到第 ${startLine}${endLine === startLine ? "" : `-${endLine}`} 行。`,
    globalMeaning: "生成解释前，CodeReader 会保留这个目标与当前代码版本的绑定。",
    riskNotes: [],
    readerNotes: ["这是导航创建的内存目标，生成解释前不会写入持久化状态。"],
    status: "new_unexplained",
    readingState: "unread",
    createdAt,
    updatedAt: createdAt
  };
}

function isUnexplainedNavigationTargetType(
  targetType: ExplanationTargetType
): targetType is UnexplainedNavigationTarget["targetType"] {
  return targetType === "function" || targetType === "block" || targetType === "line";
}

function unexplainedNavigationTargetId(
  fileId: string,
  targetType: UnexplainedNavigationTarget["targetType"],
  startLine: number,
  endLine: number,
  version: string
) {
  return `unexplained:${encodeURIComponent(fileId)}:${targetType}:${startLine}-${endLine}:${encodeURIComponent(version)}`;
}

function codeVersion(code: string) {
  let hash = 2166136261;
  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `content-${(hash >>> 0).toString(16)}`;
}

export function findExplanationForSelection(
  explanations: Explanation[],
  selection: LineSelection
): Explanation | undefined {
  const candidates = explanations.filter(
    (explanation) => explanation.targetType !== "file" && explanation.startLine !== undefined
  );
  const span = (candidate: Explanation) =>
    (candidate.endLine ?? candidate.startLine ?? 0) - (candidate.startLine ?? 0);

  const exact = candidates.find((explanation) => {
    const start = explanation.startLine ?? 0;
    const end = explanation.endLine ?? start;
    return selection.startLine === start && selection.endLine === end;
  });

  if (exact) {
    return exact;
  }

  if (selection.startLine === selection.endLine) {
    return candidates
      .filter((explanation) => {
        const start = explanation.startLine ?? 0;
        const end = explanation.endLine ?? start;
        return selection.startLine >= start && selection.startLine <= end;
      })
      .sort((left, right) => span(left) - span(right))[0];
  }

  return candidates
    .filter((explanation) => {
      const start = explanation.startLine ?? 0;
      const end = explanation.endLine ?? start;
      return selection.startLine >= start && selection.endLine <= end;
    })
    .sort((left, right) => span(left) - span(right))[0];
}

function explanationFromNode(file: CodeFile, node: CodeNode): Explanation {
  const targetLabel = targetTypeLabel(node.nodeType);
  const lineLabel =
    node.startLine === node.endLine
      ? `line ${node.startLine}`
      : `lines ${node.startLine}-${node.endLine}`;
  const createdAt = new Date().toISOString();

  return {
    id: `exp:${node.id}`,
    filePath: file.path,
    fileHash: file.fileHash,
    targetType: node.nodeType,
    targetName: node.name,
    startLine: node.startLine,
    endLine: node.endLine,
    symbolId: node.symbolId,
    codeHash: node.codeHash,
    anchorText: node.anchorText,
    codeMeaning: `CodeReader 已识别出一个 ${targetLabel} 结构目标，但这里还没有生成 AI 解释。`,
    localMeaning: `该目标位于 ${lineLabel}，锚点文本为“${node.anchorText || node.name}”。后续解释会绑定到这个结构目标，而不是只绑定裸行号。`,
    globalMeaning:
      "这个结构锚点会用于后续的 SQLite 持久化、Context Builder、局部重新解释和代码变更后的过期判断。",
    riskNotes: file.parseError ? ["Tree-sitter 解析报告了语法错误，结构节点可能不完整。"] : [],
    readerNotes: ["当前阶段先验证真实文件、结构节点和右侧面板映射，暂不调用 LLM。"],
    status: "new_unexplained",
    readingState: "unread",
    createdAt,
    updatedAt: createdAt
  };
}

function fallbackFileNode(file: CodeFile): CodeNode {
  const lineCount = file.code.split(/\r\n|\r|\n/).length || 1;
  return {
    id: `target:${file.id}:file`,
    filePath: file.path,
    nodeType: "file",
    name: file.name,
    startLine: 1,
    endLine: lineCount,
    codeHash: file.fileHash ?? "unknown",
    anchorText: firstNonEmptyLine(file.code)
  };
}

function targetTypeLabel(targetType: ExplanationTargetType) {
  const labels: Record<ExplanationTargetType, string> = {
    import: "import",
    export: "export",
    line: "单行",
    range: "多行",
    block: "代码块",
    function: "函数",
    class: "类",
    statement: "SQL 语句",
    query: "SQL 查询",
    file: "文件",
    module: "模块",
    project: "项目"
  };
  return labels[targetType];
}

function firstNonEmptyLine(code: string) {
  return (
    code
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function selectedCodeLines(code: string, startLine: number, endLine: number) {
  return code
    .split(/\r\n|\r|\n/)
    .slice(startLine - 1, endLine)
    .join("\n");
}
