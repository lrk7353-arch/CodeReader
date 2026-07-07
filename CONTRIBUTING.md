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

- `main`: public release baseline.
- `dev`: integration branch.
- `feature/<name>`: new work.
- `fix/<name>`: bug fixes.
- `codex/<name>`: agent-assisted work branches.

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
