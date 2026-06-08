import { execSync } from "node:child_process";

const checks = [
  ["node", "node --version"],
  ["npm", "npm --version"],
  ["git", "git --version"],
  ["rustc", "rustc --version"],
  ["cargo", "cargo --version"]
];

const results = checks.map(([name, command]) => {
  try {
    const value = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    return { name, ok: true, value };
  } catch {
    return { name, ok: false, value: "not found" };
  }
});

for (const result of results) {
  const status = result.ok ? "ok" : "missing";
  console.log(`${result.name.padEnd(8)} ${status.padEnd(8)} ${result.value}`);
}

const missingRust = results.some((result) => !result.ok && (result.name === "rustc" || result.name === "cargo"));
if (missingRust) {
  console.log("\nTauri desktop commands require Rust. The Vite frontend can still run without it.");
}
