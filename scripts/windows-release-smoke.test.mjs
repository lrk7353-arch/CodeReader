import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  buildReleaseSmokeTemplate,
  DEFAULT_RELEASE_SMOKE_OUTPUT,
  DEFAULT_RELEASE_SMOKE_STATUS,
  parseSmokeArgs,
  runAutomatedReleaseChecks,
  runWindowsReleaseSmoke
} from "./windows-release-smoke.mjs";

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

function makeArtifactsDir(base) {
  const dir = join(base, "windows-x64");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

describe("parseSmokeArgs", () => {
  it("defaults output to null and help to false", () => {
    expect(parseSmokeArgs([])).toEqual({ output: null, help: false });
  });

  it("parses --output <path>", () => {
    expect(parseSmokeArgs(["--output", "artifacts/windows-evidence/release-smoke.json"])).toEqual({
      output: "artifacts/windows-evidence/release-smoke.json",
      help: false
    });
  });

  it("parses --help and -h", () => {
    expect(parseSmokeArgs(["--help"]).help).toBe(true);
    expect(parseSmokeArgs(["-h"]).help).toBe(true);
  });
});

describe("buildReleaseSmokeTemplate", () => {
  it("returns a manual_required template with the install checklist", () => {
    const template = buildReleaseSmokeTemplate({
      platform: "win32",
      cwd: "/repo",
      generatedAt: "2026-07-06T00:00:00.000Z"
    });

    expect(template).toEqual({
      generatedAt: "2026-07-06T00:00:00.000Z",
      platform: "win32",
      root: expect.any(String),
      cwd: "/repo",
      nodeVersion: process.version,
      recommendedCommand: "npm run release:windows",
      status: DEFAULT_RELEASE_SMOKE_STATUS,
      automated: { checks: [], allOk: false },
      checklist: {
        tauriDevLaunched: null,
        windowVisible: null,
        openFileWorks: null,
        openProjectWorks: null,
        modelSettingsOpen: null,
        upgradeOverInstall: null,
        uninstallKeepsUserData: null,
        notes: ""
      }
    });
  });

  it("does not pretend success", () => {
    const template = buildReleaseSmokeTemplate({ platform: "win32", cwd: "/repo" });
    expect(template.status).toBe("manual_required");
    expect(template).not.toHaveProperty("ok");
    expect(template).not.toHaveProperty("success");
    expect(template).not.toHaveProperty("passed");
  });
});

describe("runAutomatedReleaseChecks", () => {
  let tempDir;

  function setupArtifacts(entries) {
    const dir = makeArtifactsDir(tempDir);
    for (const entry of entries) {
      if (entry.binary) {
        writeFileSync(join(dir, entry.name), entry.binary);
      }
    }
    return dir;
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "release-smoke-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("fails when release-manifest.json is missing", () => {
    const dir = makeArtifactsDir(tempDir);
    const { checks, allOk } = runAutomatedReleaseChecks({ artifactsDir: dir });
    expect(allOk).toBe(false);
    expect(checks.some((c) => c.name.includes("exists") && !c.ok)).toBe(true);
  });

  it("verifies sha256 consistency between manifest and files", () => {
    const setup = Buffer.from("setup payload");
    const msi = Buffer.from("msi payload");
    const dir = makeArtifactsDir(tempDir);
    writeFileSync(join(dir, "setup.exe"), setup);
    writeFileSync(join(dir, "app.msi"), msi);
    writeFileSync(
      join(dir, "release-manifest.json"),
      JSON.stringify({
        product: "CodeReader",
        version: "0.11.0-beta.4",
        artifacts: [
          { name: "setup.exe", sha256: sha256(setup), sizeBytes: setup.length },
          { name: "app.msi", sha256: sha256(msi), sizeBytes: msi.length }
        ]
      })
    );
    writeFileSync(join(dir, "signing-manifest.json"), JSON.stringify({}));
    writeFileSync(join(dir, "SHA256SUMS.txt"), "");

    const { checks, allOk } = runAutomatedReleaseChecks({ artifactsDir: dir });
    expect(allOk).toBe(true);
    expect(checks.find((c) => c.name.includes("setup.exe") && c.name.includes("sha256")).ok).toBe(
      true
    );
    expect(checks.find((c) => c.name.includes("app.msi") && c.name.includes("sha256")).ok).toBe(
      true
    );
  });

  it("fails when sha256 does not match", () => {
    const setup = Buffer.from("setup payload");
    const dir = makeArtifactsDir(tempDir);
    writeFileSync(join(dir, "setup.exe"), setup);
    writeFileSync(
      join(dir, "release-manifest.json"),
      JSON.stringify({
        artifacts: [{ name: "setup.exe", sha256: "deadbeef", sizeBytes: 0 }]
      })
    );

    const { allOk } = runAutomatedReleaseChecks({ artifactsDir: dir });
    expect(allOk).toBe(false);
  });

  it("records signing status from signing-manifest", () => {
    const setup = Buffer.from("setup payload");
    const dir = makeArtifactsDir(tempDir);
    writeFileSync(join(dir, "setup.exe"), setup);
    writeFileSync(
      join(dir, "release-manifest.json"),
      JSON.stringify({
        artifacts: [{ name: "setup.exe", sha256: sha256(setup), sizeBytes: setup.length }]
      })
    );
    writeFileSync(
      join(dir, "signing-manifest.json"),
      JSON.stringify({
        configuration: { enabled: false, required: false },
        artifacts: [{ path: "setup.exe", signed: false, signatureStatus: "NotSigned" }]
      })
    );

    const { checks } = runAutomatedReleaseChecks({ artifactsDir: dir });
    const signingCheck = checks.find((c) => c.name.includes("signing status"));
    expect(signingCheck).toBeTruthy();
    expect(signingCheck.ok).toBe(true);
    expect(signingCheck.detail).toContain("signed=false");
    expect(signingCheck.detail).toContain("NotSigned");
  });
});

describe("runWindowsReleaseSmoke", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "release-smoke-run-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes the template to the default output path relative to cwd", () => {
    const stdout = silentStdout();
    const { output, template } = runWindowsReleaseSmoke({
      cwd: tempDir,
      args: [],
      stdout,
      generatedAt: "2026-07-06T00:00:00.000Z"
    });

    const expectedPath = join(tempDir, DEFAULT_RELEASE_SMOKE_OUTPUT);
    expect(output).toBe(expectedPath);
    expect(template.status).toBe(DEFAULT_RELEASE_SMOKE_STATUS);
    expect(stdout.text()).toContain("manual_required");
    expect(stdout.text()).toContain("Automated checks:");
  });

  it("writes to --output and creates nested parent directories", () => {
    const stdout = silentStdout();
    const outputPath = join(tempDir, "nested", "dir", "smoke.json");

    const { output } = runWindowsReleaseSmoke({
      cwd: tempDir,
      args: ["--output", outputPath],
      stdout,
      generatedAt: "2026-07-06T12:00:00.000Z"
    });

    expect(output).toBe(outputPath);
  });
});
