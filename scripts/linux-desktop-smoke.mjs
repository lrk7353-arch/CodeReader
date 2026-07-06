import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_DESKTOP_SMOKE_OUTPUT = "artifacts/linux-evidence/desktop-smoke.json";
export const RECOMMENDED_COMMAND = "npm run tauri dev";
export const DEFAULT_SMOKE_STATUS = "manual_required";

export function parseSmokeArgs(argv) {
  const result = { output: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result.output = next;
        i += 1;
      }
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }
  return result;
}

export function buildDesktopSmokeTemplate({
  platform = process.platform,
  cwd = process.cwd(),
  generatedAt
} = {}) {
  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    platform,
    root,
    cwd,
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
  };
}

export function runLinuxDesktopSmoke({
  platform = process.platform,
  cwd = process.cwd(),
  args = [],
  stdout = process.stdout,
  generatedAt
} = {}) {
  const { output } = parseSmokeArgs(args);
  const outputPath = output ?? DEFAULT_DESKTOP_SMOKE_OUTPUT;
  const targetPath = resolve(cwd, outputPath);
  const template = buildDesktopSmokeTemplate({ platform, cwd, generatedAt });
  const jsonText = `${JSON.stringify(template, null, 2)}\n`;
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, jsonText);
  stdout.write(`Wrote Linux desktop smoke evidence template to ${targetPath}\n`);
  stdout.write(`Recommended manual command: ${template.recommendedCommand}\n`);
  stdout.write(`Status: ${template.status} (fill in the checklist after manual observation).\n`);
  return { output: targetPath, template };
}

function printHelp() {
  console.log(`Usage: node scripts/linux-desktop-smoke.mjs [options]

Options:
  --output <path>  write the evidence template to <path>
                   (default: ${DEFAULT_DESKTOP_SMOKE_OUTPUT})
  -h, --help       show this help

This command writes a manual evidence template only. It does not launch the
desktop app and does not confirm a passing Linux smoke. Run
\`${RECOMMENDED_COMMAND}\` on the Debian workstation, observe the app, then fill
in the checklist fields and set \`status\` accordingly.`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

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

if (isMain) {
  const parsed = parseSmokeArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  const wslRoot =
    process.env.CODEREADER_WSL_ROOT ?? (process.platform === "win32" ? toWslPath(root) : null);
  if (wslRoot) {
    const forwardedArgs = process.argv.slice(2).map(shellQuote).join(" ");
    const command = [
      '[ -f "$HOME/.profile" ] && . "$HOME/.profile"',
      '[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"',
      'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"',
      `cd ${shellQuote(wslRoot)}`,
      `node scripts/linux-desktop-smoke.mjs ${forwardedArgs}`
    ].join("; ");
    const result = spawnSync("wsl", ["bash", "-lc", command], {
      stdio: "inherit",
      shell: false
    });
    process.exit(result.status ?? 1);
  }

  runLinuxDesktopSmoke({ args: process.argv.slice(2) });
}
