import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REQUIRED = [
  "native-picker-open-project",
  "explanation-generation",
  "restart-reauthorize-restore",
  "legacy-0.10-upgrade",
  "legacy-0.11-upgrade",
  "uninstall-data-policy",
  "keyboard-focus-roundtrip",
  "reduced-motion",
  "long-content",
  "zoom-200-contrast"
];
const REINSTALL_PROBE = `
import subprocess, sys, time
executable, driver, wrong_project, project = sys.argv[1:]
app = subprocess.Popen([executable], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    subprocess.run(
        ["python3", driver, "--verify-restore", wrong_project, project],
        check=True,
    )
finally:
    app.terminate()
    try:
        app.wait(timeout=5)
    except subprocess.TimeoutExpired:
        app.kill()
        app.wait()
`;

function fail(message) {
  throw new Error(message);
}

function args(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--") || argv[i + 1] === undefined) fail("Invalid arguments.");
    values[argv[i].slice(2)] = argv[i + 1];
  }
  return values;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", shell: false, ...options });
  if (result.status !== 0) fail(`${command} failed with ${result.status ?? "unknown"}.`);
}

function query(database, sql) {
  const result = spawnSync("sqlite3", [database, sql], { encoding: "utf8", shell: false });
  if (result.status !== 0) fail(result.stderr || "SQLite journey probe failed.");
  return result.stdout.trim().split("\n");
}

export function buildJourneyFromPhases({
  tag,
  sha,
  arch,
  phases,
  observedAt = new Date().toISOString()
}) {
  if (!/^v1\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?$/.test(tag)) fail("Invalid tag.");
  if (!/^[0-9a-f]{40}$/i.test(sha)) fail("Invalid SHA.");
  if (!["x64", "arm64"].includes(arch) || process.arch !== arch) fail("Not a native runner.");
  for (const name of REQUIRED) {
    const phase = phases?.[name];
    if (phase?.status !== "pass" || typeof phase.probe !== "string" || !phase.probe) {
      fail(`Missing independent passing probe: ${name}.`);
    }
  }
  return {
    schemaVersion: 1,
    releaseTag: tag,
    commitSha: sha.toLowerCase(),
    platform: "linux",
    arch,
    observedAt,
    status: "pass",
    windowsAuthenticodeSigned: null,
    checks: REQUIRED.map((name) => ({ name, status: phases[name].status }))
  };
}

export function runLinuxJourney(argv = process.argv.slice(2)) {
  if (process.platform !== "linux") fail("Linux journey requires Linux.");
  const value = args(argv);
  if (value["finalize-uninstall"]) {
    const profile = resolve(value["finalize-uninstall"]);
    const output = resolve(value.output ?? fail("Missing --output"));
    const executable = resolve(value.executable ?? fail("Missing --executable"));
    const driver = resolve("scripts/native-journey-ui-linux.py");
    const env = {
      ...process.env,
      XDG_CONFIG_HOME: resolve(profile, "config"),
      XDG_DATA_HOME: resolve(profile, "data"),
      XDG_CACHE_HOME: resolve(profile, "cache"),
      GTK_A11Y: "always",
      APPIMAGE_EXTRACT_AND_RUN: "1"
    };
    run(
      "dbus-run-session",
      [
        "--",
        "xvfb-run",
        "-a",
        "python3",
        "-c",
        REINSTALL_PROBE,
        executable,
        driver,
        resolve(value["wrong-project"] ?? fail("Missing --wrong-project")),
        resolve(value.project ?? fail("Missing --project"))
      ],
      { env }
    );
    const database = resolve(profile, "data/com.codereader.desktop/codereader.sqlite");
    const restored = query(
      database,
      "PRAGMA integrity_check; SELECT count(*) FROM projects; SELECT count(*) FROM explanation_nodes; SELECT count(*) FROM user_reading_states;"
    );
    if (restored[0] !== "ok" || restored.slice(1).some((value) => Number(value) < 1)) {
      fail("Reinstalled application did not restore project, explanation, and cognition state.");
    }
    const phaseFile = resolve(profile, "journey-phases.json");
    const phases = JSON.parse(readFileSync(phaseFile, "utf8"));
    phases["uninstall-data-policy"] = {
      status: "pass",
      probe:
        "reinstall rejected wrong-project context, then reauthorized original project and exposed restored explanation/database state"
    };
    writeFileSync(phaseFile, `${JSON.stringify(phases, null, 2)}\n`);
    const evidence = buildJourneyFromPhases({
      tag: value.tag,
      sha: value.sha,
      arch: value.arch,
      phases
    });
    writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
    return evidence;
  }
  const executable = resolve(value.executable ?? fail("Missing --executable"));
  const project = resolve(value.project ?? fail("Missing --project"));
  const output = resolve(value.output ?? fail("Missing --output"));
  const appData = resolve(value["app-data"] ?? fail("Missing --app-data"));
  const driver = resolve("scripts/native-journey-ui-linux.py");
  const stub = resolve("scripts/native-journey-model-stub.mjs");

  // Isolation is mandatory: the runner may inspect only this disposable profile.
  mkdirSync(appData, { recursive: true });
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: resolve(appData, "config"),
    XDG_DATA_HOME: resolve(appData, "data"),
    XDG_CACHE_HOME: resolve(appData, "cache"),
    GTK_A11Y: "always",
    APPIMAGE_EXTRACT_AND_RUN: "1"
  };
  run("gsettings", ["set", "org.gnome.desktop.interface", "enable-animations", "false"], { env });
  env.CODEREADER_JOURNEY_FIXTURE_010 = resolve(
    value["fixture-010"] ?? fail("Missing --fixture-010")
  );
  env.CODEREADER_JOURNEY_FIXTURE_011 = resolve(
    value["fixture-011"] ?? fail("Missing --fixture-011")
  );
  env.CODEREADER_JOURNEY_FIXTURE_011_CURRENT = resolve(
    value["fixture-011-current"] ?? fail("Missing --fixture-011-current")
  );
  env.CODEREADER_JOURNEY_WRONG_PROJECT = resolve(
    value["wrong-project"] ?? fail("Missing --wrong-project")
  );
  run("bash", ["scripts/native-journey-linux-session.sh", executable, project, driver, stub], {
    env
  });

  // Every phase is emitted by its own probe. Merely reaching the end of the
  // session cannot manufacture a passing record.
  const phaseFile = resolve(appData, "journey-phases.json");
  const phases = JSON.parse(readFileSync(phaseFile, "utf8"));
  for (const name of REQUIRED.filter((name) => name !== "uninstall-data-policy")) {
    if (phases[name]?.status !== "pass") fail(`Missing real phase: ${name}`);
  }
  const provisional = {
    ...phases,
    "uninstall-data-policy": { status: "pending", probe: "reinstall not run" }
  };
  const evidence = {
    schemaVersion: 1,
    releaseTag: value.tag,
    commitSha: value.sha.toLowerCase(),
    platform: "linux",
    arch: value.arch,
    observedAt: new Date().toISOString(),
    status: "manual_required",
    windowsAuthenticodeSigned: null,
    checks: REQUIRED.map((name) => ({ name, status: provisional[name].status }))
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(resolve(appData, "uninstall-probe-ready"), "ready\n");
  return evidence;
}

if (process.argv[1]?.endsWith("native-journey-linux.mjs")) {
  try {
    runLinuxJourney();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
