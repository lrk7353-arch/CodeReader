# Production Recovery and Release Evidence

**Status:** Accepted on 2026-07-12 by the CodeReader maintainer.

## Context

CodeReader `1.0` changes its desktop bundle identifier from the historical
`com.codereader.app` to `com.codereader.desktop`, and ships native packages on
Windows and Linux for x64 and ARM64. A successful compile is not sufficient
evidence that user data is safe or that the published packages are usable.

The production contract requires backwards-compatible `0.10.x`/`0.11.x` data,
non-destructive recovery, target-bound background work, private diagnostics,
and native package evidence for every supported target.

## Decisions

1. When the current database is absent, CodeReader imports a verified backup
   of the legacy `com.codereader.app` database into the current application
   data location. It never merges or overwrites when a current database already
   exists. Supported historical schemas are represented by anonymous SQL
   fixtures and must migrate, reopen, and preserve explanations, progress,
   prompts, and model settings.
2. Database initialization is serialized per database path. Any unsafe open,
   migration, or verification failure puts that path into process-local
   read-only recovery: later persistence commands fail closed instead of
   retrying writes against a possibly damaged store. Recovery messaging may
   claim a backup only after one is actually present.
3. Ordered schema migrations run in one transaction. Required tables, columns,
   schema version, prompt constraints, integrity, foreign-key checks, and row
   preservation are verified before commit. The pre-migration verified backup
   remains an additional recovery layer.
4. A model response may persist only when its grant, snapshot, on-disk hash,
   database file hash, and snapshot row all still match the request. A changed
   target returns `llm.stale_result` and cannot replace current state.
5. Exportable error summaries contain stable codes and coarse state only.
   Arbitrary POSIX paths, Windows paths, UNC paths, credentials, source text,
   prompts, and model responses are excluded.
6. A release tag creates package smoke records for Windows/Linux x64/ARM64.
   Each record is bound to the tag, commit SHA, architecture, and exact package
   hashes. The workflow verifies all four records before the protected release
   environment may assemble a draft. Automated install/window/uninstall smoke
   does not replace maintainer functional acceptance on native hardware.

## Consequences

- The legacy identifier must remain discoverable even though new installations
  use the current identifier.
- Persistence and release tests are deliberately stricter and may reject work
  that previously appeared to succeed.
- A stable `1.0.0` release still requires human approval, complete native
  functional evidence, and manual publication of the reviewed draft.
