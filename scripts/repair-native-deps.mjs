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

function toWslLocation(value) {
  const normalized = value.replaceAll("/", "\\");
  const match = normalized.match(/^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)\\(.+)$/i);
  if (!match) {
    return null;
  }
  const path = `/${match[2].replaceAll("\\", "/")}`;
  return {
    distribution: match[1],
    path,
    user: path.match(/^\/home\/([^/]+)/)?.[1]
  };
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
  },
  {
    packageName: "@rollup/rollup-win32-x64-msvc",
    versionFrom: "rollup"
  },
  {
    packageName: "@esbuild/win32-x64",
    versionFrom: "esbuild"
  },
  {
    packageName: "@tauri-apps/cli-linux-x64-gnu",
    versionFrom: "@tauri-apps/cli"
  },
  {
    packageName: "@tauri-apps/cli-win32-x64-msvc",
    versionFrom: "@tauri-apps/cli"
  }
];

const missing = nativePackages.filter(
  ({ packageName }) => !existsSync(packageJsonPath(packageName))
);
const wslLocation = process.platform === "win32" ? toWslLocation(root) : null;

if (missing.length > 0) {
  const specs = missing.map(({ packageName, versionFrom }) => {
    return `${packageName}@${packageVersion(versionFrom)}`;
  });
  const registry = process.env.npm_config_registry ?? process.env.NPM_CONFIG_REGISTRY;
  const registryArgs = registry ? ["--registry", registry] : [];
  console.log(`Installing native packages: ${specs.join(", ")}`);

  if (wslLocation) {
    const npmPath = wslLocation.user ? `/home/${wslLocation.user}/.local/bin/npm` : "/usr/bin/npm";
    const command = [
      `cd ${shellQuote(wslLocation.path)}`,
      `[ -x ${shellQuote(npmPath)} ] || { echo "A Linux npm executable is required at ${npmPath}." >&2; exit 1; }`,
      `${shellQuote(npmPath)} install ${registryArgs
        .map(shellQuote)
        .join(" ")} --force --no-save ${specs.map(shellQuote).join(" ")}`
    ].join("; ");
    const wslArgs = ["-d", wslLocation.distribution];
    if (wslLocation.user) {
      wslArgs.push("-u", wslLocation.user);
    }
    run("wsl.exe", [...wslArgs, "--", "bash", "-lc", command]);
  } else {
    const npm = npmRunner();
    run(npm.command, [
      ...npm.args,
      "install",
      "--prefix",
      root,
      ...registryArgs,
      "--force",
      "--no-save",
      ...specs
    ]);
  }
}

if (wslLocation) {
  const command = [
    `cd ${shellQuote(wslLocation.path)}`,
    "[ -f node_modules/@esbuild/linux-x64/bin/esbuild ] && chmod +x node_modules/@esbuild/linux-x64/bin/esbuild || true"
  ].join("; ");
  const wslArgs = ["-d", wslLocation.distribution];
  if (wslLocation.user) {
    wslArgs.push("-u", wslLocation.user);
  }
  run("wsl.exe", [...wslArgs, "--", "bash", "-lc", command]);
}
