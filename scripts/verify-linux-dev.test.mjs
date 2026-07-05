import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GATES, parseVerifyArgs, runLinuxDevVerification } from "./verify-linux-dev.mjs";
import { DEBIAN_TAURI_PACKAGES } from "./linux-dev-doctor.mjs";

const baselineAptInstallCommand = `sudo apt-get install -y ${DEBIAN_TAURI_PACKAGES.join(" ")}`;

function passingDoctor() {
  return {
    platform: "linux",
    commandChecks: [],
    pkgConfigChecks: [],
    missingCommands: [],
    missingPkgConfig: [],
    missingAptPackages: [],
    recommendedAptInstallCommand: null,
    baselineAptInstallCommand,
    ok: true
  };
}

function failingDoctor() {
  const missingAptPackages = ["libwebkit2gtk-4.1-dev"];
  return {
    platform: "linux",
    commandChecks: [{ name: "rustc", ok: false, value: "not found" }],
    pkgConfigChecks: [
      { id: "webkit2gtk-4.1", apt: "libwebkit2gtk-4.1-dev", ok: false, value: "not found" }
    ],
    missingCommands: [{ name: "rustc", ok: false, value: "not found" }],
    missingPkgConfig: [
      { id: "webkit2gtk-4.1", apt: "libwebkit2gtk-4.1-dev", ok: false, value: "not found" }
    ],
    missingAptPackages,
    recommendedAptInstallCommand: `sudo apt-get install -y ${missingAptPackages.join(" ")}`,
    baselineAptInstallCommand,
    ok: false
  };
}

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

function succeedingExecutor() {
  const calls = [];
  const executor = (gate) => {
    calls.push(gate.script);
    return { status: 0 };
  };
  return { executor, calls };
}

function failingOnExecutor(failScript) {
  const calls = [];
  const executor = (gate) => {
    calls.push(gate.script);
    return { status: gate.script === failScript ? 1 : 0 };
  };
  return { executor, calls };
}

describe("parseVerifyArgs", () => {
  it("parses --skip-build and --json flags", () => {
    expect(parseVerifyArgs([])).toEqual({ skipBuild: false, json: false, output: null });
    expect(parseVerifyArgs(["--skip-build"])).toEqual({
      skipBuild: true,
      json: false,
      output: null
    });
    expect(parseVerifyArgs(["--json"])).toEqual({ skipBuild: false, json: true, output: null });
    expect(parseVerifyArgs(["--skip-build", "--json"])).toEqual({
      skipBuild: true,
      json: true,
      output: null
    });
  });

  it("parses --output <path> and leaves output null when absent or missing a value", () => {
    expect(parseVerifyArgs(["--output", "artifacts/verify-linux.json"])).toEqual({
      skipBuild: false,
      json: false,
      output: "artifacts/verify-linux.json"
    });
    expect(parseVerifyArgs(["--json", "--output", "out.json"])).toEqual({
      skipBuild: false,
      json: true,
      output: "out.json"
    });
    expect(parseVerifyArgs(["--skip-build", "--output", "out.json", "--json"])).toEqual({
      skipBuild: true,
      json: true,
      output: "out.json"
    });
    expect(parseVerifyArgs(["--output"])).toEqual({
      skipBuild: false,
      json: false,
      output: null
    });
    expect(parseVerifyArgs(["--output", "--json"])).toEqual({
      skipBuild: false,
      json: true,
      output: null
    });
  });
});

describe("runLinuxDevVerification", () => {
  it("fails fast without running gates when doctor report is not ok", () => {
    const { executor, calls } = succeedingExecutor();
    const stdout = silentStdout();

    const summary = runLinuxDevVerification({
      platform: "linux",
      args: [],
      doctorReport: failingDoctor(),
      executor,
      stdout
    });

    expect(summary.ok).toBe(false);
    expect(summary.gates).toEqual([]);
    expect(calls).toEqual([]);
    expect(summary.skipped).toEqual(GATES.map((gate) => gate.script));
    expect(summary.doctor.ok).toBe(false);
    expect(summary.doctor.recommendedAptInstallCommand).toContain("libwebkit2gtk-4.1-dev");
    expect(summary.doctor.baselineAptInstallCommand).toBe(baselineAptInstallCommand);
  });

  it("runs every gate in order and reports success when all pass", () => {
    const { executor, calls } = succeedingExecutor();
    const stdout = silentStdout();

    const summary = runLinuxDevVerification({
      platform: "linux",
      args: [],
      doctorReport: passingDoctor(),
      executor,
      stdout
    });

    expect(summary.ok).toBe(true);
    expect(calls).toEqual(GATES.map((gate) => gate.script));
    expect(summary.gates).toHaveLength(GATES.length);
    expect(summary.gates.every((gate) => gate.ok)).toBe(true);
    expect(summary.skipped).toEqual([]);
  });

  it("stops remaining gates after the first failure", () => {
    const { executor, calls } = failingOnExecutor("cargo:clippy");
    const stdout = silentStdout();

    const summary = runLinuxDevVerification({
      platform: "linux",
      args: [],
      doctorReport: passingDoctor(),
      executor,
      stdout
    });

    expect(summary.ok).toBe(false);
    expect(calls).toEqual(["cargo:check", "cargo:clippy"]);
    expect(summary.gates).toHaveLength(2);
    expect(summary.gates[0]).toMatchObject({ script: "cargo:check", ok: true });
    expect(summary.gates[1]).toMatchObject({ script: "cargo:clippy", ok: false, status: 1 });
    expect(summary.skipped).toEqual(["cargo:test", "test", "lint", "format:check", "build"]);
  });

  it("omits the build gate while running everything else when --skip-build is passed", () => {
    const { executor, calls } = succeedingExecutor();
    const stdout = silentStdout();

    const summary = runLinuxDevVerification({
      platform: "linux",
      args: ["--skip-build"],
      doctorReport: passingDoctor(),
      executor,
      stdout
    });

    expect(summary.ok).toBe(true);
    expect(calls).not.toContain("build");
    expect(summary.skipped).toContain("build");
    expect(summary.gates.map((gate) => gate.script)).toEqual(
      GATES.filter((gate) => gate.script !== "build").map((gate) => gate.script)
    );
    expect(summary.evidence.skipBuild).toBe(true);
    expect(summary.evidence.plannedGates.map((gate) => gate.script)).toEqual(
      GATES.filter((gate) => gate.script !== "build").map((gate) => gate.script)
    );
  });

  it("emits a JSON summary with doctor, gates, ok, and skipped fields", () => {
    const { executor } = succeedingExecutor();
    const stdout = silentStdout();

    const summary = runLinuxDevVerification({
      platform: "linux",
      args: ["--json"],
      doctorReport: passingDoctor(),
      executor,
      stdout
    });

    const parsed = JSON.parse(stdout.text());
    expect(parsed).toEqual(summary);
    expect(parsed).toHaveProperty("ok", true);
    expect(parsed).toHaveProperty("doctor");
    expect(parsed.doctor.ok).toBe(true);
    expect(Array.isArray(parsed.gates)).toBe(true);
    expect(parsed.gates).toHaveLength(GATES.length);
    expect(parsed.gates[0]).toHaveProperty("name", "cargo:check");
    expect(parsed.gates[0]).toHaveProperty("script", "cargo:check");
    expect(parsed.gates[0]).toHaveProperty("ok", true);
    expect(parsed.gates[0]).toHaveProperty("status", 0);
    expect(Array.isArray(parsed.skipped)).toBe(true);
    expect(parsed.skipped).toEqual([]);
    expect(parsed.evidence).toBeDefined();
    expect(parsed.evidence.platform).toBe("linux");
    expect(typeof parsed.evidence.generatedAt).toBe("string");
    expect(new Date(parsed.evidence.generatedAt).toISOString()).toBe(parsed.evidence.generatedAt);
    expect(parsed.evidence.nodeVersion).toBe(process.version);
    expect(parsed.evidence.skipBuild).toBe(false);
    expect(parsed.evidence.plannedGates.map((gate) => gate.script)).toEqual(
      GATES.map((gate) => gate.script)
    );
  });

  it("emits a JSON summary with skipped gates when doctor fails", () => {
    const { executor, calls } = succeedingExecutor();
    const stdout = silentStdout();

    const summary = runLinuxDevVerification({
      platform: "linux",
      args: ["--json"],
      doctorReport: failingDoctor(),
      executor,
      stdout
    });

    const parsed = JSON.parse(stdout.text());
    expect(parsed).toEqual(summary);
    expect(parsed.ok).toBe(false);
    expect(parsed.gates).toEqual([]);
    expect(parsed.skipped).toEqual(GATES.map((gate) => gate.script));
    expect(calls).toEqual([]);
    expect(parsed.evidence.skipBuild).toBe(false);
    expect(parsed.evidence.plannedGates.map((gate) => gate.script)).toEqual(
      GATES.map((gate) => gate.script)
    );
    expect(parsed.doctor.recommendedAptInstallCommand).toContain("libwebkit2gtk-4.1-dev");
    expect(parsed.doctor.baselineAptInstallCommand).toBe(baselineAptInstallCommand);
  });
});

describe("runLinuxDevVerification --output", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "verify-linux-output-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes the JSON summary to --output and stdout when --json is also passed", () => {
    const { executor } = succeedingExecutor();
    const stdout = silentStdout();
    const outputPath = join(tempDir, "verify-linux.json");

    const summary = runLinuxDevVerification({
      platform: "linux",
      args: ["--json", "--output", outputPath],
      doctorReport: passingDoctor(),
      executor,
      stdout
    });

    const printed = stdout.text();
    expect(printed).toContain('"ok"');
    expect(existsSync(outputPath)).toBe(true);
    const fileContent = readFileSync(outputPath, "utf8");
    expect(fileContent).toBe(printed);
    expect(JSON.parse(fileContent)).toEqual(summary);
    expect(JSON.parse(fileContent).ok).toBe(true);
  });

  it("writes the JSON summary to --output even when the doctor fails and --json is absent", () => {
    const { executor, calls } = succeedingExecutor();
    const stdout = silentStdout();
    const outputPath = join(tempDir, "nested", "verify-linux.json");

    const summary = runLinuxDevVerification({
      platform: "linux",
      args: ["--output", outputPath],
      doctorReport: failingDoctor(),
      executor,
      stdout
    });

    expect(summary.ok).toBe(false);
    expect(calls).toEqual([]);
    expect(stdout.text()).toContain("Verification failed");
    expect(stdout.text()).not.toContain('"ok"');
    expect(existsSync(outputPath)).toBe(true);
    const fileContent = readFileSync(outputPath, "utf8");
    expect(JSON.parse(fileContent)).toEqual(summary);
    expect(JSON.parse(fileContent).ok).toBe(false);
    expect(JSON.parse(fileContent).gates).toEqual([]);
    expect(JSON.parse(fileContent).skipped).toEqual(GATES.map((gate) => gate.script));
  });
});
