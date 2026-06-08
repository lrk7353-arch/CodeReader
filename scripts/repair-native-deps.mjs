import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function packageJsonPath(packageName) {
  return resolve(root, "node_modules", ...packageName.split("/"), "package.json");
}

function packageVersion(packageName) {
  const jsonPath = packageJsonPath(packageName);
  if (!existsSync(jsonPath)) {
    throw new Error(`Cannot find ${packageName}. Run npm install first.`);
  }
  return JSON.parse(readFileSync(jsonPath, "utf8")).version;
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

function npmRunner() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath]
    };
  }

  const npmCli = resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  if (existsSync(npmCli)) {
    return {
      command: process.execPath,
      args: [npmCli]
    };
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: []
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options
  });
  if (result.status !== 0) {
    console.error(`\n${command} ${args.join(" ")} failed.`);
    process.exit(result.status ?? 1);
  }
}

const nativePackages = [
  {
    packageName: "@rollup/rollup-linux-x64-gnu",
    versionFrom: "rollup"
  },
  {
    packageName: "@esbuild/linux-x64",
    versionFrom: "esbuild"
  }
];

const missing = nativePackages.filter(({ packageName }) => !existsSync(packageJsonPath(packageName)));

if (missing.length > 0) {
  const npm = npmRunner();
  const specs = missing.map(({ packageName, versionFrom }) => {
    return `${packageName}@${packageVersion(versionFrom)}`;
  });
  console.log(`Installing native packages: ${specs.join(", ")}`);
  run(npm.command, [...npm.args, "install", "--prefix", root, "--force", "--no-save", ...specs]);
}

const wslRoot = process.platform === "win32" ? toWslPath(root) : null;
if (wslRoot) {
  const command = [
    `cd ${shellQuote(wslRoot)}`,
    "[ -f node_modules/@esbuild/linux-x64/bin/esbuild ] && chmod +x node_modules/@esbuild/linux-x64/bin/esbuild || true"
  ].join("; ");
  run("wsl", ["bash", "-lc", command]);
}
