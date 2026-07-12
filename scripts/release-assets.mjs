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
  const releaseKindZh = candidate
    ? "这是用于完整生产验证的候选版，不应被当作稳定版部署。"
    : "这是正式稳定版。";
  const releaseKindEn = candidate
    ? "This is a release candidate for complete production validation; it is not a stable deployment."
    : "This is a stable production release.";
  const assetList = assets.map((asset) => "- " + asset.name).join("\n");
  const chineseGuideUrl =
    "https://github.com/lrk7353-arch/CodeReader/blob/v" + version + "/README.zh-CN.md";

  return [
    "# CodeReader " + version + " 发布说明 / Release Notes",
    "",
    "> " + releaseKindZh,
    ">",
    "> " + releaseKindEn,
    "",
    "## 简体中文",
    "",
    "### 支持范围",
    "",
    "- Windows 10 22H2 或 Windows 11，x64 或 ARM64。需要 Microsoft Edge WebView2 Evergreen Runtime。",
    "- Linux glibc 2.35 或更新版本，并需要 WebKitGTK 4.1。Ubuntu 22.04+、Debian 12+、Fedora 39+ 是已文档化基线。",
    "- macOS 是下一版本目标，本次发布不包含 macOS 资产。",
    "",
    "### 选择并安装正确的包",
    "",
    "- 一般 Windows 个人设备：下载当前架构的 _setup.exe。",
    "- 受管 Windows 设备：下载当前架构的 .msi。",
    "- Ubuntu / Debian：下载当前架构的 .deb，并执行 sudo apt install ./<文件名>.deb。",
    "- Fedora / RPM 系：下载当前架构的 .rpm，并执行 sudo dnf install ./<文件名>.rpm。",
    "- 需要便携运行：下载当前架构的 AppImage，执行 chmod +x <文件名>.AppImage 后运行；宿主机仍必须提供 WebKitGTK 4.1。",
    "",
    "所有普通文件都会在项目树中显示；只有可安全预览的代码、Markdown、文本和受支持图片才会进入主要阅读区。详情、卸载方式、升级恢复和排障见仓库根目录的 README.zh-CN.md。",
    "",
    "### 验证下载",
    "",
    "1. 使用 SHA256SUMS 核对所下载文件。",
    "2. 使用 GitHub artifact attestation 验证构建来源。",
    "3. 验证失败、文件名不匹配或架构不匹配时停止安装。",
    "",
    "~~~bash",
    "sha256sum -c SHA256SUMS",
    "gh attestation verify CodeReader_" +
      version +
      "_<platform>_<arch>.<format> -R lrk7353-arch/CodeReader",
    "~~~",
    "",
    "Windows PowerShell 可用 Get-FileHash .\\<文件名> -Algorithm SHA256 与 SHA256SUMS 比对。",
    "",
    "### Windows 未签名提示",
    "",
    "除非本 Release 明确写明且提供了验证结果，Windows 包未进行 Authenticode 签名。Windows 可能显示 SmartScreen 或未知发布者提示。GitHub 证明、SBOM 和校验和能够说明构建来源，但不能替代 Authenticode 身份签名。",
    "",
    "### 自动化验证范围",
    "",
    "四份 native-smoke-*.json 均绑定本标签、提交、架构和安装包哈希。它们覆盖 GitHub 原生运行器上的包元数据、安装、可见窗口启动和卸载检查。它们不能代替维护者对原生硬件上的文件选择、数据库迁移、解释生成、重启持久化和卸载数据策略验收。",
    "",
    "## English",
    "",
    "### Supported systems",
    "",
    "- Windows 10 22H2 and Windows 11, x64 or ARM64; Microsoft Edge WebView2 Evergreen Runtime is required.",
    "- Linux with glibc 2.35 or newer and WebKitGTK 4.1; Ubuntu 22.04+, Debian 12+, and Fedora 39+ are the documented baselines.",
    "- macOS is planned for the next version and has no assets in this release.",
    "",
    "### Choose an installer",
    "",
    "- Windows: choose the matching _setup.exe for a normal per-user install, or .msi for managed deployment.",
    "- Debian / Ubuntu: install the matching .deb with your package manager.",
    "- Fedora / RPM distributions: install the matching .rpm with your package manager.",
    "- AppImage: make the matching file executable and run it; the host still provides WebKitGTK 4.1.",
    "",
    "The repository README.zh-CN.md contains the complete installation, verification, upgrade, uninstall, and troubleshooting guide.",
    "",
    "### Verification",
    "",
    "Verify SHA256SUMS and the GitHub artifact attestation before installation. Do not install if the checksum, artifact name, or architecture differs from the Release page.",
    "",
    "### Windows signing notice",
    "",
    "Windows packages are not Authenticode-signed unless this Release explicitly says that signing passed. GitHub provenance, SBOM, and checksums establish build provenance; they do not replace an Authenticode identity signature.",
    "",
    "### Automated package-smoke scope",
    "",
    "The four native-smoke-*.json records are bound to this tag, commit, architecture, and package hashes. They cover package metadata plus automated install, visible-window launch, and uninstall checks on native GitHub-hosted runners. They do not replace the maintainer's native-hardware checks for picker interaction, database migration, explanation flow, restart persistence, or uninstall data policy.",
    "",
    "## Installer and package assets (" + assets.length + ")",
    "",
    assetList,
    "",
    "Complete Chinese user guide: " + chineseGuideUrl,
    "",
    "This Release also includes SHA256SUMS, CodeReader.spdx.json, release-metadata.json, RELEASE-NOTES.md, and four native-smoke records.",
    ""
  ].join("\n");
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
  const tauriConfig = JSON.parse(
    readFileSync(join(projectRoot, "src-tauri/tauri.conf.json"), "utf8")
  );
  const tauriVersion = normalizeVersion(tauriConfig.version);
  const cargoText = readFileSync(join(projectRoot, "src-tauri/Cargo.toml"), "utf8");
  const cargoVersion = normalizeVersion(cargoText.match(/^version\s*=\s*"([^"]+)"/m)?.[1]);
  const cargoLockText = readFileSync(join(projectRoot, "src-tauri/Cargo.lock"), "utf8");
  const cargoLockVersion = normalizeVersion(
    cargoLockText.match(/\[\[package\]\]\s+name\s*=\s*"codereader"\s+version\s*=\s*"([^"]+)"/m)?.[1]
  );
  const versions = new Set([
    packageVersion,
    lockVersion,
    tauriVersion,
    cargoVersion,
    cargoLockVersion
  ]);
  if (versions.size !== 1) {
    fail(
      `Version mismatch: package=${packageVersion}, lock=${lockVersion}, tauri=${tauriVersion}, cargo=${cargoVersion}, cargoLock=${cargoLockVersion}`
    );
  }
  const msiVersion = String(tauriConfig.bundle?.windows?.wix?.version ?? "");
  const expectedMsiVersion = packageVersion.replace(/-rc\.\d+$/, "");
  if (msiVersion !== expectedMsiVersion) {
    fail(`MSI version ${msiVersion} does not match release version ${expectedMsiVersion}.`);
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
