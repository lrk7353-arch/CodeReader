import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedReleaseAssetNames } from "./release-assets.mjs";

export const EVIDENCE_SCHEMA_VERSION = 1;
const MATRIX = Object.freeze([
  ["windows", "x64"],
  ["windows", "arm64"],
  ["linux", "x64"],
  ["linux", "arm64"]
]);
const EXPECTED_CHECKS = Object.freeze({
  windows: ["nsis-install-window-uninstall", "msi-install-window-uninstall"],
  linux: [
    "deb-metadata",
    "rpm-metadata",
    "deb-install-window-uninstall",
    "appimage-window",
    "rpm-install-window-uninstall"
  ]
});

function fail(message) {
  throw new Error(message);
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertPortableEvidence(value, location = "evidence") {
  if (typeof value === "string") {
    if (
      /^[A-Za-z]:[\\/]/.test(value) ||
      value.startsWith("/") ||
      value.startsWith("\\\\") ||
      /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/i.test(value)
    ) {
      fail(`${location} contains nonportable or sensitive data.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPortableEvidence(entry, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (
        /^(?:cwd|root|home|user|username|artifactPath|sourcePath|source|code|prompt|response|credential|secret|token|apiKey|notes|message|log)$/i.test(
          key
        )
      ) {
        fail(`${location} contains forbidden field ${key}.`);
      }
      assertPortableEvidence(entry, `${location}.${key}`);
    }
  }
}

export function verifyNativeSmokeEvidence({ input, version, tag, commitSha, output }) {
  const inputRoot = resolve(input);
  const files = walkFiles(inputRoot);
  const packagePaths = new Map(
    files
      .filter((path) => /^CodeReader_.*\.(?:exe|msi|AppImage|deb|rpm)$/i.test(basename(path)))
      .map((path) => [basename(path), path])
  );
  const expectedPackages = expectedReleaseAssetNames(version);
  if (expectedPackages.some((name) => !packagePaths.has(name))) {
    fail("Native smoke verification input is missing one or more release packages.");
  }

  const verified = [];
  for (const [platform, arch] of MATRIX) {
    const evidenceName = `native-smoke-${platform}-${arch}.json`;
    const matches = files.filter((path) => basename(path) === evidenceName);
    if (matches.length !== 1)
      fail(`Expected exactly one ${evidenceName}, found ${matches.length}.`);
    const evidence = JSON.parse(readFileSync(matches[0], "utf8"));
    assertPortableEvidence(evidence);
    if (evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION)
      fail(`${evidenceName} schema mismatch.`);
    if (evidence.releaseTag !== tag || evidence.commitSha !== commitSha) {
      fail(`${evidenceName} is not bound to ${tag} at ${commitSha}.`);
    }
    if (evidence.platform !== platform || evidence.arch !== arch || evidence.status !== "pass") {
      fail(`${evidenceName} does not contain a passing ${platform}/${arch} result.`);
    }
    if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) {
      fail(`${evidenceName} has no checks.`);
    }
    if (evidence.checks.some((check) => check?.status !== "pass")) {
      fail(`${evidenceName} contains a non-passing check.`);
    }
    const expectedChecks = EXPECTED_CHECKS[platform];
    const actualChecks = evidence.checks.map((check) => check?.name).sort();
    if (JSON.stringify(actualChecks) !== JSON.stringify([...expectedChecks].sort())) {
      fail(`${evidenceName} check set does not match the required ${platform} package smoke.`);
    }
    const expectedForTarget = expectedPackages.filter((name) =>
      name.includes(`_${platform}_${arch}`)
    );
    const hashes = new Map((evidence.packages ?? []).map((entry) => [entry.name, entry.sha256]));
    if (hashes.size !== expectedForTarget.length) fail(`${evidenceName} package count mismatch.`);
    for (const name of expectedForTarget) {
      const recorded = hashes.get(name);
      if (!/^[0-9a-f]{64}$/.test(recorded ?? ""))
        fail(`${evidenceName} has an invalid hash for ${name}.`);
      if (sha256(packagePaths.get(name)) !== recorded)
        fail(`${evidenceName} hash mismatch for ${name}.`);
    }
    verified.push({ platform, arch, evidenceName });
    if (output) {
      mkdirSync(resolve(output), { recursive: true });
      copyFileSync(matches[0], join(resolve(output), evidenceName));
    }
  }
  return verified;
}

export function verifySpdxSbom(path) {
  const sbom = JSON.parse(readFileSync(resolve(path), "utf8"));
  if (!/^SPDX-2\.3(?:$|\b)/.test(String(sbom.spdxVersion ?? ""))) {
    fail("Final release SBOM is not SPDX 2.3.");
  }
  if (!sbom.creationInfo || !Array.isArray(sbom.packages) || sbom.packages.length === 0) {
    fail("Final release SBOM has no package inventory.");
  }
  return sbom;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) fail("Invalid arguments.");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  return values;
}

export function runCli(argv) {
  const [command, ...rest] = argv;
  const values = parseArgs(rest);
  if (command === "verify-sbom") {
    verifySpdxSbom(values.path ?? fail("Missing --path"));
    process.stdout.write("Verified final SPDX SBOM.\n");
    return;
  }
  if (command !== "verify") fail(`Unknown command: ${command ?? "<missing>"}`);
  const tag = values.tag ?? fail("Missing --tag");
  const version = tag.replace(/^v/, "");
  const verified = verifyNativeSmokeEvidence({
    input: values.input ?? fail("Missing --input"),
    output: values.output,
    version,
    tag,
    commitSha: values.sha ?? fail("Missing --sha")
  });
  process.stdout.write(`Verified ${verified.length} native package smoke records.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
