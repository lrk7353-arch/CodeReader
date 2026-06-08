import { AlertCircle, CheckCircle2, Circle, HelpCircle, RefreshCw } from "lucide-react";
import type { ReadingState } from "../../types/explanation";

interface ReadingStateControlsProps {
  currentState: ReadingState;
  onChange: (state: ReadingState) => void;
}

const states: Array<{ state: ReadingState; label: string; icon: typeof Circle }> = [
  { state: "unread", label: "未读", icon: Circle },
  { state: "understood", label: "已理解", icon: CheckCircle2 },
  { state: "questioned", label: "有疑问", icon: HelpCircle },
  { state: "suspicious", label: "不对劲", icon: AlertCircle },
  { state: "needs_reexplain", label: "需重解", icon: RefreshCw }
];

export function ReadingStateControls({ currentState, onChange }: ReadingStateControlsProps) {
  return (
    <div className="reading-state-block" aria-label="阅读状态">
      <div className="section-label">阅读状态</div>
      <div className="reading-state-group">
        {states.map(({ state, label, icon: Icon }) => (
          <button
            className={currentState === state ? "state-button active" : "state-button"}
            type="button"
            key={state}
            onClick={() => onChange(state)}
            title={label}
            aria-pressed={currentState === state}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
