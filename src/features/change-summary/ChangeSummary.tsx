import { GitCompareArrows, ListRestart } from "lucide-react";
import type { ChangeSummary as ChangeSummaryData } from "../../types/explanation";

interface ChangeSummaryProps {
  summary: ChangeSummaryData;
  onSelectAffected: () => void;
}

export function ChangeSummary({ summary, onSelectAffected }: ChangeSummaryProps) {
  const changedStructures = summary.addedNodes + summary.modifiedNodes + summary.deletedNodes;

  return (
    <section className="change-summary" aria-label="代码变更摘要">
      <div className="change-summary-heading">
        <GitCompareArrows size={16} aria-hidden="true" />
        <div>
          <strong>检测到文件变化</strong>
          <span>{summary.summary}</span>
        </div>
      </div>
      <dl className="change-metrics">
        <div>
          <dt>新增</dt>
          <dd>{summary.addedLines} 行</dd>
        </div>
        <div>
          <dt>修改</dt>
          <dd>{summary.modifiedLines} 行</dd>
        </div>
        <div>
          <dt>删除</dt>
          <dd>{summary.deletedLines} 行</dd>
        </div>
        <div>
          <dt>结构变化</dt>
          <dd>{changedStructures} 个</dd>
        </div>
      </dl>
      {summary.affectedExplanationIds.length > 0 ? (
        <button type="button" onClick={onSelectAffected}>
          <ListRestart size={15} aria-hidden="true" />
          <span>查看受影响解释</span>
        </button>
      ) : null}
    </section>
  );
}
