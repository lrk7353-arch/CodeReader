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

- Run the relevant tests.
- Update docs when behavior changes.
- Add or update tests for user-visible behavior.
- Keep generated artifacts out of commits unless the PR is specifically about release evidence.

## Commit Style

Use short conventional prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `release:`, and `chore:`.

## Privacy And Security

Do not commit API keys, local database files, private code samples, or user logs containing secrets.
