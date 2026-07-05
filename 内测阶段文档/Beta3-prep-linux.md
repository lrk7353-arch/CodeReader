# Beta 3 Prep: Linux/Debian Development Support

This document is the Beta 3 working note for preparation/support work. It does
not change the current release promise: controlled Windows x64 release remains
the only formal packaging target until a separate release decision is made.

## Beta 3 Mainline

Beta 3 should stay anchored to these priorities:

1. Prompt version registry, gray rollout, rollback, and persistence records.
2. Linux/Debian development build validation.
3. Continued Rust long-module and workspace-state splitting by responsibility.
4. Provider registry remains useful, but second non-OpenAI protocols are lower
   priority for now. OpenAI-compatible chat/completions remains the default.
   OpenAI-compatible responses-style support can be evaluated without committing
   to Anthropic or other provider-specific APIs.

## Preparation And Support Items

The broader Beta 3 support backlog is still valid, but it is not the mainline:

- Windows release-chain validation: installer smoke test, release manifest,
  signing manifest, and SHA-256 evidence.
- Real-project validation: larger repositories, WSL/Windows path boundaries,
  large files, long structure lists, and failure reason logging.
- Long function-list UX: keep file structure useful without hiding project
  context when a single file has many symbols.
- Copy/i18n expansion: move model settings, generation dialog, and user-facing
  errors into the copy resource layer.
- Beta acceptance evidence: each candidate needs commands, versions, platform,
  known limits, and manual validation notes.

## Debian Workstation Setup

Install Node.js 22.x or newer LTS (for example, 24.x), npm, Rust stable, and the Linux packages needed by Tauri:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  curl \
  wget \
  file \
  pkg-config \
  libwebkit2gtk-4.1-dev \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

Recommended validation flow on Debian:

```bash
npm ci
npm run verify:linux
npm run tauri dev
```

`npm run verify:linux` first runs the Linux doctor, then runs the Rust and
frontend gates used for development validation. It supports `--json` for
machine-readable evidence and `--skip-build` for faster dependency checks while
iterating. The lower-level `npm run doctor:linux` command remains useful when
only the prerequisite report is needed.

### JSON Evidence And Doctor Guidance

The `--json` summary now carries an `evidence` object with stable fields for
release records: `generatedAt` (ISO timestamp), `platform`, `root`/`cwd`,
`nodeVersion`, `plannedGates`, and `skipBuild`. When the doctor fails, the
summary's `doctor` report object carries the guidance fields
`recommendedAptInstallCommand` (null when nothing is missing) and
`baselineAptInstallCommand` (the full `DEBIAN_TAURI_PACKAGES` install command).

The `--output <path>` flag writes the same JSON summary to a file, creating
parent directories as needed, and does so even when the doctor fails so that
evidence can be captured for release records without relying on stdout. It is
additive: `--json` still prints JSON to stdout, and without `--json` the human
report is preserved. For example:
`npm run verify:linux -- --json --output artifacts/linux-evidence/verify-linux.json`.
This command is available for evidence capture; it does not by itself confirm a
passing Linux validation.

The doctor enforces a minimum of Node.js major version 22: `node --version`
output like `v20.x` is reported as `ok:false` with a hint pointing at Node.js
22.x or newer LTS, while newer LTS releases such as `v24.x` are accepted.
Unparseable output from an exiting-0 `node` command stays `ok:true` to avoid
false negatives. This evidence shape is intended for Beta 3 acceptance records
only and does not by itself confirm a pure Debian success.

## Current Evidence

On the current WSL/Debian-like workspace, the frontend Linux path has been
validated with:

- `npm test`: 23 test files / 158 tests.
- `npm run lint`.
- `npm run format:check`.
- `npm run build`.
- `npm run verify:linux -- --json --skip-build`: correctly forwards from the
  Windows/UNC workspace into WSL and reports missing Linux prerequisites.

Rust cannot be fully validated inside the current WSL shell until `rustc` and
`cargo` are installed there. Windows-side Rust gates were already green during
Beta 2 finalization, but Beta 3 Linux validation requires repeating the Rust
gates in the pure Linux/Debian environment.

## Done Criteria For Beta 3 Linux Validation

- `npm run verify:linux` passes on the Debian workstation.
- `npm run doctor:linux` passes on the Debian workstation.
- `npm run tauri dev` launches the desktop app from that workstation.
- Frontend gates and Rust gates pass on Linux/Debian.
- Any Linux-only dependency or path issue is either fixed or documented as a
  known limitation with a reproduction note.
- The Windows release pipeline remains unchanged unless a separate release task
  explicitly expands the platform promise.
