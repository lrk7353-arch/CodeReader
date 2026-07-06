import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
const commands = {
  check: ["check", "--manifest-path", "src-tauri/Cargo.toml"],
  clippy: [
    "clippy",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--all-targets",
    "--",
    "-D",
    "warnings"
  ],
  test: ["test", "--manifest-path", "src-tauri/Cargo.toml", "--lib"]
};

if (!(action in commands)) {
  console.error("Usage: node scripts/cargo.mjs <check|clippy|test>");
  process.exit(2);
}

// On Linux, rustup installs cargo into ~/.cargo/bin which non-interactive
// shells (e.g. the shell `npm run` spawns) may not have on PATH. Add it so
// `npm run cargo:check` works without the caller sourcing ~/.cargo/env first.
function linuxCargoEnv() {
  if (process.platform !== "linux") {
    return process.env;
  }
  const home = process.env.HOME || "";
  const cargoBin = home ? `${home}/.cargo/bin` : "";
  const currentPath = process.env.PATH || "";
  if (!cargoBin || !existsSync(cargoBin) || currentPath.split(":").includes(cargoBin)) {
    return process.env;
  }
  return { ...process.env, PATH: `${cargoBin}:${currentPath}` };
}

const result =
  process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          resolve(root, `scripts/cargo-${action}.ps1`)
        ],
        { cwd: root, stdio: "inherit", shell: false }
      )
    : spawnSync("cargo", commands[action], {
        cwd: root,
        stdio: "inherit",
        shell: false,
        env: linuxCargoEnv()
      });

if (result.error) {
  console.error(`Unable to start Cargo: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
