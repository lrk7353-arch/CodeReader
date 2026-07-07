# CodeReader

CodeReader is an open source desktop IDE for reading code with persistent AI-assisted explanations. It helps you open a local project, inspect structure, generate reviewable explanations for selected code, track reading progress, and detect when explanations become stale after code changes.

> Current status: `0.11.0-beta.4`. CodeReader is usable for internal/beta workflows, but the public release channel is still being hardened.

## What It Does

- Opens local files and projects in a desktop Tauri app.
- Builds a guided reading path for small and medium codebases.
- Generates structured explanations for JavaScript, TypeScript, Python, and SQL.
- Stores explanations, reading state, prompt versions, and model settings locally.
- Detects code changes and marks affected explanations as stale.
- Runs without a hosted backend; model access is configured by the user.

## Download

Public downloads are published on the GitHub Releases page:

<https://github.com/lrk7353-arch/CodeReader/releases>

Windows beta builds are distributed as NSIS/MSI installers with SHA-256 checksum files. Unsigned beta builds may show Windows SmartScreen or publisher warnings.

Linux users can build from source while binary packaging is being stabilized.

## Quick Start From Source

Requirements:

- Node.js 22
- npm
- Rust stable
- Tauri desktop dependencies for your OS

Install and verify:

```bash
npm ci
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

Run the full desktop app:

```bash
npm run tauri dev
```

## Linux Development

On Debian/Ubuntu-based systems, install the Tauri system dependencies, then run:

```bash
npm run doctor:linux
npm run verify:linux
```

The GitHub Actions quality workflow uses the same Linux verification path.

## Windows Release Builds

On Windows PowerShell:

```powershell
npm run release:windows
```

Artifacts are written to `artifacts/windows-x64/`:

- `CodeReader_*_x64-setup.exe`
- `CodeReader_*_x64_zh-CN.msi`
- `release-manifest.json`
- `signing-manifest.json`
- `SHA256SUMS.txt`

## Contributing

Issues and pull requests are welcome. Please read `CONTRIBUTING.md` before opening a PR.

Good first contributions include:

- Reproducible bug reports with OS/app version details.
- Documentation fixes.
- Tests around file loading, persistence, prompt versions, and release checks.
- Small UI improvements that preserve the current desktop workflow.

## Release Policy

- `main` tracks public stable release baselines.
- `dev` is the integration branch for accepted work.
- `codex/*`, `feature/*`, and `fix/*` are task branches.
- GitHub Releases are the public distribution channel.
- Automatic update installation is not enabled in the first public release; the app may only check for newer releases and point users to GitHub.

## Roadmap

Near-term:

- Harden the public release chain.
- Stabilize Linux packaging.
- Add safer update discovery.
- Improve English and Chinese copy coverage.

Later:

- Tauri automatic updater support.
- Broader language support.
- Larger-project reading workflows.
- Team collaboration and cloud sync, only after the local-first workflow is stable.

## License

MIT. See `LICENSE`.
