import { execFileSync, execSync } from "node:child_process";
import { delimiter, dirname, join, resolve } from "node:path";

function resolveWindowsRustToolchain() {
  if (process.platform !== "win32") {
    return null;
  }
  try {
    const rustc = execFileSync(
      "rustup",
      ["which", "rustc", "--toolchain", "stable-x86_64-pc-windows-gnu"],
      { encoding: "utf8" }
    ).trim();
    return resolve(dirname(rustc), "..");
  } catch {
    return null;
  }
}

const windowsRustToolchain = resolveWindowsRustToolchain();
const commandEnv = windowsRustToolchain
  ? {
      ...process.env,
      Path: [
        "C:\\ProgramData\\mingw64\\mingw64\\bin",
        join(windowsRustToolchain, "bin"),
        join(
          windowsRustToolchain,
          "lib",
          "rustlib",
          "x86_64-pc-windows-gnu",
          "bin",
          "self-contained"
        ),
        process.env.Path ?? process.env.PATH ?? ""
      ].join(delimiter)
    }
  : process.env;

const checks = [
  ["node", "node --version"],
  ["npm", "npm --version"],
  ["git", "git --version"],
  ["rustc", "rustc --version"],
  ["cargo", "cargo --version"],
  ["clippy", "cargo clippy --version"],
  ["gcc", "gcc --version"]
];

const results = checks.map(([name, command]) => {
  try {
    const value = execSync(command, {
      encoding: "utf8",
      env: commandEnv,
      stdio: ["ignore", "pipe", "pipe"]
    })
      .trim()
      .split(/\r?\n/, 1)[0];
    return { name, ok: true, value };
  } catch {
    return { name, ok: false, value: "not found" };
  }
});

for (const result of results) {
  const status = result.ok ? "ok" : "missing";
  console.log(`${result.name.padEnd(8)} ${status.padEnd(8)} ${result.value}`);
}

const missingRust = results.some(
  (result) => !result.ok && (result.name === "rustc" || result.name === "cargo")
);
if (missingRust) {
  console.log("\nTauri desktop commands require Rust. The Vite frontend can still run without it.");
}

if (process.platform === "linux") {
  console.log("\nFor Debian/Ubuntu Tauri development dependencies, run: npm run doctor:linux");
}
