import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");

function isWindowsWslUncPath(value) {
  return process.platform === "win32" && /^\\\\(?:wsl\.localhost|wsl\$)\\/i.test(value);
}

function toWslPath(value) {
  const normalized = value.replaceAll("/", "\\");
  const match = normalized.match(/^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)\\(.+)$/i);
  if (!match) {
    return null;
  }
  return `/${match[2].replaceAll("\\", "/")}`;
}

function cmdQuote(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function run(command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, {
    cwd: options.cwd,
    stdio: "inherit",
    shell: false
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

if (isWindowsWslUncPath(root)) {
  const wrapperPath = join(tmpdir(), `codereader-tauri-${process.pid}.cmd`);
  const wslRoot = toWslPath(root);
  const command = `${cmdQuote(process.execPath)} .\\node_modules\\@tauri-apps\\cli\\tauri.js ${args.map(cmdQuote).join(" ")}`;
  writeFileSync(
    wrapperPath,
    [
      "@echo off",
      `pushd ${cmdQuote(root)}`,
      "if errorlevel 1 exit /b %errorlevel%",
      wslRoot ? `set "CODEREADER_WSL_ROOT=${wslRoot}"` : "",
      "set \"CODEREADER_WINDOWS_ROOT=%CD%\"",
      "set \"PATH=C:\\ProgramData\\mingw64\\mingw64\\bin;C:\\ProgramData\\chocolatey\\lib\\rust\\tools\\lib\\rustlib\\x86_64-pc-windows-gnu\\bin\\self-contained;%PATH%\"",
      "set \"CARGO_TARGET_DIR=%USERPROFILE%\\.cache\\codereader\\cargo-target\"",
      command,
      "set EXIT_CODE=%ERRORLEVEL%",
      "popd",
      "exit /b %EXIT_CODE%",
      ""
    ].join("\r\n")
  );

  const child = spawn("cmd.exe", ["/d", "/c", wrapperPath], {
    cwd: process.env.SystemRoot ?? "C:\\"
  });
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  child.on("exit", (code) => {
    try {
      rmSync(wrapperPath, { force: true });
    } catch {
      // The wrapper is temporary; failure to clean it is non-fatal.
    }
    process.exit(code ?? 0);
  });
} else {
  run(process.execPath, ["./node_modules/@tauri-apps/cli/tauri.js", ...args], {
    cwd: root
  });
}
