import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectReleaseAssets } from "./release-assets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = Object.freeze({
  x64: "x86_64-unknown-linux-gnu",
  arm64: "aarch64-unknown-linux-gnu"
});

export function parseLinuxReleaseArgs(argv) {
  const result = {
    arch: process.arch === "arm64" ? "arm64" : "x64",
    skipChecks: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--skip-checks") {
      result.skipChecks = true;
    } else if (arg === "--arch") {
      const arch = argv[index + 1];
      if (!TARGETS[arch]) {
        throw new Error(`--arch must be x64 or arm64, received ${arch ?? "<missing>"}`);
      }
      result.arch = arch;
      index += 1;
    } else {
      throw new Error(`Unknown Linux release argument: ${arg}`);
    }
  }
  return result;
}

function run(label, command, args, env = {}) {
  process.stdout.write(`\n==> ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

export function runLinuxRelease(argv = process.argv.slice(2)) {
  if (process.platform !== "linux") {
    throw new Error("Linux release packaging must run on a native Linux host.");
  }
  const { arch, skipChecks } = parseLinuxReleaseArgs(argv);
  const expectedHostArch = arch === "arm64" ? "arm64" : "x64";
  if (process.arch !== expectedHostArch) {
    throw new Error(
      `Linux ${arch} packages require a native ${expectedHostArch} host; current host is ${process.arch}.`
    );
  }
  const target = TARGETS[arch];
  const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
  if (!skipChecks) {
    run("Linux production gate", process.execPath, ["scripts/verify-linux-dev.mjs"]);
  }
  run(
    `Tauri Linux ${arch} packages`,
    process.execPath,
    ["scripts/tauri.mjs", "build", "--target", target, "--bundles", "appimage,deb,rpm"],
    { APPIMAGE_EXTRACT_AND_RUN: "1" }
  );
  const copied = collectReleaseAssets({
    source: resolve(root, `src-tauri/target/${target}/release/bundle`),
    output: resolve(root, `artifacts/linux-${arch}`),
    platform: "linux",
    arch,
    version
  });
  process.stdout.write(`\nRelease artifacts:\n${copied.join("\n")}\n`);
  return copied;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runLinuxRelease();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
