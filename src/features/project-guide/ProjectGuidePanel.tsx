import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  FileText,
  HelpCircle,
  RefreshCw,
  Route
} from "lucide-react";
import type {
  ProjectFileRole,
  ProjectGuide,
  ReadingState
} from "../../types/explanation";
import {
  progressPercent,
  projectRoleLabels,
  projectRoleOrder
} from "./projectGuide";

interface ProjectGuidePanelProps {
  guide?: ProjectGuide;
  onSelectFile: (fileId: string) => void;
}

export function ProjectGuidePanel({ guide, onSelectFile }: ProjectGuidePanelProps) {
  const [openRoles, setOpenRoles] = useState<Set<ProjectFileRole>>(
    () => new Set(["entry", "business"])
  );

  if (!guide) {
    return (
      <div className="guide-empty">
        <Route size={18} aria-hidden="true" />
        <p>打开一个项目后，这里会给出轻量文件地图和建议阅读顺序。</p>
      </div>
    );
  }

  const groupedItems = projectRoleOrder
    .map((role) => ({
      role,
      items: guide.mapItems.filter((item) => item.role === role)
    }))
    .filter((group) => group.items.length > 0);
  const percent = progressPercent(guide.progress);

  return (
    <div className="project-guide">
      <section className="guide-progress" aria-label="推荐路径阅读进度">
        <div className="guide-section-heading">
          <span>阅读进度</span>
          <strong>{percent}%</strong>
        </div>
        <div
          className="guide-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="guide-progress-summary">
          <span>未读 {guide.progress.unread}</span>
          <span>已读 {guide.progress.read}</span>
          <span>已理解 {guide.progress.understood}</span>
          <span>有疑问 {guide.progress.questioned}</span>
        </div>
      </section>

      <section className="reading-path" aria-label="推荐阅读路径">
        <div className="guide-section-heading">
          <span>建议阅读顺序</span>
          <small>{guide.readingPath.length} 个文件</small>
        </div>
        <ol>
          {guide.readingPath.map((step) => (
            <li key={step.id}>
              <button type="button" onClick={() => onSelectFile(step.fileId)} title={step.reason}>
                <span className="path-position">{step.position}</span>
                <span className="path-copy">
                  <strong>{fileName(step.relativePath)}</strong>
                  <span>{projectRoleLabels[step.role]}</span>
                  <small>{step.reason}</small>
                </span>
                <ReadingStateIcon state={step.readingState} />
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="project-map" aria-label="轻量项目文件地图">
        <div className="guide-section-heading">
          <span>文件地图</span>
          <small>{guide.mapItems.length} 个文件</small>
        </div>
        {groupedItems.map(({ role, items }) => (
          <details
            key={role}
            open={openRoles.has(role)}
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setOpenRoles((current) => {
                if (current.has(role) === isOpen) {
                  return current;
                }
                const next = new Set(current);
                if (isOpen) {
                  next.add(role);
                } else {
                  next.delete(role);
                }
                return next;
              });
            }}
          >
            <summary>
              <span>{projectRoleLabels[role]}</span>
              <span>{items.length}</span>
            </summary>
            <ul>
              {items.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onSelectFile(item.fileId)} title={item.reason}>
                    <FileText size={14} aria-hidden="true" />
                    <span>{item.relativePath}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  );
}

function ReadingStateIcon({ state }: { state: ReadingState }) {
  const details: Record<
    ReadingState,
    { label: string; icon: typeof Circle }
  > = {
    unread: { label: "未读", icon: Circle },
    read: { label: "已读", icon: CheckCircle2 },
    understood: { label: "已理解", icon: CheckCircle2 },
    questioned: { label: "有疑问", icon: HelpCircle },
    suspicious: { label: "不对劲", icon: AlertCircle },
    needs_reexplain: { label: "需重解", icon: RefreshCw }
  };
  const { label, icon: Icon } = details[state];
  return (
    <span className={`path-state ${state}`} title={label} aria-label={label}>
      <Icon size={15} aria-hidden="true" />
    </span>
  );
}

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}
