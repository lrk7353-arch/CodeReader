# Changelog

## Unreleased

### Public repository preparation

- Prepare public README, contribution, security, issue, and PR guidance.
- Document the GitHub Release checklist for Windows artifacts, Linux evidence, checksums, and signing status.
- Add low-risk update discovery planning for GitHub Releases without automatic installation.

### Beta 4 hardening (post-beta.4)

- Make workspace error actions executable: retry/checkNetwork now render a 重试 button, checkEncoding renders 重新选择文件, and fs.* path errors render 重新选择项目/重新选择文件 plus a 复制错误详情 button that copies the redacted error detail to the clipboard.
- Retain generation error summary: useModelWorkflow tracks lastGeneration (explanationId, status, error, errorDetail, timestamp); ExplanationPanel renders a 复制错误摘要 button for feedback.
- Add redacted feedback report export: useFeedbackReport builds a JSON report (app version, platform, provider endpoint host only, last workspace/generation error, recent workspace status history) with no API key/source/prompt; a 反馈包 toolbar button copies it to the clipboard.
- Add project-level reading progress: useProjectProgress computes totalFiles/explainedFiles/totalExplanations/readExplanations/understoodExplanations/completionPercent and the most recently updated explanation as a continue-reading target; the topbar shows 进度 N% plus a 继续阅读 button.
- Add model connection test: test_model_connection Tauri command sends a minimal ping and returns {ok, model, endpoint, echo}; ModelSettingsDialog has a 测试连接 button. Ollama works via http://localhost:11434/v1/chat/completions with no extra code.
- Add medium and stress synthetic project fixtures for real-project validation boundaries (120-file multilang; 3000-line file, 200+ node file, binary, non-UTF-8, deep dirs).

### 0.11.0-beta.4

- Promote the internal beta phase to `0.11.0-beta.4` with RC-prep validation and release-chain hardening.
- Add Windows release-chain smoke script (`scripts/windows-release-smoke.mjs`) that auto-verifies manifest/SHA-256/signing-status consistency and writes a manual install evidence template; document the chain in `Windows-release-chain-smoke.md`.
- Add the Beta4 acceptance document, real-project validation template, and Linux desktop smoke `nonBlockingGenerationProgressVisible` checklist item.
- Classify workspace failures with stable `fs.*` error codes: `load_code_file` and `scan_project` now return `AppError` so the frontend can branch on the code; add `errorAction()` mapping codes to actionable suggestions (retry, openModelSettings, checkEncoding).
- Cap long structure lists: compact target lists now scroll inside a `max-height: min(220px, 30vh)` box so a file with many structure entries no longer pushes the project tree out of view; add a 60-item interaction test.
- Split `context_builder/budget.rs` (context_builder 1735 → 1669 lines) and `code_service/language.rs` (code_service 1383 → 1274 lines), behavior unchanged, all tests pass.
- Move model-settings, generation, and prompt-registry copy into the resource layer (`copy.ts`) with zh-CN and en entries; `ModelSettingsDialog` now consumes the copy layer instead of inline strings.

### 0.11.0-beta.3

- Promote the internal beta phase to `0.11.0-beta.3` with execution-level prompt gray rollout and Linux development validation.
- Add prompt version registry persistence (schema v3) with `system_prompt_template` and `user_prompt_template` columns; the explanation service loads the selected version's templates and sends them as the system/user messages to the provider, so a canary version truly changes the prompt content.
- Implement stable canary rollout via `sha256(project_id:file_path:target_id)` sampling so the same target resolves to the same version across regenerations.
- Add atomic `rollback_prompt_version` and `list_prompt_versions` Tauri commands, plus a Prompt Registry management dialog that lists, registers, edits, and rolls back versions.
- Harden prompt template handling: custom user templates must include the `{payload}` placeholder; partial upserts preserve existing templates via COALESCE; `load_prompt_templates` propagates database errors instead of swallowing them.
- Validate Linux/Debian development: `npm run doctor:linux` and `npm run verify:linux` pass on WSL Ubuntu 24.04 with Rust 1.96.1; `npm run tauri dev` launches the desktop app via WSLg.
- Fix Linux reproducibility: remove the `powershell.exe` script-shell override, prepend `~/.cargo/bin` to PATH in cargo/doctor scripts, and add a header fallback for `libxdo-dev` which ships no pkg-config file.
- Extract `persistence/explanation_hydration.rs` from `persistence_service.rs` (1996 → ~1300 lines) continuing the workspace-state splitting by responsibility.

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
