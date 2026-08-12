import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
export const REQUIRED_NATIVE_JOURNEY_CHECKS = Object.freeze([
  "native-picker-open-project",
  "explanation-generation",
  "restart-reauthorize-restore",
  "legacy-0.10-upgrade",
  "legacy-0.11-upgrade",
  "uninstall-data-policy",
  "keyboard-focus-roundtrip",
  "reduced-motion",
  "long-content",
  "zoom-200-contrast"
]);
const NATIVE_JOURNEY_FIELDS = Object.freeze([
  "schemaVersion",
  "releaseTag",
  "commitSha",
  "platform",
  "arch",
  "observedAt",
  "status",
  "windowsAuthenticodeSigned",
  "checks",
  "authenticodeVerification"
]);
const NATIVE_JOURNEY_CHECK_FIELDS = Object.freeze(["name", "status"]);
const AUTHENTICODE_VERIFICATION_FIELDS = Object.freeze(["status", "thumbprint"]);

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

function assertExactObject(value, allowedFields, location) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${location} must be an object.`);
  }
  for (const field of Object.keys(value)) {
    if (!allowedFields.includes(field)) fail(`${location} contains unknown field ${field}.`);
  }
}

function assertValidObservedAt(value, evidenceName) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail(`${evidenceName} has an invalid observedAt timestamp.`);
  }
}

function assertNativeJourneySchema(evidence, platform, arch, evidenceName) {
  assertExactObject(evidence, NATIVE_JOURNEY_FIELDS, evidenceName);
  assertValidObservedAt(evidence.observedAt, evidenceName);
  if (!Array.isArray(evidence.checks)) fail(`${evidenceName}.checks must be an array.`);
  evidence.checks.forEach((check, index) => {
    assertExactObject(check, NATIVE_JOURNEY_CHECK_FIELDS, `${evidenceName}.checks[${index}]`);
    if (typeof check.name !== "string" || check.status !== "pass") {
      fail(`${evidenceName} contains a non-passing or malformed product journey check.`);
    }
  });
  if (platform === "linux") {
    if (evidence.windowsAuthenticodeSigned !== null) {
      fail(`${evidenceName} must use null for Windows Authenticode status on Linux.`);
    }
    if (Object.hasOwn(evidence, "authenticodeVerification")) {
      fail(`${evidenceName} must not contain Windows Authenticode verification on Linux.`);
    }
    return;
  }
  if (typeof evidence.windowsAuthenticodeSigned !== "boolean") {
    fail(`${evidenceName} must record the Windows Authenticode status.`);
  }
  if (!evidence.windowsAuthenticodeSigned) {
    if (Object.hasOwn(evidence, "authenticodeVerification")) {
      fail(`${evidenceName} must not include Authenticode verification when unsigned.`);
    }
    return;
  }
  if (!evidence.authenticodeVerification) {
    fail(`${evidenceName} claims signing without a passing Authenticode verification.`);
  }
  assertExactObject(
    evidence.authenticodeVerification,
    AUTHENTICODE_VERIFICATION_FIELDS,
    `${evidenceName}.authenticodeVerification`
  );
  if (
    evidence.authenticodeVerification.status !== "pass" ||
    !/^[0-9a-f]{40,64}$/i.test(evidence.authenticodeVerification.thumbprint ?? "")
  ) {
    fail(`${evidenceName} claims signing without a passing Authenticode verification.`);
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

export function buildNativeJourneyTemplate({ platform, arch, tag, commitSha, observedAt }) {
  if (
    !MATRIX.some(
      ([candidatePlatform, candidateArch]) =>
        candidatePlatform === platform && candidateArch === arch
    )
  ) {
    fail(`Unsupported native journey target: ${platform}/${arch}.`);
  }
  if (!/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(tag)) fail("Invalid release tag.");
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) fail("Invalid commit SHA.");
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    releaseTag: tag,
    commitSha: commitSha.toLowerCase(),
    platform,
    arch,
    observedAt: observedAt ?? new Date().toISOString(),
    status: "manual_required",
    windowsAuthenticodeSigned: platform === "windows" ? false : null,
    checks: REQUIRED_NATIVE_JOURNEY_CHECKS.map((name) => ({ name, status: "pending" }))
  };
}

export function verifyNativeJourneyEvidence({ input, tag, commitSha }) {
  const files = walkFiles(resolve(input));
  const journeyFiles = files
    .map((path) => basename(path))
    .filter((name) => name.startsWith("native-journey-") && name.endsWith(".json"));
  const expectedJourneyFiles = MATRIX.map(
    ([platform, arch]) => `native-journey-${platform}-${arch}.json`
  );
  if (
    JSON.stringify([...journeyFiles].sort()) !== JSON.stringify([...expectedJourneyFiles].sort())
  ) {
    fail("Native journey input must contain exactly the four expected target records.");
  }
  const verified = [];
  for (const [platform, arch] of MATRIX) {
    const evidenceName = `native-journey-${platform}-${arch}.json`;
    const matches = files.filter((path) => basename(path) === evidenceName);
    if (matches.length !== 1) {
      fail(`Expected exactly one ${evidenceName}, found ${matches.length}.`);
    }
    const evidence = JSON.parse(readFileSync(matches[0], "utf8"));
    assertPortableEvidence(evidence);
    assertNativeJourneySchema(evidence, platform, arch, evidenceName);
    if (evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION)
      fail(`${evidenceName} schema mismatch.`);
    if (evidence.releaseTag !== tag || evidence.commitSha !== commitSha.toLowerCase()) {
      fail(`${evidenceName} is not bound to ${tag} at ${commitSha}.`);
    }
    if (evidence.platform !== platform || evidence.arch !== arch || evidence.status !== "pass") {
      fail(`${evidenceName} does not contain a passing ${platform}/${arch} journey.`);
    }
    const actualChecks = (evidence.checks ?? []).map((check) => check?.name).sort();
    if (
      JSON.stringify(actualChecks) !== JSON.stringify([...REQUIRED_NATIVE_JOURNEY_CHECKS].sort())
    ) {
      fail(`${evidenceName} check set does not match the required native product journey.`);
    }
    if (evidence.checks.some((check) => check?.status !== "pass")) {
      fail(`${evidenceName} contains a non-passing product journey check.`);
    }
    verified.push({ platform, arch, evidenceName });
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
  if (command === "journey-template") {
    const output = values.output ?? fail("Missing --output");
    const template = buildNativeJourneyTemplate({
      platform: values.platform ?? fail("Missing --platform"),
      arch: values.arch ?? fail("Missing --arch"),
      tag: values.tag ?? fail("Missing --tag"),
      commitSha: values.sha ?? fail("Missing --sha")
    });
    mkdirSync(resolve(output, ".."), { recursive: true });
    writeFileSync(resolve(output), `${JSON.stringify(template, null, 2)}\n`);
    process.stdout.write(`Wrote manual native journey template to ${output}.\n`);
    return;
  }
  if (command === "verify-journeys") {
    const verified = verifyNativeJourneyEvidence({
      input: values.input ?? fail("Missing --input"),
      tag: values.tag ?? fail("Missing --tag"),
      commitSha: values.sha ?? fail("Missing --sha")
    });
    process.stdout.write(`Verified ${verified.length} native product journey records.\n`);
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
