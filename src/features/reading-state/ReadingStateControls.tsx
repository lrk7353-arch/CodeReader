import { CheckCircle2, Circle, Eye, RefreshCw } from "lucide-react";
import type { CognitionState } from "../../types/explanation";

interface ReadingStateControlsProps {
  cognition: CognitionState;
  onChange: (state: CognitionState) => void;
}

export function ReadingStateControls({ cognition, onChange }: ReadingStateControlsProps) {
  const controls = [
    {
      label: cognition.visitState === "read" ? "已访问" : "标记已访问",
      icon: Eye,
      next: { ...cognition, visitState: "read" as const }
    },
    {
      label: "已理解",
      icon: CheckCircle2,
      next: { ...cognition, visitState: "read" as const, masteryState: "understood" as const }
    },
    {
      label: cognition.reviewState === "needs_review" ? "需复查" : "标记需复查",
      icon: RefreshCw,
      next: { ...cognition, reviewState: "needs_review" as const }
    },
    {
      label: "重置掌握",
      icon: Circle,
      next: { ...cognition, masteryState: "unconfirmed" as const }
    }
  ];
  return (
    <div className="reading-state-block" aria-label="认知状态">
      <div className="section-label">认知状态</div>
      <div className="reading-state-group">
        {controls.map(({ label, icon: Icon, next }) => (
          <button
            className="state-button"
            type="button"
            key={label}
            onClick={() => onChange(next)}
            title={label}
            aria-pressed={label === "已理解" || label === "已访问" || label === "需复查"}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
