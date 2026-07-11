import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_EXTENSIONS = Object.freeze([".exe", ".msi", ".AppImage", ".deb", ".rpm"]);
const PLATFORM_FORMATS = Object.freeze({
  windows: [".exe", ".msi"],
  linux: [".AppImage", ".deb", ".rpm"]
});
const PLATFORMS = new Set(Object.keys(PLATFORM_FORMATS));
const ARCHITECTURES = new Set(["x64", "arm64"]);

function fail(message) {
  throw new Error(message);
}

function normalizeVersion(value) {
  const version = String(value ?? "")
    .trim()
    .replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(version)) {
    fail(`Unsupported release version: ${value}`);
  }
  return version;
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function canonicalExtension(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".appimage")) {
    return ".AppImage";
  }
  return extname(path).toLowerCase();
}

function expectedName(version, platform, arch, extension) {
  const suffix = extension === ".exe" ? "_setup.exe" : extension;
  return `CodeReader_${version}_${platform}_${arch}${suffix}`;
}

export function collectReleaseAssets({ source, output, platform, arch, version }) {
  if (!PLATFORMS.has(platform)) {
    fail(`Unsupported platform: ${platform}`);
  }
  if (!ARCHITECTURES.has(arch)) {
    fail(`Unsupported architecture: ${arch}`);
  }
  const normalizedVersion = normalizeVersion(version);
  const sourceRoot = resolve(source);
  const outputRoot = resolve(output);
  const candidates = walkFiles(sourceRoot);
  const copied = [];

  mkdirSync(outputRoot, { recursive: true });
  for (const extension of PLATFORM_FORMATS[platform]) {
    const matches = candidates.filter((path) => canonicalExtension(path) === extension);
    if (matches.length !== 1) {
      fail(
        `Expected exactly one ${platform}/${arch} ${extension} artifact below ${sourceRoot}, found ${matches.length}.`
      );
    }
    const destination = join(
      outputRoot,
      expectedName(normalizedVersion, platform, arch, extension)
    );
    copyFileSync(matches[0], destination);
    copied.push(destination);
  }
  return copied;
}

function digest(path, algorithm) {
  return createHash(algorithm).update(readFileSync(path)).digest("hex");
}

export function expectedReleaseAssetNames(version) {
  const normalizedVersion = normalizeVersion(version);
  const names = [];
  for (const platform of ["windows", "linux"]) {
    for (const arch of ["x64", "arm64"]) {
      for (const extension of PLATFORM_FORMATS[platform]) {
        names.push(expectedName(normalizedVersion, platform, arch, extension));
      }
    }
  }
  return names.sort();
}

function buildSpdx(version, assets, createdAt) {
  const files = assets.map((asset, index) => ({
    fileName: asset.name,
    SPDXID: `SPDXRef-File-${index + 1}`,
    checksums: [
      { algorithm: "SHA256", checksumValue: asset.sha256 },
      { algorithm: "SHA1", checksumValue: asset.sha1 }
    ],
    licenseConcluded: "NOASSERTION",
    copyrightText: "NOASSERTION"
  }));
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `CodeReader-${version}-release-assets`,
    documentNamespace: `https://github.com/lrk7353-arch/CodeReader/releases/tag/v${version}/sbom/${randomUUID()}`,
    creationInfo: {
      created: createdAt,
      creators: ["Tool: CodeReader release-assets.mjs"]
    },
    files,
    relationships: files.map((file) => ({
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: "DESCRIBES",
      relatedSpdxElement: file.SPDXID
    }))
  };
}

function releaseNotes(version, assets) {
  const candidate = version.includes("-rc.");
  return `# CodeReader ${version}\n\n${
    candidate
      ? "This is a release candidate for production validation."
      : "This is the first production-grade CodeReader release."
  }\n\n## Supported systems\n\n- Windows 10 22H2 and Windows 11, x64 or ARM64; Microsoft Edge WebView2 Evergreen Runtime is required.\n- Linux with glibc 2.35 or newer and WebKitGTK 4.1; Ubuntu 22.04+, Debian 12+, and Fedora 39+ are the official baseline.\n- macOS is planned for the next version and is not included in this release.\n\n## Choose an installer\n\n- Windows: use the NSIS \`.exe\` for the simplest per-user install or the \`.msi\` for managed installation.\n- Linux: choose AppImage, \`.deb\`, or \`.rpm\` for your distribution and architecture. Package managers resolve runtime dependencies; AppImage users provide WebKitGTK 4.1 on the host.\n\n## Windows signing notice\n\nThe Windows packages in this release are not Authenticode-signed unless the release explicitly states otherwise. Windows may show SmartScreen or unknown-publisher warnings. Verify \`SHA256SUMS\` and the GitHub artifact attestation before installing.\n\n## Verification\n\n\`\`\`bash\nsha256sum -c SHA256SUMS\ngh attestation verify CodeReader_${version}_<platform>_<arch>.<format> -R lrk7353-arch/CodeReader\n\`\`\`\n\nAssets included: ${assets.length}.\n`;
}

export function assembleReleaseAssets({ input, output, version }) {
  const normalizedVersion = normalizeVersion(version);
  const inputRoot = resolve(input);
  const outputRoot = resolve(output);
  mkdirSync(outputRoot, { recursive: true });

  const packageFiles = walkFiles(inputRoot).filter((path) =>
    PACKAGE_EXTENSIONS.includes(canonicalExtension(path))
  );
  const byName = new Map();
  for (const path of packageFiles) {
    const name = basename(path);
    if (byName.has(name)) {
      fail(`Duplicate release asset name: ${name}`);
    }
    byName.set(name, path);
  }

  const expected = expectedReleaseAssetNames(normalizedVersion);
  const actual = [...byName.keys()].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `Release asset set mismatch.\nExpected: ${expected.join(", ")}\nActual: ${actual.join(", ")}`
    );
  }

  const assets = expected.map((name) => {
    const source = byName.get(name);
    const destination = join(outputRoot, name);
    if (resolve(source) !== resolve(destination)) {
      copyFileSync(source, destination);
    }
    return {
      name,
      bytes: statSync(destination).size,
      sha256: digest(destination, "sha256"),
      sha1: digest(destination, "sha1")
    };
  });

  const createdAt = new Date().toISOString();
  writeFileSync(
    join(outputRoot, "SHA256SUMS"),
    `${assets.map((asset) => `${asset.sha256}  ${asset.name}`).join("\n")}\n`
  );
  writeFileSync(
    join(outputRoot, "CodeReader.spdx.json"),
    `${JSON.stringify(buildSpdx(normalizedVersion, assets, createdAt), null, 2)}\n`
  );
  writeFileSync(
    join(outputRoot, "release-metadata.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        product: "CodeReader",
        version: normalizedVersion,
        createdAt,
        windowsAuthenticodeSigned: false,
        supportedPlatforms: {
          windows: ["Windows 10 22H2", "Windows 11"],
          linux: ["glibc >= 2.35", "Ubuntu >= 22.04", "Debian >= 12", "Fedora >= 39"]
        },
        assets: assets.map((asset) => ({
          name: asset.name,
          bytes: asset.bytes,
          sha256: asset.sha256
        }))
      },
      null,
      2
    )}\n`
  );
  writeFileSync(join(outputRoot, "RELEASE-NOTES.md"), releaseNotes(normalizedVersion, assets));
  return assets;
}

export function verifyVersionCoherence({ root, tag }) {
  const projectRoot = resolve(root);
  const packageVersion = normalizeVersion(
    JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).version
  );
  const lockVersion = normalizeVersion(
    JSON.parse(readFileSync(join(projectRoot, "package-lock.json"), "utf8")).version
  );
  const tauriVersion = normalizeVersion(
    JSON.parse(readFileSync(join(projectRoot, "src-tauri/tauri.conf.json"), "utf8")).version
  );
  const cargoText = readFileSync(join(projectRoot, "src-tauri/Cargo.toml"), "utf8");
  const cargoVersion = normalizeVersion(cargoText.match(/^version\s*=\s*"([^"]+)"/m)?.[1]);
  const versions = new Set([packageVersion, lockVersion, tauriVersion, cargoVersion]);
  if (versions.size !== 1) {
    fail(
      `Version mismatch: package=${packageVersion}, lock=${lockVersion}, tauri=${tauriVersion}, cargo=${cargoVersion}`
    );
  }
  if (tag && normalizeVersion(tag) !== packageVersion) {
    fail(`Release tag ${tag} does not match project version ${packageVersion}.`);
  }
  return packageVersion;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      fail(`Unexpected argument: ${key}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`Missing value for ${key}`);
    }
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

function required(values, key) {
  return values[key] ?? fail(`Missing --${key}`);
}

export function runCli(argv) {
  const [command, ...rest] = argv;
  const values = parseArgs(rest);
  if (command === "collect") {
    const copied = collectReleaseAssets({
      source: required(values, "source"),
      output: required(values, "output"),
      platform: required(values, "platform"),
      arch: required(values, "arch"),
      version: required(values, "version")
    });
    process.stdout.write(`${copied.join("\n")}\n`);
    return;
  }
  if (command === "assemble") {
    const assets = assembleReleaseAssets({
      input: required(values, "input"),
      output: required(values, "output"),
      version: required(values, "version")
    });
    process.stdout.write(`Assembled ${assets.length} release assets.\n`);
    return;
  }
  if (command === "verify-version") {
    const version = verifyVersionCoherence({
      root: values.root ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      tag: values.tag
    });
    process.stdout.write(`${version}\n`);
    return;
  }
  fail(`Unknown command: ${command ?? "<missing>"}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
