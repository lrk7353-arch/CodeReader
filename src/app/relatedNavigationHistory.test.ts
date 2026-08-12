import { describe, expect, it } from "vitest";
import type { WorkspaceNavigationTarget } from "./hooks/useWorkspaceFiles";
import {
  latestRelatedNavigationOrigin,
  pushRelatedNavigationOrigin,
  RELATED_NAVIGATION_HISTORY_LIMIT,
  removeRelatedNavigationOrigin
} from "./relatedNavigationHistory";

describe("related navigation return history", () => {
  it("bounds successful origins and returns to the exact original target", () => {
    let history: WorkspaceNavigationTarget[] = [];
    for (let index = 0; index < RELATED_NAVIGATION_HISTORY_LIMIT + 3; index += 1) {
      history = pushRelatedNavigationOrigin(history, {
        projectId: "project:a",
        fileId: `file:${index}`,
        explanationId: `exp:${index}`,
        startLine: index + 1,
        endLine: index + 2
      });
    }
    expect(history).toHaveLength(RELATED_NAVIGATION_HISTORY_LIMIT);
    const origin = latestRelatedNavigationOrigin(history, "project:a");
    expect(origin).toEqual({
      projectId: "project:a",
      fileId: "file:22",
      explanationId: "exp:22",
      startLine: 23,
      endLine: 24
    });
    expect(
      latestRelatedNavigationOrigin(removeRelatedNavigationOrigin(history, origin!), "project:a")
    ).toMatchObject({ fileId: "file:21", explanationId: "exp:21" });
  });

  it("does not expose a previous project's return target", () => {
    const projectA = pushRelatedNavigationOrigin([], {
      projectId: "project:a",
      fileId: "file:a"
    });
    expect(latestRelatedNavigationOrigin(projectA, "project:b")).toBeUndefined();
    const projectB = pushRelatedNavigationOrigin(projectA, {
      projectId: "project:b",
      fileId: "file:b"
    });
    expect(latestRelatedNavigationOrigin(projectB, "project:a")).toBeUndefined();
    expect(latestRelatedNavigationOrigin(projectB, "project:b")?.fileId).toBe("file:b");
  });
});
