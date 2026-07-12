# AGENTS.md

## Production Product Contract

CodeReader is a maintained local-first production desktop reader, not an MVP experiment.

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

For large, repetitive, or high-token implementation work, prefer delegating before doing the full job directly:

1. Use Zcode first when the task is large enough to benefit from a GUI assistant. Zcode currently has no reliable CLI path, so Codex should prepare a clear task brief for the user to paste/run in Zcode, then review the resulting diff and gates.
2. If Zcode is unavailable or the task needs terminal-driven automation, use `opencode` with GLM 5.2.
3. If that path times out or becomes unstable, use Windows Claude Code with GLM 5.2 through the DoubaoSeed coding-plan mapping.
4. If both GLM 5.2 paths are not viable, use `opencode` with MiniMax M3 through the official MiniMax CN token plan.
5. If those preferred routes fail, use `opencode` or Claude Code with another suitable model.
6. Codex should stay in the reviewer/owner role when delegating: define the task, inspect the diff, run gates, fix gaps, and decide whether the result is safe to keep.
7. If all external executors fail or produce unsafe half-finished changes, preserve useful drafts separately and only then implement the smallest verified slice directly.

Never merge generated work just because a tool wrote it. Generated changes must pass the same code review, tests, formatting, lint, and git hygiene rules as hand-written changes.
