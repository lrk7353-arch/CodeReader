# AGENTS.md

## Heavy-Work Delegation

For large, repetitive, or high-token implementation work, prefer delegating before doing the full job directly:

1. Use `opencode` first with the configured MiniMax M3 model when GLM/opencode attempts time out or become too expensive.
2. If the whole `opencode` path is unstable or repeatedly times out, use Windows Claude Code as the next heavy-work executor.
3. Codex should stay in the reviewer/owner role when delegating: define the task, inspect the diff, run gates, fix gaps, and decide whether the result is safe to keep.
4. If both external executors fail or produce unsafe half-finished changes, preserve useful drafts separately and only then implement the smallest verified slice directly.

Never merge generated work just because a tool wrote it. Generated changes must pass the same code review, tests, formatting, lint, and git hygiene rules as hand-written changes.
