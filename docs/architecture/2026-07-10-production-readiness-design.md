# CodeReader Production Readiness Design

> Status: approved in interactive design review on 2026-07-10
> Baseline: `4e6df8bae81e55a4ed81c4ae162eced478b11607` (`0.11.0-beta.4`)
> Target release: `1.0.0` stable (`1.0.0-rc.N` during release-candidate validation)
> Target platforms: Windows and Linux, x64 and ARM64
> Delivery strategy: compatibility-first incremental productionization

## 1. Purpose

This specification defines the work required to move CodeReader from an internal beta into a complete, production-grade local-first desktop code reading product. It replaces the earlier MVP framing for the current product line and extends the narrower open-source release design in `2026-07-07-open-source-release-design.md`.

“Production-grade” means more than a successful build. The release must preserve existing user data, enforce a clear trust boundary between the web renderer and native capabilities, remain correct under concurrent background work, expose predictable recovery paths, and ship installable artifacts for every supported operating-system and architecture combination.

The design intentionally preserves verified parsing, change detection, persistence, and explanation behavior. It does not rewrite the application. Risky boundaries are tightened through tested vertical slices so existing beta users can upgrade without losing explanations, progress, prompts, model configuration, or credentials.

## 2. Product Positioning

CodeReader is a local-first AI-assisted desktop reader for understanding source code, text, and Markdown projects. Its complete first production release provides:

- Native selection of any local file or folder the user chooses.
- A complete workspace tree in which ordinary files remain visible regardless of preview support.
- Structured code reading, safe text and Markdown reading, basic image preview, and metadata-only handling for unsupported or binary files.
- AI explanations built from bounded, inspectable context instead of uncontrolled full-project disclosure.
- Local persistence for explanations, progress, project guidance, prompt versions, and model configuration.
- Change detection and invalidation when files evolve.
- Observable background work, stable errors, diagnostics, feedback, and update discovery.
- Native installation packages for Windows and Linux on x64 and ARM64.

The production release is not a team collaboration platform, cloud account service, automated code-editing agent, plugin marketplace, or macOS release. Those are separate product lines or later versions and must not be allowed to dilute the safety and reliability work in this release.

## 3. Goals and Non-goals

### 3.1 Goals

1. Preserve beta `0.10.x` and `0.11.x` user data through an explicit, reversible migration process.
2. Allow users to open any file or directory while preventing the renderer from fabricating arbitrary native paths or network targets.
3. Eliminate stale asynchronous writes and focus-stealing background completion.
4. Prevent feedback, diagnostics, and error surfaces from leaking API keys, personal absolute paths, source text, or model output.
5. Make all native command failures use a stable, typed error contract.
6. Support the full file-tree and Markdown reading experience approved during design review.
7. Ship ten native installer artifacts across Windows/Linux and x64/ARM64 with checksums, SBOMs, and provenance.
8. Establish repeatable pull-request and release gates that make the production claim auditable.
9. Update root documentation and `AGENTS.md` so future work treats CodeReader as a maintained production product rather than an MVP experiment.

### 3.2 Non-goals

- macOS packages in this release. macOS is explicitly scheduled for the next version.
- Team workspaces, synchronization, accounts, subscription billing, or hosted project storage.
- Automatic code modification, repository write access, or arbitrary command execution.
- A public plugin system or model marketplace.
- Silent background self-update. Until Windows signing and per-package rollback are mature, update discovery opens a verified GitHub Release rather than replacing installed software automatically.
- Guaranteed support for every Linux distribution. The release defines an official baseline and documents community-compatible environments separately.

## 4. Chosen Delivery Approach

### 4.1 Decision

Use compatibility-first incremental productionization on top of the latest complete beta baseline.

Each slice introduces a small boundary, migrates existing callers, and adds regression tests before the next slice begins. Parsing, change detection, persistence semantics, and existing interaction flows are retained unless a failing production invariant requires a targeted change.

### 4.2 Alternatives rejected

#### Full rewrite

A rewrite could produce cleaner module boundaries but would discard the most valuable evidence in the repository: 236 frontend tests, 98 Rust tests, established beta data, platform scripts, and known edge-case behavior. It also makes compatibility failures hard to separate from architectural changes.

#### Packaging-first release

Producing installers before fixing privacy, races, migration recovery, and command boundaries would make an installable beta, not a production release. Distribution must follow correctness.

#### Feature expansion before hardening

Adding cloud collaboration, autonomous edits, or plugins would expand the attack surface and delay a reliable core reader. Product breadth is deliberately constrained until the current local-first workflow is complete.

## 5. Target Architecture

The system is divided into four responsibility layers.

### 5.1 React product layer

The React layer renders workspace state and sends user intent. It owns presentation state, accessible interaction, responsive layout, and request initiation. It does not own native authority.

React receives opaque identifiers such as `projectId`, `grantId`, `fileId`, `snapshotId`, `contextId`, and `operationId`. It must not submit arbitrary absolute filesystem paths, arbitrary provider endpoints, or raw full-file source as authority-bearing command parameters.

Model settings are the deliberate exception needed for user-configurable OpenAI-compatible providers: the settings form may submit a candidate endpoint to a dedicated Rust validation-and-registration command. Rust normalizes and validates the URL, tests it under bounded network policy when requested, persists the approved provider configuration, and returns a `providerId`. Explanation commands then accept only that `providerId`; they cannot attach a different one-off destination.

### 5.2 Workspace state machine

A single workspace state machine coordinates navigation, loading, refresh, scanning, explanation generation, persistence, and background tasks.

Every workspace transition advances a monotonic `workspaceEpoch`. Every asynchronous operation receives an `operationId` and captures the epoch and target identity at start. A result may update the current reading surface only if all captured identities still match. Otherwise it is recorded as a completed or discarded background result without changing current focus.

The state machine distinguishes at least:

- `idle`
- `loading`
- `ready`
- `refreshing`
- `generating`
- `recoverableError`
- `fatalWorkspaceError`
- `readOnlyRecovery`

Background tasks have their own lifecycle: `queued`, `running`, `cancelling`, `succeeded`, `failed`, `discarded`, or `cancelled`.

### 5.3 Rust application and domain layer

Tauri commands are thin adapters over Rust application services. Services enforce grants, resolve identifiers, validate snapshots, build AI context, apply migrations, classify files, and map infrastructure failures to stable application errors.

The main service groups are:

- Workspace and file-grant service.
- Scan, classification, preview, and structure service.
- Context preparation and explanation service.
- Persistence, migration, and recovery service.
- Credential and model-configuration service.
- Prompt registry service.
- Feedback and diagnostics service.
- Update discovery service.
- Release metadata and application version service.

Large existing modules are decomposed only along these service boundaries. Decomposition must preserve externally visible behavior and be covered by characterization tests.

### 5.4 Infrastructure layer

Infrastructure adapters provide filesystem access, SQLite, OS credential storage, HTTPS, GitHub Releases, clock/ID generation, and platform metadata. They are injected or wrapped so unit tests can exercise failure and recovery behavior without real credentials or user files.

## 6. Filesystem Authority and Arbitrary Folder Support

### 6.1 User-visible rule

The user may open any file or folder available through the native operating-system picker. “Do not accept arbitrary absolute paths” is a renderer security rule, not a product restriction.

### 6.2 Grant model

1. The user invokes a native file or directory picker.
2. Rust canonicalizes the selected target and registers a scoped grant.
3. The grant maps an opaque `grantId` to one exact file or one canonical directory root.
4. Scans return opaque `fileId` values and display-safe relative paths.
5. Later reads resolve `fileId` through the grant registry and revalidate containment, file type, symlink behavior, size, and current metadata.
6. A picker-approved grant may be persisted for Recent Projects using a stable project/file ID, canonical native target, grant origin, and last-known fingerprint. On every process start Rust rehydrates and revalidates it before use; the renderer can select a known ID but cannot edit its native target. A missing, moved, identity-mismatched, or policy-incompatible target requires the native picker again.

The renderer cannot create a grant and cannot widen one. Path traversal, symlink escape, Windows device paths, extended UNC forms, WSL/Windows translation, and time-of-check/time-of-use changes are tested explicitly.

### 6.3 Tree visibility and lazy scanning

All ordinary files are represented in the workspace tree even when CodeReader cannot preview their content. The following heavy directories are shown as collapsed placeholders and scanned only after explicit expansion:

- `.git`
- `node_modules`
- `target`
- `dist`
- other configurable generated or dependency directories detected by policy

Lazy scans use budgets for depth, entry count, total metadata work, elapsed time, and cancellation. Hitting a budget produces a visible partial-result state rather than silently hiding content or freezing the UI.

### 6.4 File capability model

Every tree entry carries metadata and explicit capabilities instead of relying only on an extension:

- `structuredCode`: readable, syntax/structure-aware, eligible for scoped AI explanation.
- `plainText`: bounded text preview and reading.
- `markdown`: safe rendered preview plus source mode, headings, reading state, and AI summary/explanation.
- `image`: bounded basic preview with metadata.
- `unsupportedText`: metadata plus optional bounded plain view only when encoding is safe.
- `binaryOrUnknown`: metadata only.
- `tooLarge`: metadata and an explanation of configured limits.
- `symlinkOrSpecial`: metadata and explicit safety treatment; never followed outside a grant.

Selecting a metadata-only file must not replace the current readable document. The center surface keeps its current content while a metadata detail card explains why preview is unavailable.

## 7. Markdown and Content Safety

Markdown is a first-class production format, not an incidental text fallback.

Required behavior:

- Safe rendered preview and source mode.
- Heading outline and navigation.
- Per-file reading progress and status.
- AI summary and selected-section explanation using the same bounded context/approval flow as code.
- Raw HTML disabled or sanitized with a strict allowlist.
- Script, iframe, embedded object, remote tracking pixel, and unsafe URL schemes blocked.
- External links show the destination domain and open in the system browser after user intent.
- Local resource resolution remains inside the active grant and obeys preview budgets.

Image preview must decode within bounded size and resource limits. Unsupported or malformed media returns a stable capability error without invoking the OS shell.

## 8. AI Context, Consent, and Network Boundary

### 8.1 Context preparation

Rust builds an immutable context bundle from a validated file snapshot. The bundle includes the selected target, bounded surrounding structure, required imports/relations, prompt version, estimated size, provider identity, and destination origin. Full files or projects are not included by default.

Context preparation returns a `contextId` and a user-readable disclosure summary. React may display the summary but does not receive authority to alter the server-side bundle.

### 8.2 Final approval

Before an external request, the UI shows what categories of content will be sent and to which provider/domain. User confirmation creates a short-lived, one-time approval bound to:

- `contextId`
- content snapshot hash
- prompt version
- model/provider identity
- normalized HTTPS origin
- creation and expiry time

Rust revalidates all bindings immediately before sending. Changed files, expired approvals, changed endpoints, or reused approvals require a new preview and confirmation.

Local model endpoints may use HTTP only for explicitly recognized loopback destinations. Remote endpoints require HTTPS and pass URL normalization, redirect, and destination validation. A redirect is never allowed to widen the approved destination policy or silently change from an approved local/remote class.

### 8.3 Response handling

Provider responses are schema-validated and size-bounded before persistence. Retry behavior is limited, observable, and idempotent. A response for a stale workspace epoch may be saved to its original target if the snapshot still matches, but it must not replace the user's current reading focus.

## 9. Privacy-safe Feedback and Diagnostics

The feedback report builder is centralized and is the only path allowed to produce copyable or exportable diagnostics.

The default report may include:

- application version and release channel
- operating system and architecture
- stable error codes
- feature/task states and bounded timing information
- coarse file capability and project size buckets
- migration version and success/failure stage

The default report must not include:

- API keys, tokens, Authorization headers, or credential-store material
- source code, Markdown body, prompts containing user content, or model responses
- raw provider payloads
- personal absolute paths, usernames, home directories, or UNC server/share names
- database contents

All errors are sanitized before entering logs or UI state, not only when copied. Property tests and privacy canaries inject representative secrets, Windows/WSL/Linux paths, and source markers, then assert they cannot appear in any exported report.

The feedback UI always previews the final sanitized text before copy/export. Users may add free-form notes, but the product must clearly state that user-entered text is not automatically redacted.

## 10. Error Contract

All Tauri commands return a shared serializable `AppError` contract. Raw `String` errors are removed from public command boundaries.

The contract contains:

- stable machine-readable code
- safe localization key or safe fallback message
- severity
- retryability
- recovery action identifier
- correlation/operation ID
- optional sanitized diagnostic fields

Internal causes are converted immediately into redacted structured cause metadata. Raw sensitive error text is neither serialized nor written to local logs. Frontend TypeScript types are generated from or checked against the Rust contract so drift fails CI.

Errors are categorized into filesystem/grant, preview/capability, persistence/migration, credential, provider/network, validation, update, and internal domains. Stable codes survive wording and localization changes.

## 11. Persistence, Migration, and Recovery

### 11.1 Compatibility commitment

The production release must retain beta `0.10.x` and `0.11.x`:

- explanations and feedback
- file/project reading progress
- project guidance
- prompt versions and active/canary state
- model configuration
- credential references and usable OS-keyring entries

No upgrade path may silently replace an unreadable or incompatible database with a blank database.

### 11.2 Startup migration sequence

1. Locate the existing database and identify its schema/application version.
2. Acquire a single-instance migration lock.
3. Verify the file is readable SQLite and run pre-migration integrity checks.
4. Create a timestamped backup in a documented recovery directory.
5. Open a transaction and apply ordered, idempotent migrations.
6. Verify `user_version`, required schema, foreign keys, integrity, and expected table/record counts.
7. Commit only after all checks pass.
8. Reopen through the normal repository layer and perform a post-migration smoke read.

If any step fails, the transaction rolls back, the original and backup remain intact, and the application enters read-only recovery. The recovery UI shows a safe error code, backup location through an OS reveal action, retry guidance, and an export path. It never continues against a partially migrated store.

### 11.3 Repository and connection design

SQLite access is owned by application state rather than opening an unrelated connection per command. The design uses a bounded connection strategy appropriate for desktop SQLite, WAL where supported, `busy_timeout`, foreign keys, explicit transaction boundaries, and deterministic shutdown.

Repository interfaces isolate explanations, progress, prompts, model configuration, and migration metadata. This enables fixture-based migration tests and prevents UI commands from embedding SQL behavior.

### 11.4 Migration fixtures

CI maintains anonymized fixture databases representing supported `0.10.x`, early `0.11.x`, current beta, corrupted, partially written, locked, and newer-than-supported states. Every schema change rehearses upgrade, verification, failure rollback, and reopen against these fixtures.

## 12. Credential and Prompt Consistency

### 12.1 Model credentials

Secrets remain in the OS credential store; SQLite stores only non-secret configuration and credential references.

Saving model settings is a coordinated operation:

1. Validate non-secret configuration and endpoint policy.
2. Stage the new credential in the OS store.
3. Commit the database configuration.
4. Remove superseded credential material only after commit.
5. If database commit fails, compensate by restoring/removing the staged credential.

Connection testing uses the unsaved key currently entered by the user or, when appropriate, the existing saved credential. The UI must distinguish “test current form” from “test saved configuration.” Secrets are never returned to React after persistence.

### 12.2 Prompt registry

The database enforces at most one active prompt through transactional invariants and an appropriate uniqueness constraint/index. Canary and rollback transitions are atomic. Invalid template placeholders or states fail before persistence. Concurrent activation tests prove that multiple active prompts cannot emerge.

## 13. Update Discovery

Update checking remains non-blocking and does not install software automatically in this release.

Production requirements:

- standards-compliant semantic-version parsing, including prereleases
- explicit connection and total timeouts
- bounded response size
- GitHub API/content-type/status validation
- redirect and final-origin validation
- release channel awareness so stable users are not offered prereleases unless opted in
- verified release URL limited to the configured official repository
- cancellation when the application closes
- cached last-success metadata with clear timestamp

Network failure never blocks local reading. An available update opens the official GitHub Release page where the user can select the correct platform package and verify checksums/attestation.

## 14. Workspace Experience

### 14.1 Desktop layout

The primary workspace retains the familiar three-pane reading model:

- Left: complete file tree, capability badges, filters, project guidance, and lazy-directory states.
- Center: active code/text/Markdown/image reading surface or capability metadata.
- Right: explanation, outline, reading status, related context, and recovery actions.
- Bottom task center: scans, refreshes, explanation jobs, update checks, migrations, cancellations, failures, and completed background work.

At widths of 1280 pixels or more, all three panes are available. From 960–1279 pixels, one side pane collapses automatically while retaining explicit toggles. Pane widths are resizable and remembered locally. Smaller unsupported window sizes must remain usable through a deliberate compact layout rather than horizontal overflow.

### 14.2 Focus and task behavior

Background completion never steals focus or replaces the current document. Notifications are non-modal unless data recovery or an irreversible action requires a decision. Long operations show progress, cancellation when technically possible, retry, stable errors, and retained history for the current session.

### 14.3 Navigation and accessibility

The top bar contains only frequent actions: open project/file, model status, task status, and a compact overflow menu. All core flows support keyboard navigation, visible focus, semantic controls, screen-reader labels, reasonable contrast, and reduced-motion preferences.

Dialog focus is trapped correctly and returned to its opener. Loading, failure, empty, unsupported, read-only recovery, and offline states are explicit rather than inferred from missing content.

## 15. Platform and Packaging Matrix

### 15.1 Official operating-system baseline

Windows:

- Windows 10 22H2
- Windows 11
- WebView2 present or installed through the documented bootstrapper behavior

Linux:

- glibc 2.35 minimum
- Ubuntu 22.04 or newer
- Debian 12 or newer
- Fedora 39 or newer

Other modern glibc-based distributions may work but are documented as community-compatible until verified. macOS is deferred to the next version and has no production assets in this release.

### 15.2 Required release assets

| Platform | Architecture | Formats | Count |
| --- | --- | --- | ---: |
| Windows | x64 | NSIS `.exe`, MSI | 2 |
| Windows | ARM64 | NSIS `.exe`, MSI | 2 |
| Linux | x64 | AppImage, `.deb`, `.rpm` | 3 |
| Linux | ARM64 | AppImage, `.deb`, `.rpm` | 3 |
| **Total** |  |  | **10** |

Each artifact name includes product, version, OS, architecture, and package format. The release page and README explain which file to choose and list the system baseline.

### 15.3 Native build and smoke policy

Every architecture is built on its native architecture runner or an explicitly approved native fallback. Release acceptance does not rely only on cross-compilation.

Each target runs an installer/package smoke flow covering:

- package installation
- first launch
- database initialization or fixture upgrade
- native selection of an arbitrary test directory
- complete tree display
- code and Markdown reading
- one mocked/local explanation flow
- persistence across restart
- clean close
- package uninstall/removal behavior

GitHub-hosted public runners are the preferred primary infrastructure when available. A documented native self-hosted/manual fallback is maintained for an architecture still in public preview or temporarily unavailable. Official runner capabilities must be checked against [GitHub-hosted runners documentation](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) before workflow implementation.

## 16. Release Pipeline and Provenance

### 16.1 Release flow

1. A protected version tag or explicitly approved manual dispatch starts the candidate pipeline.
2. Source quality, security, migration, version-coherence, and repository-cleanliness gates pass.
3. Four native OS/architecture jobs build and smoke their packages.
4. A release-assembly job downloads all ten assets and verifies naming, version, uniqueness, and expected count.
5. The pipeline generates `SHA256SUMS`, an SPDX SBOM, build metadata, and artifact attestations.
6. A draft GitHub Release is created with generated requirements and compatibility sections.
7. A maintainer reviews evidence and manually publishes the release.

Tauri packaging should follow the official [Windows installer](https://v2.tauri.app/distribute/windows-installer/), [AppImage](https://v2.tauri.app/distribute/appimage/), and [GitHub pipeline](https://v2.tauri.app/distribute/pipelines/github/) guidance while preserving CodeReader-specific gates.

### 16.2 Signing and current unsigned status

No Windows Authenticode certificate is currently available. Therefore:

- Windows assets are explicitly labeled “unsigned” in README and Release notes.
- The UI and documentation explain that SmartScreen or unknown-publisher prompts may appear.
- Checksums, SBOMs, reproducible metadata, and GitHub artifact attestations are still required.
- The workflow exposes a signing-provider abstraction for Azure Trusted Signing, SignPath, or a conventional certificate without pretending that provenance replaces Authenticode.
- Once a certificate/provider is configured, signing and signature verification become mandatory release gates without redesigning the build jobs.

For a public repository, GitHub artifact attestations can use Actions OIDC and Sigstore-backed provenance; verification instructions use `gh attestation verify`. See [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) and [Sigstore keyless CI](https://docs.sigstore.dev/quickstart/quickstart-ci/).

### 16.3 Version coherence

One canonical release version drives frontend package metadata, Rust crate metadata, Tauri configuration, updater comparison, filenames, changelog, and Release title. The first stable production version is `1.0.0`; release candidates use `1.0.0-rc.N` without changing data compatibility. CI fails when any source disagrees or when a release tag does not equal the canonical version.

## 17. Quality Gates

### 17.1 Pull-request gates

Every pull request must run, at minimum:

- frontend unit and interaction tests
- Rust unit/integration tests
- TypeScript/Rust contract checks
- lint and formatting checks
- frontend production build
- Rust `check` and Clippy with warnings denied
- migration fixture suite
- asynchronous race and stale-result tests
- privacy-canary and feedback property tests
- dependency vulnerability/license policy checks for production dependencies
- secret scanning
- CodeQL or equivalent static analysis
- platform/architecture compilation coverage appropriate to the changed area

Generated code, workflow definitions, release scripts, and migrations are reviewed as production code. A passing test suite does not waive an unresolved P0/P1 review finding.

### 17.2 Release gates

Release-specific checks add:

- canonical version/tag/changelog coherence
- clean tracked source and reproducible locked dependencies
- supported beta migration rehearsal with backup and rollback evidence
- ten expected artifacts and no unexpected assets
- native install/start/read/persist/uninstall smoke evidence
- checksums, SPDX SBOM, and GitHub attestations
- release notes containing system requirements, package-choice table, data-upgrade statement, known issues, and unsigned Windows warning
- no open P0/P1 defects
- explicit maintainer approval before publication

### 17.3 Dependency policy

Production dependency vulnerabilities block release according to a documented severity policy. Development-only findings are assessed for build/release exposure and tracked with an owner and deadline. Automated “fix” commands are never applied blindly when they change major versions or the trust chain.

## 18. Observability and Supportability

CodeReader remains local-first and does not introduce mandatory telemetry.

The application records bounded structured local diagnostics containing operation IDs, stable error codes, durations, state transitions, and coarse capability data. Logs rotate, have a documented retention limit, and use the same redaction policy as feedback reports.

The About/Diagnostics surface provides:

- exact application version and build provenance identifier
- OS/architecture and database schema version
- release channel and last update-check state
- migration backup/recovery status
- copy-preview feedback report
- safe log-folder reveal action
- links to security policy and issue reporting

Opt-in telemetry, if ever introduced, requires a separate design and privacy review.

## 19. Performance and Resource Budgets

Production acceptance defines measurable budgets rather than relying on subjective responsiveness. Exact numeric thresholds are established from baseline measurements in the implementation plan, but the following invariants are fixed:

- Opening a normal project is incremental and does not require reading every file body.
- Large directories and generated trees cannot block the UI thread.
- Preview reads, Markdown rendering, image decoding, AI context, provider responses, logs, and task history are bounded.
- Scans and long work are cancellable or safely discardable.
- Caches have explicit size/entry limits and do not retain source from closed projects indefinitely.
- Database contention is bounded and exposed as a recoverable stable error.

Performance regression fixtures include small projects, large flat directories, deep trees, dependency-heavy repositories, large Markdown documents, large/binary files, and WSL/UNC path cases.

## 20. Documentation and Repository Positioning

The implementation updates public documentation so the product can be installed and evaluated without reading internal beta notes.

Required root documentation changes:

- `README.md`: production positioning, screenshots, feature boundaries, privacy model, package-selection matrix, system requirements, installation, first run, upgrade/backup behavior, unsigned Windows disclosure, verification commands, development quickstart, and macOS-next-version statement.
- `CHANGELOG.md`: production release notes and migration statement.
- `SECURITY.md`: supported versions, reporting channel, trust/provenance/signing explanation, and local data handling.
- `CONTRIBUTING.md`: production gates, architecture boundaries, migration rules, and platform expectations.
- `AGENTS.md`: replace MVP assumptions with the production product boundary, compatibility obligations, protected invariants, and mandatory verification expectations while retaining useful delegation/review rules.
- `docs/release/`: repeatable release checklist, runner requirements, signing status, artifact verification, rollback, and incident handling.

Internal MVP/beta documents may remain as historical records but must be clearly marked as superseded and must not be the default architecture or release authority.

The project-local `.superpowers/` brainstorming directory must be ignored so design companion artifacts never enter source control accidentally.

## 21. Delivery Milestones

### M0 — Reproducible baseline and product contract

Align branch/version/repository policy, production positioning, shared error/DTO contracts, deterministic local gates, and protected characterization tests.

Exit condition: every existing behavior relied upon by migration and reading flows has a testable baseline, and documentation no longer describes the active product as an MVP.

### M1 — Core privacy and concurrency

Centralize diagnostic redaction, replace raw command errors, introduce workspace epoch/operation identity, and eliminate load/refresh/generation races.

Exit condition: privacy canaries and deterministic race tests pass; stale operations cannot change current focus or state.

### M2 — Native authority and durable data

Introduce file grants and opaque IDs, migration backup/recovery, application-owned database access, credential compensation, prompt uniqueness, and hardened update discovery.

Exit condition: arbitrary user-selected folders work without arbitrary renderer paths, and all supported beta fixtures upgrade or recover without data loss.

### M3 — Complete reading experience

Deliver full tree visibility with lazy heavy directories, capability-based previews, first-class Markdown, task center, responsive panes, accessibility, and resource budgets.

Exit condition: the approved workspace behavior passes interaction, accessibility, performance, and browser/desktop smoke tests.

### M4 — Cross-platform production release

Complete Windows/Linux x64/ARM64 workflows, ten native artifacts, native smoke runs, SBOM/checksums/attestations, release documentation, and manual release approval.

Exit condition: all production completion criteria in Section 22 pass with stored evidence.

Milestones are sequential at their trust boundaries but may contain parallel implementation tasks. A milestone is not considered complete merely because its code has merged; its exit evidence must exist.

## 22. Production Completion Criteria

The first production release is complete only when all of the following are true:

1. Frontend, Rust, contract, lint, format, build, security, migration, privacy, race, and platform gates pass from a clean checkout.
2. Renderer commands cannot exercise filesystem or network authority through fabricated paths/endpoints/raw context.
3. Feedback and exported diagnostics do not leak injected secrets, paths, source markers, prompts, or model responses.
4. Arbitrary user-selected files/folders work; all ordinary files are visible; heavy directories are lazy and bounded.
5. Supported code/text/Markdown/image files have the approved behavior, and unsupported files remain visible with metadata.
6. Background work cannot steal focus or apply stale state.
7. `0.10.x` and `0.11.x` migration fixtures back up, migrate, verify, reopen, and roll back/recover as designed.
8. Credential/config failure compensation and single-active-prompt invariants pass concurrent failure tests.
9. The update checker handles timeouts, prereleases, invalid origins, malformed responses, and offline use safely.
10. Ten correctly named installer assets are produced and smoked on native Windows/Linux x64/ARM64 environments.
11. `SHA256SUMS`, SPDX SBOM, GitHub attestations, build metadata, system requirements, and package-selection guidance are attached to the draft Release.
12. Unsigned Windows status is conspicuous until Authenticode signing is actually enabled and verified.
13. README, release docs, security policy, contribution guide, changelog, and `AGENTS.md` reflect the production product.
14. No known P0/P1 issue remains open, and any accepted lower-severity limitation is documented in Release notes.
15. A maintainer reviews the stored evidence and explicitly publishes the draft Release.

## 23. Risk Register and Mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Migration damages real beta data | Loss of user trust and work | Backup-first transaction, fixtures, integrity/count checks, read-only recovery |
| Async completion targets the wrong file | Incorrect or overwritten reading state | Workspace epoch, operation identity, immutable snapshots, deterministic race tests |
| Full-tree display causes freezes | Production app unusable on real repositories | Metadata-first scan, lazy heavy directories, budgets, cancellation, incremental rendering |
| Renderer authority remains too broad | File/network privacy exposure | Native picker grants, opaque IDs, server-side context, one-time bound approvals |
| Redaction misses an error path | Secrets/source leak in bug reports | Central builder, safe errors at source, property tests and privacy canaries |
| ARM runner/tooling instability | Missing official artifacts | Native hosted primary plus documented native fallback; release blocks until smoke evidence exists |
| Unsigned Windows binaries trigger warnings | Installation friction and user concern | Conspicuous disclosure, checksums/SBOM/attestation, signing abstraction, later mandatory signature gate |
| Large refactor regresses proven behavior | Delayed or unsafe release | Vertical slices, characterization tests, milestone exit gates, compatibility-first approach |
| Documentation diverges from artifacts | Users install wrong package or expect unsupported OS | Canonical version/requirements data and CI coherence checks |

## 24. Resolved Decisions

- The first production release targets Windows and Linux only.
- The first stable production version is `1.0.0`, preceded by reproducible `1.0.0-rc.N` candidates.
- Both x64 and ARM64 are official architectures.
- Windows ships NSIS and MSI for each architecture.
- Linux ships AppImage, `.deb`, and `.rpm` for each architecture.
- Windows 10 22H2/Windows 11 and glibc 2.35 are the compatibility baselines.
- Ubuntu 22.04+, Debian 12+, and Fedora 39+ are the officially documented Linux families.
- macOS is the next-version target.
- The product supports opening any user-selected file/folder.
- All ordinary files appear in the tree; preview behavior is capability-based.
- Markdown is a first-class reading format.
- Renderer-supplied arbitrary native paths, arbitrary provider targets, and full raw context are not trusted.
- Existing beta data is preserved with backup, transactional migration, verification, and read-only recovery.
- Windows builds remain explicitly unsigned until a real Authenticode mechanism is configured.
- Free GitHub/Sigstore provenance is required but is not represented as an Authenticode substitute.
- Productionization is incremental; a rewrite is rejected.

No unresolved product decision blocks implementation planning. External signing credentials remain a release capability gap, handled by the approved unsigned-disclosure policy until the maintainer obtains a signing provider.
