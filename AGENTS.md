# AGENTS.md

## Heavy-Work Delegation

For large, repetitive, or high-token implementation work, prefer delegating before doing the full job directly:

1. Use `opencode` with GLM 5.2 first.
2. If that path times out or becomes unstable, use Windows Claude Code with GLM 5.2 through the DoubaoSeed coding-plan mapping.
3. If both GLM 5.2 paths are not viable, use `opencode` with MiniMax M3 through the official MiniMax CN token plan.
4. If those preferred routes fail, use `opencode` or Claude Code with another suitable model.
5. Codex should stay in the reviewer/owner role when delegating: define the task, inspect the diff, run gates, fix gaps, and decide whether the result is safe to keep.
6. If all external executors fail or produce unsafe half-finished changes, preserve useful drafts separately and only then implement the smallest verified slice directly.

Never merge generated work just because a tool wrote it. Generated changes must pass the same code review, tests, formatting, lint, and git hygiene rules as hand-written changes.
