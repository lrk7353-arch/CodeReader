# Changelog

## Unreleased

### 0.11.0-beta.2

- Promote the internal beta phase to `0.11.0-beta.2` with formalised diagnosability and regression coverage.
- Land a backend `AppError` taxonomy that propagates stable codes to the frontend parser.
- Add React Testing Library interaction coverage for the workspace controllers (open file, open project, refresh, feedback).
- Cover migration rollback, corrupted database, and credential-store failure paths in unit tests.
- Define an internal beta feedback template, crash/log redaction rules, and a regression checklist.
- Add a cross-module Authenticode signing and verification framework that records unsigned-internal-beta builds without requiring a real certificate, and ships a unit-testable Node policy module.
- Extract a user-facing copy resource layer that reserves an English UI entry alongside the shipped Chinese strings.
- Update the topbar stage badge, version metadata, and beta acceptance docs to reflect the Beta 2 milestone.

### 0.11.0-beta.1

- Start the `0.11.0-beta.1` internal beta phase with explicit quality, architecture, and iteration standards.
- Add transactional SQLite migrations driven by `PRAGMA user_version`, including legacy and future-schema tests.
- Add an `LlmProvider` boundary with stable provider error categories.
- Extract explanation-context and model-generation lifecycles from the main React container.
- Add cross-platform Cargo script entry points and a GitHub Actions quality workflow.
- Add application smoke and serialized-error tests.
- Compact long file-structure lists around the active editor line, with collapse and show-all controls.
- Keep expanded file structures inside a bounded scroll area so long files do not hide the project tree.
- Include test files in first-mile reading paths when they are meaningful project entry points.
- Clarify the sample login flow across entry, business, and data files.
- Prevent project navigation labels from overflowing narrow sidebars.

## v0.10.0 - 2026-06-11

- Added deterministic project file classification and recommended reading paths.
- Added SQLite persistence for project guides and file-level reading progress.
- Added Files / Reading Path navigation in the project sidebar.
- Expanded the no-API-key sample into a three-file entry, business, and data flow.
- Added structured Python and SQL explanation support.
- Added real project hierarchy, safe text previews, and code change detection.
- Added reproducible Windows x64 NSIS and MSI release packaging.
- Embedded the WebView2 bootstrapper and GNU WebView2 runtime loader for standalone startup.
- Added branded Windows application icons, release manifests, and SHA-256 checksums.
- Verified install, independent launch, restart recovery, uninstall data retention, and reinstall recovery.

## v0.1.0

- Initialized the CodeReader app shell for Sprint 0.
