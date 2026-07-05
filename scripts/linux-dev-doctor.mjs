import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEBIAN_TAURI_PACKAGES = Object.freeze([
  "build-essential",
  "curl",
  "wget",
  "file",
  "pkg-config",
  "libwebkit2gtk-4.1-dev",
  "libxdo-dev",
  "libssl-dev",
  "libayatana-appindicator3-dev",
  "librsvg2-dev",
  "patchelf"
]);

export const REQUIRED_COMMANDS = Object.freeze([
  {
    name: "node",
    args: ["--version"],
    hint: "Install Node.js 22.x or newer LTS.",
    minimumMajor: 22
  },
  { name: "npm", args: ["--version"], hint: "Install npm with Node.js 22.x or newer LTS." },
  { name: "git", args: ["--version"], hint: "Install git.", apt: "git" },
  { name: "rustc", args: ["--version"], hint: "Install Rust stable with rustup." },
  { name: "cargo", args: ["--version"], hint: "Install Rust stable with rustup." },
  {
    name: "pkg-config",
    args: ["--version"],
    hint: "Install pkg-config and Tauri Linux development packages.",
    apt: "pkg-config"
  },
  { name: "gcc", args: ["--version"], hint: "Install build-essential.", apt: "build-essential" }
]);

export const REQUIRED_PKG_CONFIG = Object.freeze([
  {
    id: "webkit2gtk-4.1",
    apt: "libwebkit2gtk-4.1-dev",
    hint: "Tauri webview runtime development headers"
  },
  {
    id: "javascriptcoregtk-4.1",
    apt: "libwebkit2gtk-4.1-dev",
    hint: "JavaScriptCore headers pulled by WebKitGTK"
  },
  { id: "xdo", apt: "libxdo-dev", hint: "window activation helpers" },
  {
    id: "ayatana-appindicator3-0.1",
    apt: "libayatana-appindicator3-dev",
    hint: "system tray and app indicator support"
  },
  { id: "librsvg-2.0", apt: "librsvg2-dev", hint: "icon and SVG handling" },
  { id: "openssl", apt: "libssl-dev", hint: "TLS/native build integration" }
]);

function firstLine(value) {
  return String(value ?? "")
    .trim()
    .split(/\r?\n/, 1)[0];
}

function runCheck(executor, command, args) {
  const result = executor(command, args);
  const stdout = firstLine(result.stdout);
  const stderr = firstLine(result.stderr);
  return {
    ok: result.status === 0,
    value: stdout || stderr || (result.status === 0 ? "ok" : "not found")
  };
}

function parseMajorVersion(value) {
  const match = String(value ?? "").match(/(\d+)\./);
  return match ? Number(match[1]) : null;
}

function runCommandCheck(executor, check) {
  const result = runCheck(executor, check.name, check.args);
  if (result.ok && check.minimumMajor !== undefined) {
    const major = parseMajorVersion(result.value);
    if (major !== null && major < check.minimumMajor) {
      return {
        ...check,
        ...result,
        ok: false,
        hint: `Install Node.js ${check.minimumMajor}.x or newer LTS (detected ${major}.x).`
      };
    }
  }
  return { ...check, ...result };
}

export function createSpawnExecutor() {
  return (command, args) =>
    spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
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

export function buildLinuxDevDoctorReport({
  platform = process.platform,
  executor = createSpawnExecutor()
} = {}) {
  const commandChecks = REQUIRED_COMMANDS.map((check) => runCommandCheck(executor, check));

  const hasPkgConfig = commandChecks.some((check) => check.name === "pkg-config" && check.ok);
  const pkgConfigChecks =
    platform === "linux" && hasPkgConfig
      ? REQUIRED_PKG_CONFIG.map((check) => {
          const result = runCheck(executor, "pkg-config", ["--exists", check.id]);
          return { ...check, ...result };
        })
      : REQUIRED_PKG_CONFIG.map((check) => ({
          ...check,
          ok: platform !== "linux",
          value: platform === "linux" ? "pkg-config unavailable" : "skipped on non-Linux"
        }));

  const missingCommands = commandChecks.filter((check) => !check.ok);
  const missingPkgConfig = pkgConfigChecks.filter((check) => !check.ok);
  const missingAptPackages = [
    ...new Set([...missingCommands, ...missingPkgConfig].map((check) => check.apt).filter(Boolean))
  ];
  const recommendedAptInstallCommand =
    missingAptPackages.length > 0
      ? `sudo apt-get install -y ${missingAptPackages.join(" ")}`
      : null;
  const baselineAptInstallCommand = `sudo apt-get install -y ${DEBIAN_TAURI_PACKAGES.join(" ")}`;

  return {
    platform,
    commandChecks,
    pkgConfigChecks,
    missingCommands,
    missingPkgConfig,
    missingAptPackages,
    recommendedAptInstallCommand,
    baselineAptInstallCommand,
    ok: missingCommands.length === 0 && missingPkgConfig.length === 0
  };
}

function printTable(title, rows, labelField = "name") {
  console.log(`\n${title}`);
  for (const row of rows) {
    const status = row.ok ? "ok" : "missing";
    const label = row[labelField];
    console.log(`${String(label).padEnd(28)} ${status.padEnd(8)} ${row.value}`);
  }
}

export function printLinuxDevDoctorReport(report) {
  console.log(`CodeReader Linux/Debian developer doctor (${report.platform})`);
  printTable("Commands", report.commandChecks);
  printTable("Tauri pkg-config libraries", report.pkgConfigChecks, "id");

  if (report.recommendedAptInstallCommand) {
    console.log("\nSuggested Debian/Ubuntu packages:");
    console.log(report.recommendedAptInstallCommand);
  } else if (report.platform === "linux") {
    console.log("\nTauri Linux system dependencies are available.");
  }

  if (report.ok) {
    console.log("\nLinux development prerequisites look ready.");
  } else {
    console.log("\nLinux development prerequisites are incomplete.");
  }
}

const isMain = process.argv[1]?.endsWith("linux-dev-doctor.mjs");

if (isMain) {
  const wslRoot =
    process.env.CODEREADER_WSL_ROOT ?? (process.platform === "win32" ? toWslPath(root) : null);
  if (wslRoot) {
    const forwardedArgs = process.argv.slice(2).map(shellQuote).join(" ");
    const command = [
      '[ -f "$HOME/.profile" ] && . "$HOME/.profile"',
      'export PATH="$HOME/.local/bin:$PATH"',
      `cd ${shellQuote(wslRoot)}`,
      `node scripts/linux-dev-doctor.mjs ${forwardedArgs}`
    ].join("; ");
    const result = spawnSync("wsl", ["bash", "-lc", command], {
      stdio: "inherit",
      shell: false
    });
    process.exit(result.status ?? 1);
  }

  const json = process.argv.includes("--json");
  const report = buildLinuxDevDoctorReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printLinuxDevDoctorReport(report);
  }
  process.exit(report.ok ? 0 : 1);
}
