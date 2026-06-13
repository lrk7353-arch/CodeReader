# Changelog

## Unreleased

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
