# Open Source Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare CodeReader for a first public GitHub open source release with contributor-facing docs, repeatable release management, source push hygiene, and non-installing update discovery.

**Architecture:** Keep release management explicit and low-risk: docs and GitHub templates form the public project contract, existing Windows/Linux scripts remain the build gates, and update discovery is implemented as a small testable Tauri backend command plus a compact React UI entry. Automatic update installation is intentionally excluded.

**Tech Stack:** Tauri 2, Rust 2021, React 19, TypeScript 6, Vite 7, Vitest, GitHub Actions, GitHub Releases.

## Global Constraints

- Do not stage or modify the existing untracked `jian.md` unless the maintainer explicitly asks.
- Default license is MIT unless the maintainer gives a different license before implementation.
- First public release must not auto-download or auto-install updates.
- Windows release artifacts must keep `release-manifest.json`, `signing-manifest.json`, and `SHA256SUMS.txt`.
- Linux first release must include build/verification instructions even if Linux binary packaging is deferred.
- Keep README and public GitHub files UTF-8 clean.
- Preserve existing internal Chinese docs unless a task explicitly updates their entry links.

---

## File Structure

- Modify `README.md`: public-facing project overview, install, development, release, contribution, roadmap.
- Create `LICENSE`: MIT license text.
- Create `CONTRIBUTING.md`: contributor workflow and local gates.
- Create `SECURITY.md`: supported versions and vulnerability reporting.
- Create `.github/ISSUE_TEMPLATE/bug_report.yml`: structured bug report form.
- Create `.github/ISSUE_TEMPLATE/feature_request.yml`: structured feature request form.
- Create `.github/pull_request_template.md`: PR checklist.
- Create `docs/release/github-release.md`: release checklist and GitHub upload instructions.
- Modify `CHANGELOG.md`: add public release note skeleton under `Unreleased`.
- Modify `src-tauri/Cargo.toml`: add any dependency required for version parsing only if existing dependencies cannot cover it.
- Create `src-tauri/src/update_check.rs`: update metadata types, version comparison, GitHub release parsing, and Tauri command.
- Modify `src-tauri/src/lib.rs`: register the update-check command.
- Create `src-tauri/src/update_check/version_tests.rs` or inline tests in `update_check.rs`: Rust unit tests for version comparison and response parsing.
- Modify `src/app/copy.ts`: add update-check copy strings.
- Create `src/app/hooks/useUpdateCheck.ts`: frontend state management for invoking the Tauri command.
- Create `src/app/hooks/useUpdateCheck.test.tsx`: hook interaction tests.
- Modify `src/app/App.tsx`: add a compact update-check button/status entry in the topbar or statusbar.
- Modify `src/app/App.test.tsx` or add focused interaction test coverage: verify the UI renders and handles update states.

---

### Task 1: Public Repository Documentation

**Files:**

- Modify: `README.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/pull_request_template.md`

**Interfaces:**

- Consumes: Existing scripts in `package.json`, existing version `0.11.0-beta.4`, existing release outputs under `artifacts/windows-x64/`.
- Produces: A contributor-facing repository contract used by release notes and PR review.

- [ ] **Step 1: Inspect existing public docs and scripts**

Run:

```bash
git status --short
node -e "const p=require('./package.json'); console.log(p.version); console.log(Object.keys(p.scripts).sort().join('\n'))"
```

Expected: version prints `0.11.0-beta.4`; `jian.md` may appear untracked and must remain untouched.

- [ ] **Step 2: Replace `README.md` with UTF-8 public copy**

Write a README with these exact sections:

```markdown
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
```

- [ ] **Step 3: Add `LICENSE`**

Use the standard MIT License text with copyright:

```text
Copyright (c) 2026 CodeReader contributors
```

- [ ] **Step 4: Add `CONTRIBUTING.md`**

Create concise contribution guidance covering:

```markdown
# Contributing to CodeReader

Thank you for helping improve CodeReader.

## Development Setup

Run:

```bash
npm ci
npm run verify:linux
```

On Windows, use:

```powershell
npm run release:windows
```

when validating release-chain changes.

## Branches

- `main`: public release baseline.
- `dev`: integration branch.
- `feature/<name>`: new work.
- `fix/<name>`: bug fixes.
- `codex/<name>`: agent-assisted work branches.

## Pull Requests

Before opening a PR:

- Run the relevant tests.
- Update docs when behavior changes.
- Add or update tests for user-visible behavior.
- Keep generated artifacts out of commits unless the PR is specifically about release evidence.

## Commit Style

Use short conventional prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `release:`, and `chore:`.

## Privacy And Security

Do not commit API keys, local database files, private code samples, or user logs containing secrets.
```

- [ ] **Step 5: Add `SECURITY.md`**

Create:

```markdown
# Security Policy

## Supported Versions

Security fixes target the latest public beta or stable release.

## Reporting A Vulnerability

Please open a private security advisory on GitHub if available, or contact the maintainer through the repository owner profile.

Include:

- Affected version or commit.
- Operating system.
- Reproduction steps.
- Impact.
- Whether local files, model credentials, or generated explanations are exposed.

## Beta Build Notice

Some beta installers may be unsigned. Windows may show SmartScreen or unknown publisher warnings. Always verify checksums from the GitHub Release before installing.
```

- [ ] **Step 6: Add issue and PR templates**

Create `.github/ISSUE_TEMPLATE/bug_report.yml`:

```yaml
name: Bug report
description: Report a reproducible CodeReader problem
title: "[Bug]: "
labels: ["bug"]
body:
  - type: input
    id: version
    attributes:
      label: CodeReader version
      placeholder: "0.11.0-beta.4"
    validations:
      required: true
  - type: dropdown
    id: os
    attributes:
      label: Operating system
      options:
        - Windows
        - Linux
        - macOS
        - Other
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: "1. Open...\n2. Click...\n3. See..."
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs or screenshots
      description: Remove secrets, API keys, private source code, and personal paths before posting.
```

Create `.github/ISSUE_TEMPLATE/feature_request.yml`:

```yaml
name: Feature request
description: Suggest an improvement to CodeReader
title: "[Feature]: "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What user problem would this solve?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposal
      description: What should CodeReader do?
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
  - type: dropdown
    id: contribution
    attributes:
      label: Are you interested in contributing this?
      options:
        - "Yes"
        - "No"
        - "Maybe"
```

Create `.github/pull_request_template.md`:

```markdown
## Summary

## Verification

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run build`
- [ ] `npm run cargo:test`
- [ ] `npm run cargo:clippy`
- [ ] `npm run cargo:check`

## Checklist

- [ ] I updated docs for user-visible behavior.
- [ ] I added or updated tests for changed behavior.
- [ ] I did not commit secrets, local databases, private logs, or unrelated generated artifacts.
- [ ] I noted release/signing/update impact when relevant.
```

- [ ] **Step 7: Verify documentation formatting**

Run:

```bash
npm run format:check
```

Expected: PASS. If Prettier reports markdown formatting changes, run `npm run format`, inspect the diff, and keep only intended docs formatting changes.

- [ ] **Step 8: Review diff and commit**

Run:

```bash
git diff -- README.md LICENSE CONTRIBUTING.md SECURITY.md .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml .github/pull_request_template.md
git status --short
```

Expected: only Task 1 files are staged after:

```bash
git add README.md LICENSE CONTRIBUTING.md SECURITY.md .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml .github/pull_request_template.md
git commit -m "docs: prepare public contributor entry points"
```

---

### Task 2: Release Management Documentation

**Files:**

- Create: `docs/release/github-release.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: Task 1 README release policy.
- Produces: Repeatable release checklist used before GitHub Release publication.

- [ ] **Step 1: Create release docs directory**

Run:

```bash
mkdir -p docs/release
```

- [ ] **Step 2: Add `docs/release/github-release.md`**

Write:

```markdown
# GitHub Release Checklist

This checklist publishes a public CodeReader release through GitHub Releases.

## 1. Version

Update the version in:

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

For MSI builds, keep `bundle.windows.wix.version` compatible with MSI version rules.

## 2. Quality Gates

Run:

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

Linux validation:

```bash
npm run doctor:linux
npm run verify:linux
```

## 3. Windows Artifacts

On Windows PowerShell:

```powershell
npm run release:windows
npm run smoke:windows-release
```

Upload from `artifacts/windows-x64/`:

- `CodeReader_*_x64-setup.exe`
- `CodeReader_*_x64_zh-CN.msi`
- `release-manifest.json`
- `signing-manifest.json`
- `SHA256SUMS.txt`

If artifacts are unsigned, state that clearly in the release notes.

## 4. Linux Evidence

Run:

```bash
npm run evidence:linux
npm run smoke:linux-desktop
```

Upload Linux evidence files when they are useful for the release:

- `artifacts/linux-evidence/verify-linux.json`
- `artifacts/linux-evidence/desktop-smoke.json`

Linux binary packages are optional until packaging is stable.

## 5. Tag And Release

Create a tag:

```bash
git tag v0.11.0-beta.4
git push origin v0.11.0-beta.4
```

Create the GitHub Release from that tag. Use `CHANGELOG.md` as the source for release notes.

## 6. Post-Release Checks

- Download uploaded artifacts from GitHub.
- Verify SHA-256 checksums.
- Install on a clean Windows user profile when publishing Windows installers.
- Confirm the in-app update check sees the new release.
```

- [ ] **Step 3: Update `CHANGELOG.md`**

Under `## Unreleased`, add:

```markdown
### Public repository preparation

- Prepare public README, contribution, security, issue, and PR guidance.
- Document the GitHub Release checklist for Windows artifacts, Linux evidence, checksums, and signing status.
- Add low-risk update discovery planning for GitHub Releases without automatic installation.
```

- [ ] **Step 4: Verify docs**

Run:

```bash
npm run format:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/release/github-release.md CHANGELOG.md
git commit -m "docs: add github release checklist"
```

---

### Task 3: GitHub Remote And Source Push Hygiene

**Files:**

- No required file changes unless `.gitignore` needs a missing generated path.

**Interfaces:**

- Consumes: Clean commits from Tasks 1 and 2.
- Produces: Local repository linked to GitHub remote and ready for push.

- [ ] **Step 1: Inspect remote and ignored files**

Run:

```bash
git remote -v
git status --short --ignored
```

Expected: no `origin` may be configured yet. Confirm `node_modules`, `dist`, and generated artifacts are ignored or intentionally untracked.

- [ ] **Step 2: Add or verify `origin`**

If no `origin` exists:

```bash
git remote add origin https://github.com/lrk7353-arch/CodeReader.git
```

If `origin` exists:

```bash
git remote set-url origin https://github.com/lrk7353-arch/CodeReader.git
```

Verify:

```bash
git remote -v
```

Expected: fetch and push URLs both point to `https://github.com/lrk7353-arch/CodeReader.git`.

- [ ] **Step 3: Inspect tracked and untracked files**

Run:

```bash
git status --short
git ls-files | grep -E '(^node_modules/|^dist/|^artifacts/|\.db$|\.sqlite$|\.env$)' || true
```

Expected: no secrets or bulky generated dependency/build directories are tracked. `jian.md` remains untracked unless explicitly approved.

- [ ] **Step 4: Push task branch for review**

Run:

```bash
git push -u origin codex/beta3-prep-linux
```

Expected: branch appears on GitHub. If authentication fails, use GitHub CLI or the Codex app/local Git credential flow, then rerun.

- [ ] **Step 5: Prepare branch integration**

Open a PR from `codex/beta3-prep-linux` into `dev` or push `dev` only after maintainer approval. Do not overwrite GitHub `main`.

---

### Task 4: Backend Update Discovery

**Files:**

- Create: `src-tauri/src/update_check.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml` only if required

**Interfaces:**

- Consumes: GitHub Releases endpoint `https://api.github.com/repos/lrk7353-arch/CodeReader/releases/latest`.
- Produces Tauri command:

```rust
#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateCheckResult, AppError>
```

with serializable output:

```rust
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub release_url: Option<String>,
    pub release_name: Option<String>,
    pub published_at: Option<String>,
}
```

- [ ] **Step 1: Write failing Rust tests**

Add tests in `src-tauri/src/update_check.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_stable_versions() {
        assert!(is_newer_version("0.11.1", "0.11.0"));
        assert!(!is_newer_version("0.11.0", "0.11.0"));
        assert!(!is_newer_version("0.10.9", "0.11.0"));
    }

    #[test]
    fn compares_beta_versions() {
        assert!(is_newer_version("0.11.0-beta.5", "0.11.0-beta.4"));
        assert!(is_newer_version("0.11.0", "0.11.0-beta.4"));
        assert!(!is_newer_version("0.11.0-beta.3", "0.11.0-beta.4"));
    }

    #[test]
    fn parses_github_latest_release() {
        let json = r#"{
            "tag_name": "v0.11.0-beta.5",
            "name": "CodeReader 0.11.0 beta 5",
            "html_url": "https://github.com/lrk7353-arch/CodeReader/releases/tag/v0.11.0-beta.5",
            "published_at": "2026-07-07T12:00:00Z"
        }"#;

        let release = parse_github_release(json).expect("release parses");

        assert_eq!(release.version, "0.11.0-beta.5");
        assert_eq!(
            release.html_url,
            "https://github.com/lrk7353-arch/CodeReader/releases/tag/v0.11.0-beta.5"
        );
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run cargo:test -- update_check
```

Expected: FAIL because `update_check` does not exist yet.

- [ ] **Step 3: Implement `update_check.rs`**

Implement:

```rust
use crate::app_error::AppError;
use serde::{Deserialize, Serialize};

const LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/lrk7353-arch/CodeReader/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub release_url: Option<String>,
    pub release_name: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedRelease {
    version: String,
    name: Option<String>,
    html_url: String,
    published_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubReleaseResponse {
    tag_name: String,
    name: Option<String>,
    html_url: String,
    published_at: Option<String>,
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateCheckResult, AppError> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::new();
    let response = client
        .get(LATEST_RELEASE_URL)
        .header(reqwest::header::USER_AGENT, "CodeReader update checker")
        .send()
        .await
        .map_err(|err| AppError::external("update.network", err.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::external(
            "update.unavailable",
            format!("GitHub release request failed with status {status}"),
        ));
    }
    let body = response
        .text()
        .await
        .map_err(|err| AppError::external("update.response", err.to_string()))?;
    let release = parse_github_release(&body)
        .map_err(|err| AppError::external("update.response", err))?;

    Ok(UpdateCheckResult {
        update_available: is_newer_version(&release.version, &current_version),
        current_version,
        latest_version: Some(release.version),
        release_url: Some(release.html_url),
        release_name: release.name,
        published_at: release.published_at,
    })
}

fn parse_github_release(body: &str) -> Result<ParsedRelease, String> {
    let response: GithubReleaseResponse =
        serde_json::from_str(body).map_err(|err| err.to_string())?;
    let version = response
        .tag_name
        .strip_prefix('v')
        .unwrap_or(response.tag_name.as_str())
        .to_string();
    if version.is_empty() || response.html_url.is_empty() {
        return Err("release response is missing required fields".to_string());
    }
    Ok(ParsedRelease {
        version,
        name: response.name,
        html_url: response.html_url,
        published_at: response.published_at,
    })
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    parse_version(latest) > parse_version(current)
}

fn parse_version(value: &str) -> (u64, u64, u64, u8, u64) {
    let clean = value.strip_prefix('v').unwrap_or(value);
    let mut split = clean.splitn(2, '-');
    let core = split.next().unwrap_or_default();
    let prerelease = split.next();
    let mut parts = core.split('.');
    let major = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let patch = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let prerelease_rank = if prerelease.is_some() { 0 } else { 1 };
    let beta_number = prerelease
        .and_then(|part| part.strip_prefix("beta."))
        .and_then(|part| part.parse().ok())
        .unwrap_or(0);
    (major, minor, patch, prerelease_rank, beta_number)
}
```

If `AppError::external` does not exist, inspect `src-tauri/src/app_error.rs` and use the existing constructor that returns a stable code and message. Keep error codes `update.network`, `update.unavailable`, and `update.response`.

- [ ] **Step 4: Register the command**

Modify `src-tauri/src/lib.rs`:

```rust
mod update_check;
```

and add:

```rust
update_check::check_for_updates,
```

inside `tauri::generate_handler![...]`.

- [ ] **Step 5: Run Rust tests**

Run:

```bash
npm run cargo:test -- update_check
npm run cargo:check
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src-tauri/src/update_check.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add github release update check command"
```

Only include `src-tauri/Cargo.toml` if it changed.

---

### Task 5: Frontend Update Discovery UI

**Files:**

- Modify: `src/app/copy.ts`
- Create: `src/app/hooks/useUpdateCheck.ts`
- Create: `src/app/hooks/useUpdateCheck.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx` if needed

**Interfaces:**

- Consumes Tauri command `check_for_updates`.
- Produces hook:

```ts
export type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "upToDate"; currentVersion: string; latestVersion: string }
  | {
      status: "updateAvailable";
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
      releaseName?: string;
    }
  | { status: "unavailable"; message: string };
```

- [ ] **Step 1: Write failing hook test**

Create `src/app/hooks/useUpdateCheck.test.tsx` with tests that mock `@tauri-apps/api/core` `invoke` and verify:

```ts
it("shows updateAvailable when backend reports a newer release", async () => {
  // invoke resolves with currentVersion 0.11.0-beta.4 and latestVersion 0.11.0-beta.5
});

it("shows unavailable when backend rejects", async () => {
  // invoke rejects with an Error("network")
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- src/app/hooks/useUpdateCheck.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement `useUpdateCheck.ts`**

Implement:

```ts
import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "upToDate"; currentVersion: string; latestVersion: string }
  | {
      status: "updateAvailable";
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
      releaseName?: string;
    }
  | { status: "unavailable"; message: string };

type BackendUpdateCheckResult = {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  release_name: string | null;
};

export function useUpdateCheck() {
  const [state, setState] = useState<UpdateCheckState>({ status: "idle" });

  const check = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const result = await invoke<BackendUpdateCheckResult>("check_for_updates");
      const currentVersion = result.current_version;
      const latestVersion = result.latest_version ?? currentVersion;
      if (result.update_available && result.release_url) {
        setState({
          status: "updateAvailable",
          currentVersion,
          latestVersion,
          releaseUrl: result.release_url,
          releaseName: result.release_name ?? undefined
        });
        return;
      }
      setState({ status: "upToDate", currentVersion, latestVersion });
    } catch (error) {
      setState({
        status: "unavailable",
        message: error instanceof Error ? error.message : "Update check failed"
      });
    }
  }, []);

  return { state, check };
}
```

- [ ] **Step 4: Add copy strings**

In `src/app/copy.ts`, add update labels in the existing copy structure:

```ts
updates: {
  check: "Check updates",
  checking: "Checking...",
  upToDate: "Up to date",
  available: "Update available",
  unavailable: "Update check unavailable",
  openRelease: "Open release"
}
```

If the file stores Chinese and English variants, add both:

```ts
updates: {
  check: "检查更新",
  checking: "检查中...",
  upToDate: "已是最新",
  available: "发现新版本",
  unavailable: "暂时无法检查更新",
  openRelease: "打开发布页"
}
```

- [ ] **Step 5: Add UI entry in `App.tsx`**

Import an icon:

```ts
import { RefreshCw } from "lucide-react";
```

Use the hook:

```ts
const updateCheck = useUpdateCheck();
```

Add a compact button in the topbar actions:

```tsx
<button
  type="button"
  onClick={() => void updateCheck.check()}
  disabled={updateCheck.state.status === "checking"}
  title={copy.updates.check}
>
  <RefreshCw size={16} aria-hidden="true" />
  <span>
    {updateCheck.state.status === "checking" ? copy.updates.checking : copy.updates.check}
  </span>
</button>
```

Add a statusbar item:

```tsx
<UpdateCheckStatus state={updateCheck.state} copy={copy.updates} />
```

Create a small local component:

```tsx
function UpdateCheckStatus({
  state,
  copy
}: {
  state: UpdateCheckState;
  copy: ReturnType<typeof getAppCopy>["updates"];
}) {
  if (state.status === "idle" || state.status === "checking") {
    return null;
  }
  if (state.status === "updateAvailable") {
    return (
      <a href={state.releaseUrl} target="_blank" rel="noreferrer">
        {copy.available}: {state.latestVersion}
      </a>
    );
  }
  if (state.status === "upToDate") {
    return <span>{copy.upToDate}: {state.currentVersion}</span>;
  }
  return <span title={state.message}>{copy.unavailable}</span>;
}
```

Use Tauri shell/open plugin only in a later task if plain external links do not work in the packaged app.

- [ ] **Step 6: Run frontend tests**

Run:

```bash
npm test -- src/app/hooks/useUpdateCheck.test.tsx
npm test -- src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/app/copy.ts src/app/hooks/useUpdateCheck.ts src/app/hooks/useUpdateCheck.test.tsx src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: expose github release update checks"
```

Only include `src/app/App.test.tsx` if it changed.

---

### Task 6: Final Verification And Release Readiness

**Files:**

- No required file changes unless verification reveals necessary fixes.

**Interfaces:**

- Consumes: Tasks 1-5.
- Produces: Verified branch ready for PR/release.

- [ ] **Step 1: Run full frontend gates**

Run:

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Expected: PASS.

- [ ] **Step 2: Run Rust gates**

Run:

```bash
npm run cargo:test
npm run cargo:clippy
npm run cargo:check
```

Expected: PASS.

- [ ] **Step 3: Run Linux verification when on Linux/WSL**

Run:

```bash
npm run verify:linux
```

Expected: PASS. If system dependencies are missing, record exact missing packages and do not claim Linux verification passed.

- [ ] **Step 4: Review git diff and status**

Run:

```bash
git status --short
git log --oneline -6
```

Expected: no unexpected files staged or modified; `jian.md` remains untracked if still present.

- [ ] **Step 5: Push branch**

Run:

```bash
git push -u origin codex/beta3-prep-linux
```

Expected: branch is available on GitHub.

- [ ] **Step 6: Prepare PR description**

Use:

```markdown
## Summary

- Prepared public README, contribution, security, issue, and PR guidance.
- Added GitHub Release checklist for Windows artifacts, Linux evidence, signing status, and checksums.
- Added non-installing GitHub release update checks in the desktop app.

## Verification

- `npm test`
- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run cargo:test`
- `npm run cargo:clippy`
- `npm run cargo:check`
- `npm run verify:linux`

## Release Notes

This prepares CodeReader for first public GitHub hosting and manual release distribution. Automatic update installation remains out of scope.
```

