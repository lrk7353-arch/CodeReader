# Security Policy

## Supported Versions

Security fixes target the latest `1.0.x` stable release and the active `1.0.0-rc.N` candidate while production validation is in progress. Historical beta and MVP tags are unsupported except as documented database-migration inputs.

## Tracked Upstream Security Exceptions

- `RUSTSEC-2024-0429` / `GHSA-wrw7-89jp-8q8g`: Tauri 2.11.2 currently brings
  `glib 0.18.5` through its Linux GTK3 runtime. The affected
  `VariantStrIter` API is not called by CodeReader or by the inspected
  dependency source graph. RustSec CI names this advisory explicitly as a
  temporary exception; the GitHub Dependabot alert remains open. Remove the
  exception as soon as Tauri's Linux stack supports `glib >= 0.20.0`.

## Reporting A Vulnerability

Please use GitHub's private vulnerability reporting/security-advisory flow for `lrk7353-arch/CodeReader`. If that flow is unavailable, contact the maintainer through the repository owner profile without posting exploit details in a public issue.

Include:

- Affected version or commit.
- Operating system.
- Reproduction steps.
- Impact.
- Whether local files, model credentials, or generated explanations are exposed.

Do not include real API keys, private source code, full model responses, or an unredacted CodeReader database. Use the in-app feedback preview and replace sensitive values with reproducible canaries.

## Security Boundaries

- Filesystem access originates from a native user selection and is represented by scoped opaque grants.
- Remote AI transmission requires a validated provider and explicit bounded-context approval.
- Credentials belong in the operating-system credential store, not SQLite, logs, exported diagnostics, or frontend persistence.
- Diagnostics must not include source text, prompt bodies, model responses, credentials, or personal absolute paths.
- Supported database upgrades are backup-first, transactional, integrity-checked, and non-destructive on failure.
- CodeReader does not enable mandatory telemetry or silent automatic installation in `1.0`.

## Package Identity And Provenance

CodeReader currently has no Windows Authenticode certificate. Unless a Release explicitly reports a verified signer, Windows packages are unsigned and may show SmartScreen or unknown-publisher warnings.

Every production Release must provide SHA-256 checksums, an SPDX SBOM, and GitHub artifact attestations. Verify them before installation. These controls establish artifact integrity and build provenance; they are not represented as a substitute for Authenticode publisher identity.
