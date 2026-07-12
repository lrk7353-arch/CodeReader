# Contributing to CodeReader

Thank you for helping improve CodeReader.

## Development Setup

Run:

```bash
npm ci
npm run verify:linux
```

On Windows, use:

```powershell
npm run release:windows
```

when validating release-chain changes.

Release and platform work must also exercise the relevant native architecture. Linux x64, Linux ARM64, Windows x64, and Windows ARM64 are official `1.0` targets.

## Branches

CodeReader uses a lightweight trunk-based workflow:

- `main` is the only permanent branch and must remain releasable.
- `feature/<topic>` is for short-lived product work.
- `fix/<topic>` is for short-lived bug and security fixes.
- `release/<version>` is optional while preparing a specific release candidate.
- Open a pull request into `main`, pass required checks, and delete the source
  branch after merge.
- Do not keep a long-lived `dev` branch or name branches after tools, agents, or
  individual implementations such as `codex/*`.
- Never force-push or delete `main`.

## Pull Requests

Before opening a PR:

- Run `npm run verify:linux` from a clean checkout when the host supports it.
- Run targeted Windows/Linux architecture checks for platform-specific changes.
- Update docs when behavior changes.
- Add or update tests for user-visible behavior.
- Add deterministic regression tests for races, migration failures, privacy boundaries, and recovery behavior.
- Keep generated artifacts out of commits unless the PR is specifically about release evidence.
- Do not weaken filesystem grants, bounded AI context, diagnostic redaction, backup-first migration, or stale-operation rejection without an approved architecture change.

## Commit Style

Use short conventional prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `release:`, and `chore:`.

## Privacy And Security

Do not commit API keys, local database files, private code samples, or user logs containing secrets.

Public command errors must use the shared safe `AppError` contract. Renderer code must use opaque project/file/context identifiers after native selection rather than treating arbitrary paths or provider destinations as authority. Database schema changes require supported beta fixtures, backup/rollback evidence, and integrity checks.

Release-chain changes must preserve the ten required Windows/Linux x64/ARM64 packages and the checksum, SPDX SBOM, attestation, unsigned-Windows disclosure, and manual-approval gates described in `docs/release/github-release.md`.
