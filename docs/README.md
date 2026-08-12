# CodeReader Documentation

This directory contains the current project-owned engineering documentation.
External tools and agent skills do not define its layout.

Public entry points:

- `../README.md`: English product and installation information.
- `../README.zh-CN.md`: complete Simplified Chinese installation, verification,
  upgrade, uninstall, and troubleshooting guide.
- `history/version-history.zh-CN.md`: public Chinese version history and
  compatibility overview.
- `release/public-release-notes.zh-CN.md`: public GitHub Release-page contract.

Current accepted product reset records:

- `architecture/2026-08-09-product-reset-decision.md`: accepted decision restoring
  the AI code-cognition product core while retaining the production contract.
- `plans/2026-08-09-product-reset-plan.md`: phased implementation, validation,
  compatibility, rollback, and release-gate plan for that decision.
- `plans/2026-08-12-product-reset-r4-evidence.md`: current R4 project samples,
  measurement boundaries, and the still-required maintainer usability gate.

## Directory map

- `architecture/`: accepted product, architecture, and production-readiness
  decisions. Each document declares its own status.
- `plans/`: implementation plans derived from approved designs.
- `release/`: repeatable packaging, verification, and publishing procedures.
- `history/app-mvp/`: superseded standalone-app MVP documents.
- `history/beta/`: internal beta task, review, and acceptance records.
- `history/legacy-planning/`: early prompts and planning notes.
- `history/plans/`: completed or superseded implementation plans.
- `history/vscode-extension/`: the archived VS Code extension direction.

Historical MVP, beta, and superseded material is retained separately for
reference. It is not the authority for current production behavior.
