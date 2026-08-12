import type { CognitionState, ReadingState } from "../../types/explanation";

export const defaultCognitionState: CognitionState = {
  visitState: "unread",
  masteryState: "unconfirmed",
  reviewState: "current"
};

/** Deterministic compatibility import and legacy IPC projection. */
export function cognitionFromReadingState(state: ReadingState): CognitionState {
  switch (state) {
    case "understood":
      return { visitState: "read", masteryState: "understood", reviewState: "current" };
    case "needs_reexplain":
      return { visitState: "read", masteryState: "unconfirmed", reviewState: "needs_review" };
    case "unread":
      return defaultCognitionState;
    default:
      return { visitState: "read", masteryState: "unconfirmed", reviewState: "current" };
  }
}

/** Existing consumers keep their historical priority order. */
export function readingStateProjection(
  cognition: CognitionState,
  legacy?: ReadingState
): ReadingState {
  if (legacy === "suspicious" || legacy === "questioned") return legacy;
  if (cognition.reviewState === "needs_review") return "needs_reexplain";
  if (cognition.masteryState === "understood") return "understood";
  if (cognition.visitState === "read") return "read";
  return "unread";
}

export function cognitionFor(
  value: Pick<
    { cognitionState?: CognitionState; readingState: ReadingState },
    "cognitionState" | "readingState"
  >
): CognitionState {
  return value.cognitionState ?? cognitionFromReadingState(value.readingState);
}

export function keyPathMasteryPercent(states: CognitionState[]): number {
  return states.length === 0
    ? 0
    : Math.round(
        (states.filter((state) => state.masteryState === "understood").length / states.length) * 100
      );
}
