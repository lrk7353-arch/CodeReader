import type { Explanation } from "../../types/explanation";

export const COMPACT_TARGET_LIMIT = 12;

export interface FocusedTargetList {
  items: Explanation[];
  hiddenCount: number;
}

export function buildFocusedTargetList(
  explanations: Explanation[],
  selectedExplanationId?: string,
  activeLine?: number,
  limit = COMPACT_TARGET_LIMIT
): FocusedTargetList {
  if (explanations.length <= limit) {
    return { items: explanations, hiddenCount: 0 };
  }

  const fileTargets = explanations.filter((item) => item.targetType === "file");
  const localTargets = explanations.filter((item) => item.targetType !== "file");
  const localSlots = Math.max(0, limit - fileTargets.length);
  const selectedIndex = localTargets.findIndex((item) => item.id === selectedExplanationId);
  const focusIndex =
    selectedIndex >= 0 ? selectedIndex : nearestTargetIndex(localTargets, activeLine);
  const start = centeredWindowStart(focusIndex, localTargets.length, localSlots);
  const items = [...fileTargets, ...localTargets.slice(start, start + localSlots)].slice(0, limit);

  return {
    items,
    hiddenCount: explanations.length - items.length
  };
}

function nearestTargetIndex(explanations: Explanation[], activeLine?: number) {
  if (!activeLine || explanations.length === 0) {
    return 0;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  explanations.forEach((explanation, index) => {
    const startLine = explanation.startLine ?? 1;
    const endLine = explanation.endLine ?? startLine;
    const distance =
      activeLine < startLine
        ? startLine - activeLine
        : activeLine > endLine
          ? activeLine - endLine
          : 0;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function centeredWindowStart(focusIndex: number, itemCount: number, windowSize: number) {
  if (windowSize <= 0 || itemCount <= windowSize) {
    return 0;
  }
  const centered = focusIndex - Math.floor(windowSize / 2);
  return Math.max(0, Math.min(centered, itemCount - windowSize));
}
