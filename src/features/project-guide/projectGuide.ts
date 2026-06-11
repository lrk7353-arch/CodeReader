import type {
  CodeFile,
  ProjectFileRole,
  ProjectGuide,
  ReadingProgress,
  ReadingState
} from "../../types/explanation";

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
    const states = file.explanations.map(
      (explanation) => readingStateOverrides[explanation.id] ?? explanation.readingState
    );
    return {
      ...step,
      readingState: aggregateReadingStates(states)
    };
  });
  return {
    ...guide,
    readingPath,
    progress: summarizeProgress(readingPath.map((step) => step.readingState))
  };
}

export function summarizeProgress(states: ReadingState[]): ReadingProgress {
  const progress: ReadingProgress = {
    total: states.length,
    unread: 0,
    read: 0,
    understood: 0,
    questioned: 0,
    suspicious: 0,
    needsReexplain: 0
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

export function progressPercent(progress: ReadingProgress) {
  if (progress.total === 0) {
    return 0;
  }
  const progressed = progress.total - progress.unread;
  return Math.round((progressed / progress.total) * 100);
}
