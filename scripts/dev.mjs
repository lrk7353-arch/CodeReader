import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

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

function run(command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, {
    cwd: options.cwd ?? root,
    stdio: "inherit",
    shell: false
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

function runSync(label, command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: false
  });
  if (result.status !== 0) {
    console.error(`\n${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

const wslRoot = process.env.CODEREADER_WSL_ROOT ?? (process.platform === "win32" ? toWslPath(root) : null);
if (wslRoot) {
  runSync("Native dependency repair", process.execPath, [
    resolve(root, "scripts/repair-native-deps.mjs")
  ]);

  const command = [
    "[ -f \"$HOME/.profile\" ] && . \"$HOME/.profile\"",
    "export PATH=\"$HOME/.local/bin:$PATH\"",
    "export npm_config_script_shell=/bin/bash",
    `cd ${shellQuote(wslRoot)}`,
    `node scripts/dev.mjs ${args.map(shellQuote).join(" ")}`
  ].join("; ");
  run("wsl", ["bash", "-lc", command], { cwd: root });
} else {
  run(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), ...args]);
}
