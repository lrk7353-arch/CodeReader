import { describe, expect, it } from "vitest";
import type { CodeFile } from "../../types/explanation";
import { canRefreshLoadedFile } from "./workspaceRefreshController";

describe("canRefreshLoadedFile", () => {
  it("allows a loaded local file in the desktop runtime", () => {
    expect(
      canRefreshLoadedFile({
        file: codeFile({ source: "local", isLoaded: true }),
        isDesktop: true,
        refreshInFlight: false
      })
    ).toBe(true);
  });

  it("blocks browser preview refreshes", () => {
    expect(
      canRefreshLoadedFile({
        file: codeFile({ source: "local", isLoaded: true }),
        isDesktop: false,
        refreshInFlight: false
      })
    ).toBe(false);
  });

  it("blocks sample and unloaded project placeholder files", () => {
    expect(
      canRefreshLoadedFile({
        file: codeFile({ source: "sample", isLoaded: true }),
        isDesktop: true,
        refreshInFlight: false
      })
    ).toBe(false);
    expect(
      canRefreshLoadedFile({
        file: codeFile({ source: "local", isLoaded: false }),
        isDesktop: true,
        refreshInFlight: false
      })
    ).toBe(false);
  });

  it("blocks concurrent refreshes", () => {
    expect(
      canRefreshLoadedFile({
        file: codeFile({ source: "local", isLoaded: true }),
        isDesktop: true,
        refreshInFlight: true
      })
    ).toBe(false);
  });
});

function codeFile(overrides: Partial<CodeFile>): CodeFile {
  return {
    id: "file:test",
    name: "model.py",
    path: "/tmp/model.py",
    language: "python",
    code: "",
    explanations: [],
    codeNodes: [],
    source: "sample",
    isLoaded: true,
    ...overrides
  };
}
