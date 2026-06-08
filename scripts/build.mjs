import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    console.error(`\n${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

const wslRoot = process.platform === "win32" ? toWslPath(root) : null;
if (wslRoot) {
  run("Native dependency repair", process.execPath, [
    resolve(root, "scripts/repair-native-deps.mjs")
  ]);

  const command = [
    "[ -f \"$HOME/.profile\" ] && . \"$HOME/.profile\"",
    "export PATH=\"$HOME/.local/bin:$PATH\"",
    `cd ${shellQuote(wslRoot)}`,
    "node scripts/build.mjs"
  ].join("; ");
  const result = spawnSync("wsl", ["bash", "-lc", command], {
    stdio: "inherit",
    shell: false
  });
  process.exit(result.status ?? 1);
}

run("TypeScript", process.execPath, [resolve(root, "node_modules/typescript/bin/tsc")]);
run("Vite", process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "build"]);
