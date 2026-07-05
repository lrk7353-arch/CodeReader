import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDesktopSmokeTemplate,
  DEFAULT_DESKTOP_SMOKE_OUTPUT,
  DEFAULT_SMOKE_STATUS,
  parseSmokeArgs,
  runLinuxDesktopSmoke,
  RECOMMENDED_COMMAND
} from "./linux-desktop-smoke.mjs";

function silentStdout() {
  const chunks = [];
  return {
    write: (chunk) => {
      chunks.push(String(chunk));
      return true;
    },
    text: () => chunks.join("")
  };
}

describe("parseSmokeArgs", () => {
  it("defaults output to null and help to false", () => {
    expect(parseSmokeArgs([])).toEqual({ output: null, help: false });
  });

  it("parses --output <path>", () => {
    expect(parseSmokeArgs(["--output", "artifacts/linux-evidence/desktop-smoke.json"])).toEqual({
      output: "artifacts/linux-evidence/desktop-smoke.json",
      help: false
    });
  });

  it("leaves output null when --output has no value or is followed by another flag", () => {
    expect(parseSmokeArgs(["--output"])).toEqual({ output: null, help: false });
    expect(parseSmokeArgs(["--output", "--help"])).toEqual({ output: null, help: true });
  });

  it("parses --help and -h", () => {
    expect(parseSmokeArgs(["--help"]).help).toBe(true);
    expect(parseSmokeArgs(["-h"]).help).toBe(true);
  });
});

describe("buildDesktopSmokeTemplate", () => {
  it("returns a manual_required template with the recommended command and checklist", () => {
    const template = buildDesktopSmokeTemplate({
      platform: "linux",
      cwd: "/repo",
      generatedAt: "2026-07-05T00:00:00.000Z"
    });

    expect(template).toEqual({
      generatedAt: "2026-07-05T00:00:00.000Z",
      platform: "linux",
      root: expect.any(String),
      cwd: "/repo",
      nodeVersion: process.version,
      recommendedCommand: RECOMMENDED_COMMAND,
      status: DEFAULT_SMOKE_STATUS,
      checklist: {
        tauriDevLaunched: null,
        windowVisible: null,
        openFileWorks: null,
        openProjectWorks: null,
        modelSettingsOpen: null,
        notes: ""
      }
    });
  });

  it("uses a valid ISO timestamp by default", () => {
    const template = buildDesktopSmokeTemplate({ platform: "linux", cwd: "/repo" });
    expect(typeof template.generatedAt).toBe("string");
    expect(new Date(template.generatedAt).toISOString()).toBe(template.generatedAt);
  });

  it("does not pretend success", () => {
    const template = buildDesktopSmokeTemplate({ platform: "linux", cwd: "/repo" });
    expect(template.status).toBe("manual_required");
    expect(template).not.toHaveProperty("ok");
    expect(template).not.toHaveProperty("success");
    expect(template).not.toHaveProperty("passed");
    for (const value of Object.values(template.checklist)) {
      expect(value === null || typeof value === "string").toBe(true);
    }
  });
});

describe("runLinuxDesktopSmoke", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "desktop-smoke-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes the template to the default output path relative to cwd", () => {
    const stdout = silentStdout();
    const { output, template } = runLinuxDesktopSmoke({
      platform: "linux",
      cwd: tempDir,
      args: [],
      stdout,
      generatedAt: "2026-07-05T00:00:00.000Z"
    });

    const expectedPath = join(tempDir, DEFAULT_DESKTOP_SMOKE_OUTPUT);
    expect(output).toBe(expectedPath);
    expect(existsSync(expectedPath)).toBe(true);
    const fileContent = readFileSync(expectedPath, "utf8");
    expect(JSON.parse(fileContent)).toEqual(template);
    expect(template.status).toBe(DEFAULT_SMOKE_STATUS);
    expect(template.platform).toBe("linux");
    expect(template.cwd).toBe(tempDir);
    expect(template.recommendedCommand).toBe("npm run tauri dev");
    expect(template.checklist.tauriDevLaunched).toBeNull();
    expect(stdout.text()).toContain("manual_required");
    expect(stdout.text()).toContain("npm run tauri dev");
  });

  it("writes to --output and creates nested parent directories", () => {
    const stdout = silentStdout();
    const outputPath = join(tempDir, "nested", "dir", "smoke.json");

    const { output, template } = runLinuxDesktopSmoke({
      platform: "linux",
      cwd: tempDir,
      args: ["--output", outputPath],
      stdout,
      generatedAt: "2026-07-05T00:00:00.000Z"
    });

    expect(output).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(outputPath, "utf8"));
    expect(parsed).toEqual(template);
    expect(parsed.status).toBe(DEFAULT_SMOKE_STATUS);
    expect(parsed.checklist.notes).toBe("");
    expect(parsed.generatedAt).toBe("2026-07-05T00:00:00.000Z");
  });

  it("records nodeVersion and a non-empty root in the written file", () => {
    const stdout = silentStdout();
    const { output } = runLinuxDesktopSmoke({
      platform: "linux",
      cwd: tempDir,
      args: ["--output", join(tempDir, "smoke.json")],
      stdout,
      generatedAt: "2026-07-05T12:00:00.000Z"
    });

    const parsed = JSON.parse(readFileSync(output, "utf8"));
    expect(parsed.nodeVersion).toBe(process.version);
    expect(typeof parsed.root).toBe("string");
    expect(parsed.root.length).toBeGreaterThan(0);
  });
});
