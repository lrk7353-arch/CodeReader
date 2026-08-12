# AGENTS.md

## Production Product Contract

CodeReader is a maintained local-first production desktop reader, not an MVP experiment.

CodeReader 首先是一个真实软件、一个完整产品。可靠、能用、好用，优先于功能数量、技术炫技、模型广度、视觉新鲜感、自动化速度和发布时间。测试通过只证明对应门禁；如果真实项目中的黄金路径不可用，功能就尚未完成。

- The supported `1.0` release targets Windows and Linux on x64 and ARM64. macOS is a next-version target.
- Users may open any file or directory selected through the native picker. The renderer must not gain arbitrary filesystem or network authority.
- Existing `0.10.x` and `0.11.x` explanations, progress, prompts, model configuration, and credential references are compatibility obligations.
- Database migrations require a verified backup, transactional changes, integrity checks, and a non-destructive recovery path.
- Source code, prompts, model responses, credentials, and personal absolute paths must not enter exported diagnostics.
- Background operations must be target-bound; stale work must never replace the current document or state.
- A public release requires the complete Windows/Linux x64/ARM64 package matrix, native smoke evidence, checksums, SPDX SBOM, and artifact attestations.
- Never describe Windows packages as signed unless Authenticode verification actually passed.
- Changes to these invariants require an architecture decision in `docs/architecture/` and maintainer approval.

Before claiming completion, run the relevant frontend, Rust, migration, privacy, race, packaging, and documentation gates from a clean checkout.

## Whole-Product Review and Remediation Standard

When reviewing, diagnosing, or repairing CodeReader, work from the whole
product and release lifecycle rather than the narrowest reported symptom.

- Inspect and report relevant product behavior, compatibility, privacy,
  accessibility, documentation, historical-version obligations, packaging,
  release evidence, operations, and maintainability implications.
- State what was verified, what was not verified, and every material remaining
  gap. A green local test or CI job is evidence for its own gate only; it is
  never sufficient evidence that the product or public release is complete.
- Prefer the most complete safe remediation that satisfies the production
  contract, including user-facing documentation and regression coverage, over
  the quickest patch or a minimal symptom suppression.
- Do not silently narrow the requested scope to save time, tokens, or tooling
  effort. If a complete solution needs additional authority, native hardware,
  external credentials, or maintainer action, complete every safe prerequisite
  first and explicitly hand off the exact outstanding action.
- Treat public communication as a release gate: README content, installation,
  uninstall, verification, troubleshooting, release notes, known limitations,
  and version history must be accurate, understandable, and maintained along
  with the code they describe.

## Project-Owned Directory Policy

CodeReader's repository conventions override defaults suggested by external
skills, agents, IDEs, or automation tools.

- Store permanent architecture and design documents in `docs/architecture/`.
- Store implementation plans in `docs/plans/` and release procedures in
  `docs/release/`.
- Do not create or commit tool-branded documentation directories such as
  `docs/superpowers/`.
- Treat `.superpowers/` and similar assistant runtime directories as local,
  disposable state. They must remain ignored and must not become project
  dependencies.
- Before moving or deleting project assets, create and verify a recoverable
  backup outside the repository.
- External skills may guide a workflow, but they must not override explicit
  maintainer instructions or CodeReader's own directory structure.

## Heavy-Work Delegation

Codex/Sol is the only default execution tree for substantial implementation work. Do not delegate implementation, repair, review, or rollback to external coding software unless the maintainer later gives explicit, renewed authorization.

- The root Codex agent owns task decomposition, worktree protection, final gates, stage state, and commits. It does not replace the main delivery agent for routine stage implementation.
- The main delivery agent uses `gpt-5.6-sol` at `medium` effort and works one approved R-stage at a time. It self-tests and reports its candidate result, but cannot cross a stage gate on its own.
- The supervising agent uses `gpt-5.6-sol` at `high` effort. It remains idle while a stage is being built; after a candidate is declared complete, it independently compares the result with the architecture decision, implementation plan, this contract, and the stage exit criteria. It reports `PASS` or a structured issue list and does not edit files.
- The repair agent uses `gpt-5.6-sol` at `medium` effort. It remains idle unless the supervisor confirms an issue, then repairs only that issue and its regression coverage. The same supervisor rechecks the repair.
- A stage may be committed only after supervision passes, all P0–P2 issues are closed, any retained P3 has an owner and rationale, and the root agent reruns the applicable final gates. No branch is pushed and no pull request or public release is created without separate maintainer authorization.
- If the required Sol model is unavailable, a repair cannot safely address the finding, or native hardware/credentials are required, stop that stage and report the exact blocker. Do not silently substitute a model or executor.

### Product-reset stage gates (R0–R5)

1. R0 establishes governance, accepted decisions, reproducible behavior/compatibility baselines, and entry-point classification.
2. R1 first unifies cognition-state semantics and the additive compatibility data model.
3. R2 then reshapes information architecture around project recovery and the three-pane reading flow.
4. R3 completes the code-cognition loop, persistence, change review, and target-bound asynchronous behavior.
5. R4 validates the real-product journey and public positioning with real projects; automated checks do not replace maintainer usability acceptance.
6. R5 is a release candidate gate only: it requires the supported native package matrix and release evidence, and cannot claim 1.0/public release without actual signing verification where claimed, credentials/hardware evidence, and maintainer approval.
