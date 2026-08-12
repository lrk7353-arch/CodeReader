import type {
  CodeFile,
  CognitionState,
  ProjectFileRole,
  ProjectGuide,
  ReadingProgress,
  ReadingState
} from "../../types/explanation";
import {
  cognitionFor,
  keyPathMasteryPercent,
  readingStateProjection
} from "../reading-state/cognition";

export const projectRoleLabels: Record<ProjectFileRole, string> = {
  documentation: "项目说明",
  entry: "入口",
  config: "配置",
  business: "核心业务",
  data: "数据层",
  style: "样式",
  test: "测试",
  other: "其他"
};

export const projectRoleOrder: ProjectFileRole[] = [
  "documentation",
  "entry",
  "config",
  "business",
  "data",
  "style",
  "test",
  "other"
];

export function deriveGuideProgress(
  guide: ProjectGuide,
  files: CodeFile[],
  readingStateOverrides: Record<string, ReadingState> = {}
): ProjectGuide {
  const fileById = new Map(files.map((file) => [file.id, file]));
  const readingPath = guide.readingPath.map((step) => {
    const file = fileById.get(step.fileId);
    if (!file?.explanations.length) {
      return step;
    }
    const cognitions = file.explanations.map((explanation) =>
      cognitionFor({
        cognitionState: explanation.cognitionState,
        readingState: readingStateOverrides[explanation.id] ?? explanation.readingState
      })
    );
    const cognitionState = aggregateCognitionStates(cognitions);
    return {
      ...step,
      cognitionState,
      readingState:
        legacyStateForExplanations(file.explanations) ?? readingStateProjection(cognitionState)
    };
  });
  return {
    ...guide,
    readingPath,
    progress: {
      ...summarizeCognitionProgress(
        readingPath.map((step) =>
          cognitionFor({ cognitionState: step.cognitionState, readingState: step.readingState })
        )
      )
    }
  };
}

export function legacyStateForExplanations(explanations: CodeFile["explanations"]) {
  const legacyKinds = explanations.flatMap((explanation) =>
    (explanation.annotations ?? [])
      .filter((annotation) => annotation.id.startsWith("annotation:legacy-state:"))
      .map((annotation) => annotation.kind)
  );
  if (legacyKinds.includes("risk")) return "suspicious" as const;
  if (legacyKinds.includes("question")) return "questioned" as const;
  return undefined;
}

export function summarizeCognitionProgress(states: CognitionState[]): ReadingProgress {
  const progress: ReadingProgress = {
    total: states.length,
    unread: 0,
    read: 0,
    understood: 0,
    questioned: 0,
    suspicious: 0,
    needsReexplain: 0,
    masteryPercent: keyPathMasteryPercent(states)
  };
  for (const state of states) {
    if (state.visitState === "unread") {
      progress.unread += 1;
    } else {
      progress.read += 1;
    }
    if (state.masteryState === "understood") {
      progress.understood += 1;
    }
    if (state.reviewState === "needs_review") {
      progress.needsReexplain += 1;
    }
  }
  return progress;
}

export function summarizeProgress(states: ReadingState[]): ReadingProgress {
  const progress: ReadingProgress = {
    total: states.length,
    unread: 0,
    read: 0,
    understood: 0,
    questioned: 0,
    suspicious: 0,
    needsReexplain: 0,
    masteryPercent: 0
  };
  for (const state of states) {
    if (state === "needs_reexplain") {
      progress.needsReexplain += 1;
    } else {
      progress[state] += 1;
    }
  }
  return progress;
}

export function aggregateReadingStates(states: ReadingState[]): ReadingState {
  if (states.includes("suspicious")) {
    return "suspicious";
  }
  if (states.includes("questioned")) {
    return "questioned";
  }
  if (states.includes("needs_reexplain")) {
    return "needs_reexplain";
  }
  const meaningful = states.filter((state) => state !== "unread");
  if (meaningful.length === 0) {
    return "unread";
  }
  if (meaningful.length === states.length && meaningful.every((state) => state === "understood")) {
    return "understood";
  }
  return "read";
}

export function aggregateCognitionStates(states: CognitionState[]): CognitionState {
  if (states.length === 0)
    return { visitState: "unread", masteryState: "unconfirmed", reviewState: "current" };
  return {
    visitState: states.some((state) => state.visitState === "read") ? "read" : "unread",
    masteryState:
      states.length > 0 && states.every((state) => state.masteryState === "understood")
        ? "understood"
        : "unconfirmed",
    reviewState: states.some((state) => state.reviewState === "needs_review")
      ? "needs_review"
      : "current"
  };
}

export function progressPercent(progress: ReadingProgress) {
  return progress.masteryPercent;
}
