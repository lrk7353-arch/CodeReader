import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expectedReleaseAssetNames } from "./release-assets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function run(label, command, args, options = {}) {
  process.stdout.write(`\n==> ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options
  });
  if (result.status !== 0) fail(`${label} failed with exit code ${result.status ?? "unknown"}.`);
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) fail(`${command} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) fail("Invalid arguments.");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  return values;
}

export function validateLinuxPackageMetadata({ deb, rpm, arch, captureOutput = capture }) {
  const debName = captureOutput("dpkg-deb", ["-f", deb, "Package"]);
  if (!/^[a-z0-9][a-z0-9+.-]*$/.test(debName)) {
    fail(`Unsafe Debian package name: ${debName}.`);
  }
  const debArch = captureOutput("dpkg-deb", ["-f", deb, "Architecture"]);
  const expectedDebArch = arch === "arm64" ? "arm64" : "amd64";
  if (debArch !== expectedDebArch)
    fail(`Deb architecture is ${debArch}, expected ${expectedDebArch}.`);
  const debDepends = captureOutput("dpkg-deb", ["-f", deb, "Depends"]);
  if (!/libwebkit2gtk-4\.1-0/i.test(debDepends))
    fail("Deb package does not declare WebKitGTK 4.1.");

  const rpmName = captureOutput("rpm", ["-qp", "--qf", "%{NAME}", rpm]);
  if (!/^[A-Za-z0-9][A-Za-z0-9+._-]*$/.test(rpmName)) {
    fail(`Unsafe RPM package name: ${rpmName}.`);
  }
  const rpmArch = captureOutput("rpm", ["-qp", "--qf", "%{ARCH}", rpm]);
  const expectedRpmArch = arch === "arm64" ? "aarch64" : "x86_64";
  if (rpmArch !== expectedRpmArch)
    fail(`RPM architecture is ${rpmArch}, expected ${expectedRpmArch}.`);
  const rpmRequires = captureOutput("rpm", ["-qpR", rpm]);
  if (!/libwebkit2gtk-4\.1\.so\.0|webkit2gtk/i.test(rpmRequires)) {
    fail("RPM package does not declare a WebKitGTK 4.1 runtime requirement.");
  }
  return { debName, rpmName };
}

export function runLinuxPackageSmoke(argv = process.argv.slice(2)) {
  if (process.platform !== "linux") fail("Linux package smoke must run on Linux.");
  const values = parseArgs(argv);
  const arch = values.arch ?? fail("Missing --arch");
  if (!["x64", "arm64"].includes(arch) || process.arch !== arch) {
    fail(
      `Linux ${arch} smoke requires a native ${arch} runner; current architecture is ${process.arch}.`
    );
  }
  const tag = values.tag ?? fail("Missing --tag");
  const sha = values.sha ?? fail("Missing --sha");
  if (!/^[0-9a-f]{40}$/i.test(sha)) fail("Invalid --sha.");
  const artifacts = resolve(values.artifacts ?? fail("Missing --artifacts"));
  const output = resolve(values.output ?? fail("Missing --output"));
  const version = tag.replace(/^v/, "");
  const names = expectedReleaseAssetNames(version).filter((name) =>
    name.includes(`_linux_${arch}`)
  );
  const paths = new Map(names.map((name) => [name, resolve(artifacts, name)]));
  const deb = paths.get(names.find((name) => name.endsWith(".deb")));
  const rpm = paths.get(names.find((name) => name.endsWith(".rpm")));
  const appImage = paths.get(names.find((name) => name.endsWith(".AppImage")));
  const { debName, rpmName: installedRpmName } = validateLinuxPackageMetadata({ deb, rpm, arch });

  const launchScript = resolve(root, "scripts/linux-window-smoke.sh");
  run("Install Debian package", "sudo", ["apt-get", "install", "-y", deb]);
  run("Launch installed Debian package", "dbus-run-session", [
    "--",
    "xvfb-run",
    "-a",
    "bash",
    launchScript,
    "/usr/bin/codereader"
  ]);
  run("Uninstall Debian package", "sudo", ["apt-get", "purge", "-y", debName]);

  chmodSync(appImage, 0o755);
  run(
    "Launch AppImage",
    "dbus-run-session",
    ["--", "xvfb-run", "-a", "bash", launchScript, appImage],
    { env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" } }
  );

  const rpmName = basename(rpm);
  if (!/^[A-Za-z0-9_.+-]+\.rpm$/.test(rpmName)) fail("Unsafe RPM asset name.");
  const containerScript = [
    "set -euo pipefail",
    "dnf install -y xorg-x11-server-Xvfb xdotool dbus-daemon /assets/" + rpmName,
    "dbus-run-session -- xvfb-run -a bash /repo/scripts/linux-window-smoke.sh /usr/bin/codereader",
    "dnf remove -y " + installedRpmName,
    "! rpm -q " + installedRpmName
  ].join("; ");
  run("Install, launch, and uninstall RPM", "docker", [
    "run",
    "--rm",
    "-v",
    `${artifacts}:/assets:ro`,
    "-v",
    `${root}:/repo:ro`,
    "fedora:43",
    "bash",
    "-lc",
    containerScript
  ]);

  const evidence = {
    schemaVersion: 1,
    releaseTag: tag,
    commitSha: sha.toLowerCase(),
    platform: "linux",
    arch,
    status: "pass",
    packages: names.map((name) => ({ name, sha256: sha256(paths.get(name)) })),
    checks: [
      { name: "deb-metadata", status: "pass" },
      { name: "rpm-metadata", status: "pass" },
      { name: "deb-install-window-uninstall", status: "pass" },
      { name: "appimage-window", status: "pass" },
      { name: "rpm-install-window-uninstall", status: "pass" }
    ]
  };
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runLinuxPackageSmoke();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
