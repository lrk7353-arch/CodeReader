import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_RELEASE_SMOKE_OUTPUT = "artifacts/windows-evidence/release-smoke.json";
export const DEFAULT_RELEASE_SMOKE_STATUS = "manual_required";
export const ARTIFACTS_DIR = "artifacts/windows-x64";

export function parseSmokeArgs(argv) {
  const result = { output: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result.output = next;
        i += 1;
      }
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }
  return result;
}

function sha256OfFile(filePath) {
  const buffer = readFileSync(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

function readJson(filePath) {
  const text = readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

/**
 * Automated checks that do not require a real install or certificate.
 * Verifies manifest presence, JSON validity, and SHA-256 consistency.
 * Returns { checks: Array, allOk: boolean }.
 */
export function runAutomatedReleaseChecks({
  artifactsDir = resolve(root, ARTIFACTS_DIR),
  fileExists = existsSync,
  readJsonFile = readJson,
  readFile = (p) => readFileSync(p, "utf8"),
  hashFile = sha256OfFile
} = {}) {
  const checks = [];
  let allOk = true;

  function record(name, ok, detail) {
    checks.push({ name, ok, detail: detail ?? "" });
    if (!ok) {
      allOk = false;
    }
  }

  const releaseManifestPath = `${artifactsDir}/release-manifest.json`;
  const sha256sumsPath = `${artifactsDir}/SHA256SUMS.txt`;
  const signingManifestPath = `${artifactsDir}/signing-manifest.json`;

  if (!fileExists(releaseManifestPath)) {
    record("release-manifest.json exists", false, "missing");
    return { checks, allOk: false };
  }
  record("release-manifest.json exists", true);

  if (!fileExists(sha256sumsPath)) {
    record("SHA256SUMS.txt exists", false, "missing");
  } else {
    record("SHA256SUMS.txt exists", true);
  }

  if (!fileExists(signingManifestPath)) {
    record("signing-manifest.json exists", false, "missing");
  } else {
    record("signing-manifest.json exists", true);
  }

  let releaseManifest;
  try {
    releaseManifest = readJsonFile(releaseManifestPath);
    record("release-manifest.json is valid JSON", true);
  } catch (error) {
    record("release-manifest.json is valid JSON", false, String(error));
    return { checks, allOk: false };
  }

  let signingManifest = null;
  if (fileExists(signingManifestPath)) {
    try {
      signingManifest = readJsonFile(signingManifestPath);
      record("signing-manifest.json is valid JSON", true);
    } catch (error) {
      record("signing-manifest.json is valid JSON", false, String(error));
    }
  }

  const artifacts = Array.isArray(releaseManifest.artifacts) ? releaseManifest.artifacts : [];
  if (artifacts.length === 0) {
    record("release-manifest has artifacts", false, "empty");
    return { checks, allOk: false };
  }
  record("release-manifest has artifacts", true);

  // Parse SHA256SUMS.txt into a map of name -> sha256 for cross-validation.
  let sha256sums = new Map();
  if (fileExists(sha256sumsPath)) {
    try {
      const text = readFile(sha256sumsPath);
      sha256sums = parseSha256sums(text);
      record("SHA256SUMS.txt parses to entries", sha256sums.size > 0, `${sha256sums.size} entries`);
    } catch (error) {
      record("SHA256SUMS.txt parses to entries", false, String(error));
    }
  }

  for (const entry of artifacts) {
    const fileName = entry.name ?? entry.path;
    if (!fileName) {
      record(`artifact has a name`, false, JSON.stringify(entry));
      continue;
    }
    const fullPath = `${artifactsDir}/${fileName}`;
    if (!fileExists(fullPath)) {
      record(`artifact file exists: ${fileName}`, false, "missing");
      continue;
    }
    record(`artifact file exists: ${fileName}`, true);

    const expectedSha = (entry.sha256 ?? "").toLowerCase();
    if (!expectedSha) {
      record(`manifest has sha256 for ${fileName}`, false, "missing sha256");
      continue;
    }
    const actualSha = hashFile(fullPath);
    if (actualSha === expectedSha) {
      record(`sha256 matches for ${fileName}`, true);
    } else {
      record(
        `sha256 matches for ${fileName}`,
        false,
        `manifest=${expectedSha} actual=${actualSha}`
      );
    }

    // Cross-validate against SHA256SUMS.txt if it was parsed.
    if (sha256sums.size > 0) {
      const sumEntry = sha256sums.get(fileName);
      if (!sumEntry) {
        record(`SHA256SUMS entry for ${fileName}`, false, "not in SHA256SUMS.txt");
      } else if (sumEntry === expectedSha) {
        record(`SHA256SUMS matches manifest for ${fileName}`, true);
      } else {
        record(
          `SHA256SUMS matches manifest for ${fileName}`,
          false,
          `manifest=${expectedSha} sums=${sumEntry}`
        );
      }
    }

    if (signingManifest && Array.isArray(signingManifest.artifacts)) {
      const signingEntry = signingManifest.artifacts.find((s) => s.path === fileName);
      if (signingEntry) {
        const signed = signingEntry.signed === true;
        const status = signingEntry.signatureStatus ?? "Unknown";
        record(
          `signing status recorded for ${fileName}`,
          true,
          `signed=${signed} status=${status}`
        );
      } else {
        record(`signing entry for ${fileName}`, false, "not in signing-manifest");
      }
    } else if (signingManifest) {
      record(`signing entry for ${fileName}`, false, "signing-manifest has no artifacts array");
    }
  }

  return { checks, allOk };
}

/**
 * Parses a SHA256SUMS.txt file. Each line is `<sha256>  <name>` (two spaces).
 * Returns a Map of name -> lowercase sha256. Blank lines and lines that do
 * not match the expected format are skipped.
 */
export function parseSha256sums(text) {
  const map = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (!match) {
      continue;
    }
    const sha = match[1].toLowerCase();
    const name = match[2].trim();
    if (name) {
      map.set(name, sha);
    }
  }
  return map;
}

export function buildReleaseSmokeTemplate({
  platform = process.platform,
  cwd = process.cwd(),
  generatedAt,
  automatedChecks
} = {}) {
  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    platform,
    root,
    cwd,
    nodeVersion: process.version,
    recommendedCommand: "npm run release:windows",
    status: DEFAULT_RELEASE_SMOKE_STATUS,
    automated: automatedChecks ?? { checks: [], allOk: false },
    checklist: {
      tauriDevLaunched: null,
      windowVisible: null,
      openFileWorks: null,
      openProjectWorks: null,
      modelSettingsOpen: null,
      upgradeOverInstall: null,
      uninstallKeepsUserData: null,
      notes: ""
    }
  };
}

export function runWindowsReleaseSmoke({
  args = [],
  stdout = process.stdout,
  cwd = process.cwd(),
  generatedAt
} = {}) {
  const { output } = parseSmokeArgs(args);
  const outputPath = output ?? DEFAULT_RELEASE_SMOKE_OUTPUT;
  const targetPath = resolve(cwd, outputPath);
  const automated = runAutomatedReleaseChecks();
  const template = buildReleaseSmokeTemplate({
    platform: process.platform,
    cwd,
    generatedAt,
    automatedChecks: automated
  });
  const jsonText = `${JSON.stringify(template, null, 2)}\n`;
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, jsonText);
  stdout.write(`Wrote Windows release smoke evidence to ${targetPath}\n`);
  stdout.write(`Recommended command: ${template.recommendedCommand}\n`);
  stdout.write(
    `Automated checks: ${automated.checks.filter((c) => c.ok).length}/${automated.checks.length} passed\n`
  );
  stdout.write(
    `Status: ${template.status} (fill in the manual checklist after install observation).\n`
  );
  return { output: targetPath, template, automated };
}

function printHelp() {
  console.log(`Usage: node scripts/windows-release-smoke.mjs [options]

Options:
  --output <path>  write the evidence template to <path>
                   (default: ${DEFAULT_RELEASE_SMOKE_OUTPUT})
  -h, --help       show this help

This command runs automated manifest/hash/signing-status checks against
${ARTIFACTS_DIR}/ and writes a manual evidence template for the parts that
require a real Windows install. It does not install anything and does not
confirm a passing release-chain on its own.`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const parsed = parseSmokeArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }
  runWindowsReleaseSmoke({ args: process.argv.slice(2) });
}
