import { describe, expect, it } from "vitest";
import type { Explanation } from "../types/explanation";
import type { PersistenceStatus } from "./hooks/useWorkspaceFiles";
import { getAppCopy, getCopyLocale } from "./copy";

describe("app copy layer", () => {
  it("defaults to the Chinese locale used by the shipped UI", () => {
    expect(getCopyLocale()).toBe("zh-CN");

    const copy = getAppCopy();
    expect(copy.brand.title).toBe("CodeReader");
    expect(copy.brand.stageBadge).toBe("\u5185\u6d4b \u00b7 Beta 3");
    expect(copy.actions.sample).toBe("\u4f53\u9a8c\u793a\u4f8b");
  });

  it("reserves an English UI entry with translated strings", () => {
    const copy = getAppCopy("en");

    expect(copy.brand.title).toBe("CodeReader");
    expect(copy.brand.tagline).toBe("Standalone desktop code-reading IDE");
    expect(copy.brand.stageBadge).toBe("Internal \u00b7 Beta 3");
    expect(copy.actions.openProject).toBe("Open project");
    expect(copy.model.unconfigured).toBe("Model not configured");
  });

  it("covers every persistence and explanation status in both locales", () => {
    const persistenceStatuses: PersistenceStatus[] = ["preview", "initializing", "ready", "error"];
    const explanationStatuses: Explanation["status"][] = [
      "valid",
      "stale",
      "invalid",
      "new_unexplained",
      "deleted",
      "transient"
    ];

    for (const locale of ["zh-CN", "en"] as const) {
      const copy = getAppCopy(locale);
      for (const status of persistenceStatuses) {
        expect(copy.persistenceLabel[status]).toBeTruthy();
        expect(copy.persistenceTooltip[status]).toBeTruthy();
      }
      for (const status of explanationStatuses) {
        expect(copy.explanationStatus[status]).toBeTruthy();
      }
    }
  });
});
