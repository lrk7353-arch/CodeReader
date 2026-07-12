# CodeReader RC Monitoring and Rollback Procedure

This procedure starts when a GitHub Release draft becomes public. CodeReader is
local-first and has no mandatory telemetry, so release monitoring is based on
verified Release assets, GitHub Actions evidence, GitHub Issues, and maintainer
reproduction rather than undisclosed user analytics.

## Before publishing

1. Create a GitHub Issue titled Release monitoring: v<version> with the
   release-feedback label and links to the public Release, workflow run,
   SHA256SUMS, SBOM, attestations, and four native-smoke records.
2. Confirm the public Release body links to the supported-system matrix,
   package-selection guidance, unsigned Windows notice, migration-recovery
   guidance, and the release-feedback issue form.
3. Confirm every platform/architecture acceptance record has an owner, date,
   package filename, checksum, and outcome. Do not replace a failed record
   silently.

## Triage window

- Monitor the tracking issue, release-feedback reports, GitHub security
  alerts, and failed update-check reports at least daily for the first 7 days,
  then weekly until the next release.
- Classify each report as release-blocker, bug, documentation issue,
  unsupported environment, or duplicate. Record the affected version, OS,
  architecture, package format, first failing stage, and whether checksum and
  attestation verification succeeded.
- Ask users for the smallest redacted reproduction. Never request source code,
  prompts, model responses, credentials, database files, or personal absolute
  paths in a public issue.

## Immediate rollback triggers

Treat any confirmed report below as a release blocker:

- package checksum or artifact attestation cannot be verified;
- installer launches an unexpected binary or package architecture is wrong;
- supported-platform startup failure with no documented recovery;
- migration data loss, failed verified backup, or unsafe write in recovery;
- arbitrary file access outside a native-picker grant;
- source, prompt, model response, credential, or personal path disclosure;
- a release package is falsely described as Authenticode-signed;
- a security vulnerability with a credible exploitation path in the shipped
  dependency set.

## Rollback and replacement

1. Stop promoting the Release and update its notes with the affected package,
   version, and safe recovery guidance.
2. Do not silently replace an existing asset or reuse a tag.
3. Preserve the original evidence, issue timeline, and checksums.
4. Prepare a new patch version or RC with a new tag, full package matrix,
   evidence, and acceptance record.
5. Close the tracking issue only after the replacement Release is public and
   users have a documented upgrade or recovery path.

## Completion record

At the end of the monitoring window, add a final comment to the tracking issue
listing the number and disposition of release reports, unresolved known
limitations, Dependabot/CodeQL/secret-scanning status, and the next review
date for the glib security backport ADR.
