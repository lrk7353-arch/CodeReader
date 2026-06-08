import type { CodeFile, CodeNode, Explanation, ExplanationTargetType } from "../../types/explanation";

export function buildSelectableExplanations(file: CodeFile): Explanation[] {
  if (file.explanations.length > 0) {
    return file.explanations;
  }

  const nodes = file.codeNodes && file.codeNodes.length > 0 ? file.codeNodes : [fallbackFileNode(file)];
  return nodes.map((node) => explanationFromNode(file, node));
}

function explanationFromNode(file: CodeFile, node: CodeNode): Explanation {
  const targetLabel = targetTypeLabel(node.nodeType);
  const lineLabel =
    node.startLine === node.endLine ? `line ${node.startLine}` : `lines ${node.startLine}-${node.endLine}`;
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
    file: "文件",
    module: "模块",
    project: "项目"
  };
  return labels[targetType];
}

function firstNonEmptyLine(code: string) {
  return code
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}
