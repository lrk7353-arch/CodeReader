# Open Source Release Design

## Goal

Move CodeReader from internal beta into a public GitHub-hosted open source project that people can understand, download, build, and contribute to, while keeping the first public release low-risk.

## Scope

The first open source release will cover:

- Public repository presentation and contributor onboarding.
- Source push and branch hygiene for `https://github.com/lrk7353-arch/CodeReader`.
- Manual GitHub Release publishing for Windows and Linux-oriented artifacts/evidence.
- A low-risk in-app "check for updates" path that points users to GitHub Releases instead of installing updates automatically.

The first release will not implement background auto-update or automatic installer replacement. That remains a later Tauri updater milestone after signing, manifest, and rollback policy are settled.

## Current Context

CodeReader is a Tauri 2 desktop app with a React 19 frontend and Rust backend. The local repository contains substantially more source and documentation than the current public GitHub repository, which currently has a minimal README and no published releases. The local worktree has no configured `origin` remote.

The project already has useful release foundations:

- `npm run release:windows` builds Windows NSIS/MSI artifacts and emits `release-manifest.json`, `signing-manifest.json`, and `SHA256SUMS.txt`.
- `npm run verify:linux`, `npm run doctor:linux`, and Linux smoke evidence cover Linux development validation.
- `.github/workflows/quality.yml` runs the Linux quality gate.
- `CHANGELOG.md` tracks beta release notes.

## Approach

Use a staged public-release model:

1. Make the repository understandable before asking people to contribute.
2. Publish source and release artifacts with explicit checksums and known limitations.
3. Add update discovery, not automatic update installation, for the first public release.
4. Preserve a clear future path to Tauri updater support.

## Repository Presentation

The repository root should become the main public entry point.

Required files:

- `README.md`: clear product pitch, supported platforms, current beta status, screenshots/assets section, install/download instructions, development quickstart, quality gates, release channel policy, contribution pointer, and roadmap.
- `LICENSE`: an explicit open source license chosen by the maintainer. If no different license is specified during implementation, use MIT.
- `CONTRIBUTING.md`: setup, branch naming, commit style, local checks, PR expectations, issue triage, release contribution boundaries.
- `SECURITY.md`: supported versions, vulnerability reporting process, and note that unsigned beta builds may trigger OS warnings.
- `.github/ISSUE_TEMPLATE/bug_report.yml`: structured bug reports with OS, app version, install method, reproduction steps, logs, and expected/actual behavior.
- `.github/ISSUE_TEMPLATE/feature_request.yml`: contribution-oriented feature requests with problem, proposal, alternatives, and scope.
- `.github/pull_request_template.md`: checklist for tests, docs, screenshots when UI changes, release impact, and security/privacy impact.

README text should be UTF-8 clean. Existing Chinese internal docs may remain, but the public README should avoid corrupted terminal output and should include enough English labels that international contributors can navigate the project.

## Source And Branch Management

Add the GitHub remote:

```bash
git remote add origin https://github.com/lrk7353-arch/CodeReader.git
```

If the remote already exists by implementation time, update or verify it instead of adding a duplicate.

Recommended public branch policy:

- `main`: public stable release baseline.
- `dev`: integration branch for accepted work heading toward the next release.
- `codex/*`, `feature/*`, `fix/*`: task branches.

Before pushing, verify that no generated build output, local caches, credentials, private notes, or unrelated files are included. The existing untracked `jian.md` must not be staged unless the maintainer explicitly asks for it.

## Release Management

The first release should be published manually or semi-manually through GitHub Releases.

Windows:

- Build with `npm run release:windows`.
- Upload the generated installer artifacts from `artifacts/windows-x64/`.
- Upload `release-manifest.json`, `signing-manifest.json`, and `SHA256SUMS.txt`.
- Release notes must mention whether the binaries are signed. If unsigned, the notes must warn about SmartScreen or publisher prompts.

Linux:

- For the first public release, provide source-build instructions and Linux validation evidence.
- Upload Linux evidence such as `artifacts/linux-evidence/verify-linux.json` when appropriate.
- Add `.deb` or AppImage artifacts only after the Linux packaging path is stable on the implementation machine or CI.

Release notes:

- Use `CHANGELOG.md` as the canonical source.
- Add a release checklist in docs so future releases repeat the same verification and upload steps.

## In-App Update Discovery

Add a visible "check for updates" entry that compares the local app version with the latest GitHub release or a small release manifest.

Behavior:

- Show current version from the app/package metadata.
- Fetch latest release metadata from GitHub.
- If a newer version exists, show version, release page URL, and checksum/manifest guidance.
- If the network fails or GitHub rate-limits the request, show a non-blocking error and keep the app usable.
- Do not download or install updates automatically in this milestone.

Implementation should prefer a small backend Tauri command for update checks so network behavior and version parsing are testable outside the React component.

## Error Handling

Update checks are informational. Failure must not block reading code, opening workspaces, generating explanations, or saving reading state.

Expected states:

- `idle`: no check has run.
- `checking`: request in progress.
- `upToDate`: latest release is not newer than current version.
- `updateAvailable`: latest release is newer.
- `unavailable`: request failed or response could not be parsed.

## Testing

Required verification:

- Unit tests for version comparison, including prerelease versions such as `0.11.0-beta.4`.
- Backend tests for parsing a GitHub release response or release manifest.
- Frontend interaction test for the update-check UI states.
- Existing gates: `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run cargo:test`, `npm run cargo:clippy`, and `npm run cargo:check` where the environment supports them.

## Open Questions Resolved For This Spec

- License defaults to MIT unless the maintainer changes it before implementation.
- Automatic update installation is out of scope for the first public release.
- Linux binary packaging is best-effort for the first release; source-build and evidence are required.
- GitHub Releases are the public update/distribution source for this milestone.
