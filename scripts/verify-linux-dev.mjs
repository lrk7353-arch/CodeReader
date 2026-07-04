import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildLinuxDevDoctorReport, printLinuxDevDoctorReport } from "./linux-dev-doctor.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const GATES = Object.freeze([
  { name: "cargo:check", script: "cargo:check" },
  { name: "cargo:clippy", script: "cargo:clippy" },
  { name: "cargo:test", script: "cargo:test" },
  { name: "test", script: "test" },
  { name: "lint", script: "lint" },
  { name: "format:check", script: "format:check" },
  { name: "build", script: "build" }
]);

export function parseVerifyArgs(argv) {
  return {
    skipBuild: argv.includes("--skip-build"),
    json: argv.includes("--json")
  };
}

function npmCommand() {
  const execPath = process.env.npm_execpath;
  if (execPath) {
    return { command: process.execPath, args: [execPath] };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: []
  };
}

export function createDefaultExecutor({ cwd, json }) {
  return (gate) => {
    const { command, args: baseArgs } = npmCommand();
    const result = spawnSync(command, [...baseArgs, "run", gate.script], {
      cwd,
      stdio: json ? "ignore" : "inherit",
      shell: false
    });
    return { status: result.status ?? 1 };
  };
}

function toWslPath(value) {
  const normalized = value.replaceAll("/", "\\");
  const match = normalized.match(/^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)\\(.+)$/i);
  if (!match) {
    return null;
  }
  return `/${match[2].replaceAll("\\", "/")}`;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function runLinuxDevVerification({
  platform = process.platform,
  args = [],
  doctorReport,
  executor,
  stdout = process.stdout
} = {}) {
  const { skipBuild, json } = parseVerifyArgs(args);

  const report = doctorReport ?? buildLinuxDevDoctorReport({ platform });

  const plannedGates = skipBuild ? GATES.filter((gate) => gate.script !== "build") : [...GATES];
  const skipped = skipBuild ? ["build"] : [];
  const gateResults = [];

  if (!report.ok) {
    for (const gate of plannedGates) {
      skipped.push(gate.script);
    }
    if (!json) {
      printLinuxDevDoctorReport(report);
      stdout.write("\nVerification failed: Linux dev doctor prerequisites not met.\n");
    }
    const summary = { ok: false, doctor: report, gates: gateResults, skipped };
    if (json) {
      stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    }
    return summary;
  }

  if (!json) {
    stdout.write(
      `Linux dev doctor passed (${report.platform}). Running ${plannedGates.length} gates.\n`
    );
  }

  const effectiveExecutor = executor ?? createDefaultExecutor({ cwd: root, json });

  let failed = false;
  for (const gate of plannedGates) {
    if (!json) {
      stdout.write(`\n=== ${gate.name} ===\n`);
    }
    const result = effectiveExecutor(gate);
    const entry = {
      name: gate.name,
      script: gate.script,
      ok: result.status === 0,
      status: result.status
    };
    gateResults.push(entry);
    if (result.status !== 0) {
      failed = true;
      break;
    }
  }

  if (failed) {
    for (let i = gateResults.length; i < plannedGates.length; i += 1) {
      skipped.push(plannedGates[i].script);
    }
  }

  const summary = { ok: !failed, doctor: report, gates: gateResults, skipped };

  if (json) {
    stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    stdout.write(`\n${summary.ok ? "All gates passed." : "Verification failed."}\n`);
  }

  return summary;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const wslRoot =
    process.env.CODEREADER_WSL_ROOT ?? (process.platform === "win32" ? toWslPath(root) : null);
  if (wslRoot) {
    const forwardedArgs = process.argv.slice(2).map(shellQuote).join(" ");
    const command = [
      '[ -f "$HOME/.profile" ] && . "$HOME/.profile"',
      'export PATH="$HOME/.local/bin:$PATH"',
      `cd ${shellQuote(wslRoot)}`,
      `node scripts/verify-linux-dev.mjs ${forwardedArgs}`
    ].join("; ");
    const result = spawnSync("wsl", ["bash", "-lc", command], {
      stdio: "inherit",
      shell: false
    });
    process.exit(result.status ?? 1);
  }

  const summary = runLinuxDevVerification({ args: process.argv.slice(2) });
  process.exit(summary.ok ? 0 : 1);
}
