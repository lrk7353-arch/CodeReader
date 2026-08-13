import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SMOKE_NAMES = [
  "native-smoke-linux-arm64.json",
  "native-smoke-linux-x64.json",
  "native-smoke-windows-arm64.json",
  "native-smoke-windows-x64.json"
];
const MANIFEST_KEYS = ["commitSha", "files", "releaseTag", "schemaVersion"];
const FILE_KEYS = ["name", "sha256"];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has an invalid schema`);
  }
}

function releaseFiles(directory) {
  const names = readdirSync(directory)
    .filter((name) => statSync(join(directory, name)).isFile())
    .filter((name) => name !== "candidate-manifest.json")
    .sort();
  const packages = names.filter((name) => /^CodeReader_[A-Za-z0-9._-]+$/.test(name));
  const smoke = names.filter((name) => name.startsWith("native-smoke-"));
  if (
    names.length !== 15 ||
    packages.length !== 10 ||
    JSON.stringify(smoke) !== JSON.stringify(SMOKE_NAMES) ||
    names.filter((name) => name === "SHA256SUMS").length !== 1
  ) {
    throw new Error(
      "candidate must contain exactly ten packages, four smoke records and SHA256SUMS"
    );
  }
  return names.map((name) => ({ name, sha256: sha256(join(directory, name)) }));
}

export function createCandidateManifest({ directory, releaseTag, commitSha }) {
  if (!/^v1\.\d+\.\d+(?:-rc\.\d+)?$/.test(releaseTag)) throw new Error("invalid release tag");
  if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error("invalid commit SHA");
  return { schemaVersion: 1, releaseTag, commitSha, files: releaseFiles(directory) };
}

export function verifyCandidateManifest({ directory, manifest, releaseTag, commitSha }) {
  assertKeys(manifest, MANIFEST_KEYS, "candidate manifest");
  if (
    manifest.schemaVersion !== 1 ||
    manifest.releaseTag !== releaseTag ||
    manifest.commitSha !== commitSha
  ) {
    throw new Error("candidate manifest binding mismatch");
  }
  if (!Array.isArray(manifest.files)) throw new Error("candidate manifest files must be an array");
  for (const file of manifest.files) {
    assertKeys(file, FILE_KEYS, "candidate manifest file");
    if (!/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error("invalid candidate file hash");
  }
  const actual = releaseFiles(directory);
  if (JSON.stringify(manifest.files) !== JSON.stringify(actual)) {
    throw new Error("candidate file set or hash differs from the prepared snapshot");
  }
}

function parseArgs(args) {
  const command = args[0];
  const values = {};
  for (let index = 1; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || args[index + 1] === undefined)
      throw new Error("invalid arguments");
    values[args[index].slice(2)] = args[index + 1];
  }
  return { command, values };
}

function main(args) {
  const { command, values } = parseArgs(args);
  if (command === "create") {
    const manifest = createCandidateManifest({
      directory: values.input,
      releaseTag: values.tag,
      commitSha: values.sha
    });
    writeFileSync(values.output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return;
  }
  if (command === "verify") {
    verifyCandidateManifest({
      directory: values.input,
      manifest: JSON.parse(readFileSync(values.manifest, "utf8")),
      releaseTag: values.tag,
      commitSha: values.sha
    });
    return;
  }
  throw new Error("expected create or verify");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
