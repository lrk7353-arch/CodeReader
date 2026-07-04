import { describe, expect, it } from "vitest";
import { GATES, parseVerifyArgs, runLinuxDevVerification } from "./verify-linux-dev.mjs";

function passingDoctor() {
  return {
    platform: "linux",
    commandChecks: [],
    pkgConfigChecks: [],
    missingCommands: [],
    missingPkgConfig: [],
    missingAptPackages: [],
    ok: true
  };
}

function failingDoctor() {
  return {
    platform: "linux",
    commandChecks: [{ name: "rustc", ok: false, value: "not found" }],
    pkgConfigChecks: [],
    missingCommands: [{ name: "rustc", ok: false, value: "not found" }],
    missingPkgConfig: [],
    missingAptPackages: [],
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
    expect(parseVerifyArgs([])).toEqual({ skipBuild: false, json: false });
    expect(parseVerifyArgs(["--skip-build"])).toEqual({ skipBuild: true, json: false });
    expect(parseVerifyArgs(["--json"])).toEqual({ skipBuild: false, json: true });
    expect(parseVerifyArgs(["--skip-build", "--json"])).toEqual({ skipBuild: true, json: true });
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
  });
});
