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

### Mainline Completion Status

- **Prompt version registry, gray rollout, rollback, persistence records**:
  complete. The registry stores version, status, `rollout_percent`,
  `rollback_from`, `notes`, and `system_prompt_template` /
  `user_prompt_template` columns (schema v3). Gray rollout uses a stable
  `sha256(project_id:file_path:target_id)` sample so the same target resolves
  to the same canary across regenerations. Rollback is an atomic
  active/rolled_back swap. The explanation service loads the selected version's
  templates and sends them as the system/user messages to the provider, so a
  canary version truly changes the prompt content. Quality guards: custom user
  templates must include the `{payload}` placeholder; `upsert` preserves
  existing templates when template fields are omitted (COALESCE);
  `load_prompt_templates` propagates database errors instead of swallowing
  them; a mock-provider regression test locks the templates into the LLM
  request messages. A management dialog lists versions, registers/edits
  versions with optional templates, and triggers rollback.
- **Linux/Debian development build validation**: complete.
  `npm run doctor:linux` and `npm run verify:linux` pass on WSL Ubuntu 24.04
  with Rust 1.96.1. `npm run tauri dev` launches the desktop app. See the
  Current Evidence and Done Criteria sections below.
- **Rust long-module splitting**: in progress. `persistence_service.rs` was
  split from 1996 to ~1300 lines by extracting `explanation_hydration`.
  Remaining candidates: `context_builder.rs`, `code_service.rs`.
- **Provider registry**: OpenAI-compatible chat/completions and responses-style
  endpoints are supported. A second non-OpenAI protocol (e.g. Ollama) is
  deferred — it is lower priority for Beta 3 and not a blocker.


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
`npm run evidence:linux`.
This command is available for evidence capture; it does not by itself confirm a
passing Linux validation.

The doctor enforces a minimum of Node.js major version 22: `node --version`
output like `v20.x` is reported as `ok:false` with a hint pointing at Node.js
22.x or newer LTS, while newer LTS releases such as `v24.x` are accepted.
Unparseable output from an exiting-0 `node` command stays `ok:true` to avoid
false negatives. This evidence shape is intended for Beta 3 acceptance records
only and does not by itself confirm a pure Debian success.

### Desktop Smoke Evidence Template

`npm run smoke:linux-desktop` writes a manual evidence template to
`artifacts/linux-evidence/desktop-smoke.json` (override with `--output <path>`),
creating parent directories as needed. The template records `generatedAt`,
`platform`, `root`/`cwd`, `nodeVersion`, the recommended manual command
`npm run tauri dev`, a `checklist` with the fields `tauriDevLaunched`,
`windowVisible`, `openFileWorks`, `openProjectWorks`, `modelSettingsOpen`, and
`notes`, plus a `status` that defaults to `manual_required`. It is intended to
be run after `npm run evidence:linux` on the Debian workstation, then filled in
by hand after observing the desktop app. It does not launch the app and does
not by itself confirm a passing Linux smoke.

## Current Evidence

Beta 3 Linux validation has been completed on a WSL Ubuntu 24.04 LTS
workstation with Rust 1.96.1 (x86_64-unknown-linux-gnu) and the full Tauri
Linux system dependency set installed.

- `npm run doctor:linux`: passes on Linux (node 24.15.0, npm 11.12.1,
  rustc 1.96.1, cargo 1.96.1, pkg-config 1.8.1, gcc 13.3.0, all Tauri
  pkg-config libraries present; `xdo` verified via header fallback at
  `/usr/include/xdo.h` because `libxdo-dev` ships no `.pc` file).
- `npm run verify:linux`: all 7 gates pass on Linux — `cargo:check`,
  `cargo:clippy`, `cargo:test` (82 Rust tests), `test` (25 files / 184 tests),
  `lint`, `format:check`, `build`.
- `npm run tauri dev`: launches the desktop app on Linux. The
  `target/debug/codereader` binary started on WSL Ubuntu 24.04 with the WSLg
  X server (`DISPLAY=:0`) and remained stable (no crash, no GTK errors) for
  over two minutes while the Vite dev server bound `127.0.0.1:1420`.
  `xdotool` was not installed so the window title could not be queried
  programmatically; the open-file / open-project / model-settings checklist
  items still require a manual interactive session. Evidence recorded in
  `artifacts/linux-evidence/desktop-smoke.json`.
- Machine-readable evidence: `artifacts/linux-evidence/verify-linux.json`.

Earlier frontend-only evidence (retained for reference): on the WSL workspace
the frontend Linux path was previously validated with `npm test` (23 files /
158 tests), `npm run lint`, `npm run format:check`, `npm run build`, and
`npm run verify:linux -- --json --skip-build` (which forwarded from the
Windows/UNC workspace into WSL and reported missing Linux prerequisites before
Rust was installed).

## Done Criteria For Beta 3 Linux Validation

- `npm run verify:linux` passes on the Debian workstation. **Done.**
- `npm run doctor:linux` passes on the Debian workstation. **Done.**
- `npm run tauri dev` launches the desktop app from that workstation.
  **Done** — the debug binary starts and runs stably; the interactive
  checklist (open file / open project / model settings) still requires a
  manual desktop session.
- Frontend gates and Rust gates pass on Linux/Debian. **Done.**
- Any Linux-only dependency or path issue is either fixed or documented as a
  known limitation with a reproduction note.
  - Known limitation: `libxdo-dev` does not ship a `xdo.pc` pkg-config file;
    the doctor falls back to checking `/usr/include/xdo.h`. Tauri's Linux build
    links libxdo via header/library paths and is unaffected.
  - Known limitation: `scripts/tauri.mjs` is designed for the Windows host and
    forwards into WSL via a generated `.cmd` wrapper. To launch `tauri dev`
    from inside WSL, run `node node_modules/@tauri-apps/cli/tauri.js dev`
    directly until the wrapper learns to detect a Linux runtime.
  - Fixed: the repo `.npmrc` previously set `script-shell=powershell.exe`,
    which broke every `npm run` script under Linux because PowerShell is not
    on PATH. The file has been removed; npm scripts are all
    `node scripts/*.mjs` and do not depend on a PowerShell host shell.
  - Fixed: `scripts/cargo.mjs` and `scripts/linux-dev-doctor.mjs` now prepend
    `~/.cargo/bin` to PATH on Linux, so `npm run cargo:check` /
    `cargo:clippy` / `cargo:test` and `npm run doctor:linux` locate the Rust
    toolchain even when the shell has not sourced `~/.cargo/env`.
- The Windows release pipeline remains unchanged unless a separate release task
  explicitly expands the platform promise.
