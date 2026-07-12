# CodeReader

[English](README.md) | [简体中文](README.zh-CN.md) | [Version history / 版本沿革](docs/history/version-history.zh-CN.md) | [Release guide / 发布说明](docs/release/public-release-notes.zh-CN.md)

CodeReader is a local-first desktop application for reading source code and Markdown with persistent, reviewable AI explanations. It opens user-selected files and directories, preserves reading progress, and detects when explanations become stale after files change.

> Current channel: `1.0.0-rc.2` release candidate. Release candidates are intended for full production validation before the stable `1.0.0` publication.

## Product scope

- Open any local file or directory selected through the native operating-system picker.
- Browse ordinary files even when their format is not previewable.
- Read JavaScript, TypeScript, Python, SQL, text, Markdown, and bounded image previews.
- Generate structured explanations from bounded, previewable context.
- Keep explanations, reading state, project guidance, prompt versions, and model settings locally.
- Detect code changes and mark affected explanations stale.
- Use OpenAI-compatible HTTPS providers or explicitly configured local loopback models.
- Run without a CodeReader-hosted backend or mandatory telemetry.

CodeReader `1.0` is not a cloud collaboration service, autonomous code editor, or plugin marketplace. macOS packaging is planned for the next version.

## Downloads and system requirements

Production downloads are published on [GitHub Releases](https://github.com/lrk7353-arch/CodeReader/releases).

| System | Architecture | Choose one |
| --- | --- | --- |
| Windows 10 22H2 or Windows 11 | x64 | NSIS `setup.exe` or MSI |
| Windows 10 22H2 or Windows 11 | ARM64 | NSIS `setup.exe` or MSI |
| Linux, glibc 2.35+ | x64 | AppImage, `.deb`, or `.rpm` |
| Linux, glibc 2.35+ | ARM64 | AppImage, `.deb`, or `.rpm` |

Official Linux baselines are Ubuntu 22.04+, Debian 12+, and Fedora 39+. Other modern glibc-based distributions may work but are community-compatible until verified.

Windows requires the [Microsoft Edge WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/). It is normally present on supported Windows installations; if CodeReader opens to a blank window, install or repair WebView2 from Microsoft and restart CodeReader. Linux packages require the distribution's WebKitGTK 4.1 runtime; `.deb` and `.rpm` package managers resolve it as a dependency, while AppImage users must provide it on the host.

Use the NSIS executable for a straightforward current-user Windows installation. MSI is intended for managed installation. On Linux, use `.deb` for Debian/Ubuntu, `.rpm` for Fedora/RPM-based systems, or AppImage for a portable installation.

### Windows unsigned-build notice

CodeReader does not currently have an Authenticode certificate. Unless a specific Release explicitly says otherwise, Windows packages are unsigned and may trigger SmartScreen or an unknown-publisher prompt. GitHub artifact attestations, SHA-256 checksums, and the SPDX SBOM establish build provenance but do not replace Authenticode identity.

Verify a downloaded package before installing:

```bash
sha256sum -c SHA256SUMS
gh attestation verify <downloaded-package> -R lrk7353-arch/CodeReader
```

## First run and local data

1. Start CodeReader.
2. Choose **Open project** or **Open file** and select any target available to your operating-system account.
3. Configure an OpenAI-compatible model or a local loopback model if AI explanations are needed.
4. Review the exact bounded context and provider destination before approving external transmission.

CodeReader stores its SQLite database in the platform application-data directory and stores API credentials in the operating-system credential store. Source code is not uploaded to a CodeReader service.

When upgrading from supported `0.10.x` or `0.11.x` builds, CodeReader creates a database backup before migration, applies transactional migrations, and verifies the result. If migration cannot be completed safely, the application retains the original database and enters a non-destructive recovery state.

## Reading behavior

- Supported code files provide structure-aware navigation and AI explanation targets.
- Markdown supports safe preview/source modes and heading navigation; raw HTML and dangerous URL schemes are not executed.
- Plain text remains readable without structured explanation.
- Images use bounded local preview data.
- Unknown, binary, oversized, symlink, or special files stay visible with metadata and a reason when preview is unavailable.
- Heavy dependency/generated directories are represented lazily and scanned only when requested.

Background work is target-bound. Completing an old scan, refresh, or explanation must not replace the file currently being read.

## Update policy

The application may check the official GitHub repository for a newer release and open its Release page. CodeReader `1.0` does not silently download or install updates.

## Install, remove, and troubleshoot

### Install

- Windows: download the matching `_setup.exe` for an ordinary per-user installation. Use the matching `.msi` only for managed deployment or a software-distribution tool. Verify the checksum and artifact attestation before starting either installer.
- Debian / Ubuntu: install the matching `.deb` with `sudo apt install ./<asset>.deb`.
- Fedora / RPM distributions: install the matching `.rpm` with `sudo dnf install ./<asset>.rpm`.
- AppImage: run `chmod +x <asset>.AppImage`, then start the file. The host must still provide WebKitGTK 4.1.

### Remove

- Windows: uninstall CodeReader from **Settings → Apps → Installed apps**, the NSIS uninstaller, or your managed-software tool.
- Debian / Ubuntu: run `sudo apt remove codereader`.
- Fedora / RPM distributions: run `sudo dnf remove codereader`.
- AppImage: close CodeReader and delete the AppImage plus any desktop launcher you created.

Uninstall is not a data-erasure tool. Preserve local reading data and verified migration backups before manually removing application data.

### Troubleshoot

| Symptom | What to do |
| --- | --- |
| Blank window on Windows | Install or repair the [Microsoft Edge WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/), then restart CodeReader. |
| SmartScreen or unknown-publisher notice | Current Windows packages are unsigned unless a specific Release states verified Authenticode signing. Verify SHA-256 and the GitHub artifact attestation before deciding whether to continue. |
| `.deb` or `.rpm` cannot install | Confirm the downloaded architecture and install the local package through the distribution package manager so it can resolve WebKitGTK and GTK dependencies. |
| AppImage does not start | Check its executable permission and the host WebKitGTK 4.1 runtime; try the matching `.deb` or `.rpm` when available. |
| A file is visible but not shown in the reader | It may be binary, oversized, special, or use an unsafe encoding. CodeReader keeps it in the tree and retains the currently readable document. |
| Model request fails | Check the model endpoint, model name, network or local service. Do not put API keys, source code, prompts, or model output into a feedback report. |

The [Chinese guide](README.zh-CN.md) provides the same workflow in Simplified Chinese, including recovery guidance for supported 0.10.x and 0.11.x upgrades.

## Development from source

Requirements:

- Node.js 22
- npm
- Rust stable
- Tauri 2 desktop dependencies for the host operating system

Install and verify:

```bash
npm ci
npm run verify:linux
```

Individual gates:

```bash
npm test
npm run lint
npm run format:check
npm run build
npm run cargo:test
npm run cargo:clippy
npm run cargo:check
```

Run the browser preview:

```bash
npm run dev
```

Run the full desktop application:

```bash
npm run tauri dev
```

### Linux development

On Debian/Ubuntu, install the Tauri WebKitGTK dependencies, then run:

```bash
npm run doctor:linux
npm run verify:linux
```

Build native Linux packages on the matching architecture:

```bash
npm run release:linux -- --arch x64
# On an ARM64 Linux host:
npm run release:linux -- --arch arm64
```

### Windows package builds

On native Windows PowerShell:

```powershell
npm run release:windows
npm run release:windows:arm64
```

ARM64 packages require the native ARM64 MSVC Rust toolchain. The GitHub release workflow builds all four platform/architecture combinations on native GitHub-hosted runners.

## Repository workflow

CodeReader uses a lightweight trunk-based workflow:

- `main` is the only permanent branch and should remain releasable.
- `feature/<topic>` and `fix/<topic>` are short-lived pull-request branches.
- `release/<version>` is optional for release-candidate preparation.
- Required quality and security checks must pass before merge.
- Source branches are deleted after merge; force-pushing `main` is prohibited.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), the [Chinese user guide](README.zh-CN.md), and the [production release runbook](docs/release/github-release.md).

## License

MIT. See [LICENSE](LICENSE).
