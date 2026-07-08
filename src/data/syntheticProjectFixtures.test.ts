import { describe, expect, it } from "vitest";
import {
  mediumProjectFixture,
  stressProjectFixture,
  syntheticFixtures
} from "./syntheticProjectFixtures";

describe("syntheticProjectFixtures", () => {
  it("medium fixture has ~120 files across multiple languages", () => {
    expect(mediumProjectFixture.files.length).toBe(120);
    const languages = new Set(mediumProjectFixture.files.map((f) => f.language));
    expect(languages.has("typescript")).toBe(true);
    expect(languages.has("python")).toBe(true);
    expect(languages.has("sql")).toBe(true);
    expect(languages.has("markdown")).toBe(true);
    expect(languages.has("json")).toBe(true);
    expect(mediumProjectFixture.expectedTruncated).toBe(false);
  });

  it("stress fixture includes a 3000-line file", () => {
    const longFile = stressProjectFixture.files.find((f) => f.lineCount >= 3000);
    expect(longFile).toBeTruthy();
    expect(longFile?.canPreview).toBe(true);
  });

  it("stress fixture includes a binary and a non-UTF-8 file with skip reasons", () => {
    const binary = stressProjectFixture.files.find((f) => f.skipReason === "binary");
    const invalidUtf8 = stressProjectFixture.files.find((f) => f.skipReason === "invalid_utf8");
    expect(binary).toBeTruthy();
    expect(binary?.canPreview).toBe(false);
    expect(invalidUtf8).toBeTruthy();
    expect(invalidUtf8?.canPreview).toBe(false);
    expect(stressProjectFixture.expectedSkipReasons.binary).toBe(1);
    expect(stressProjectFixture.expectedSkipReasons.invalid_utf8).toBe(1);
  });

  it("stress fixture includes a deep directory tree (8+ levels)", () => {
    const deepFiles = stressProjectFixture.files.filter((f) => f.path.startsWith("deep/"));
    expect(deepFiles.length).toBe(8);
    const deepest = deepFiles[deepFiles.length - 1];
    expect(deepest.path.split("/").length).toBeGreaterThanOrEqual(10);
  });

  it("exports both fixtures under syntheticFixtures", () => {
    expect(syntheticFixtures.medium).toBe(mediumProjectFixture);
    expect(syntheticFixtures.stress).toBe(stressProjectFixture);
  });

  it("fixtures do not contain real third-party source paths", () => {
    // Synthetic fixtures use generic module-/file-/pkg- prefixes, not real
    // project names. This is a redaction guard.
    for (const file of [...mediumProjectFixture.files, ...stressProjectFixture.files]) {
      expect(file.path).not.toMatch(/node_modules|vendor|third[_-]?party/i);
    }
  });
});
