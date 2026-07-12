# CodeReader Production Release Runbook

This runbook is the release authority for CodeReader `1.x`. A release is not ready merely because the application builds locally.

The public-facing Release page is governed by [the Chinese public Release-page
specification](public-release-notes.zh-CN.md). The generated `RELEASE-NOTES.md`
must be bilingual and must point users to `README.zh-CN.md` for installation,
uninstall, verification, recovery, and troubleshooting details. This runbook
remains the maintainer execution procedure; it is not a substitute for the
public Release page.

Use [the RC monitoring and rollback procedure](post-release-monitoring.md) to
open a release-tracking issue, triage feedback without collecting sensitive
content, and preserve a non-destructive rollback path after publication.

## Supported production matrix

| Operating system             | Architecture | Required packages        |
| ---------------------------- | ------------ | ------------------------ |
| Windows 10 22H2 / Windows 11 | x64          | NSIS `.exe`, MSI         |
| Windows 10 22H2 / Windows 11 | ARM64        | NSIS `.exe`, MSI         |
| Linux, glibc 2.35+           | x64          | AppImage, `.deb`, `.rpm` |
| Linux, glibc 2.35+           | ARM64        | AppImage, `.deb`, `.rpm` |

Ubuntu 22.04+, Debian 12+, and Fedora 39+ are the officially documented Linux families. Other modern glibc-based distributions are community-compatible until verified. macOS is planned for the next version and has no `1.0.0` assets.

Document Microsoft Edge WebView2 Evergreen Runtime as required on Windows and WebKitGTK 4.1 as required on Linux. The `.deb` and `.rpm` metadata must declare the Linux runtime dependency; AppImage release notes must state that the host provides it.

Exactly ten installer/package assets are required. The draft also carries four release metadata files and four target-bound native package-smoke JSON records.

## One-time GitHub repository setup

1. Protect `main` or apply an equivalent ruleset:
   - require a pull request;
   - require the `Quality`, platform compile, and security checks;
   - require the branch to be up to date before merge;
   - block force pushes and deletion;
   - do not allow bypass except documented incident recovery.
2. Create a `production-release` environment.
3. Add the maintainer as a required reviewer for that environment. The release assembly job must pause for this approval.
4. Keep Actions permissions restricted to the workflow declarations. Do not grant repository-wide write permissions by default.

For the current solo-maintainer repository, `main` requires a pull request and every quality/security gate but has no independent approving-review count. The `production-release` environment remains a separate, explicit approval gate. Any administrator bypass is an incident-recovery action and must be recorded in the release notes or incident log; it must not be described as independent review.

## Candidate preparation

1. Start from a clean `main` checkout.
2. Set the same version in:
   - `package.json` and `package-lock.json`;
   - `src-tauri/Cargo.toml` and `Cargo.lock`;
   - `src-tauri/tauri.conf.json`;
   - the Windows MSI numeric bundle version.
3. Use `1.0.0-rc.N` while validating release candidates. The final public release is `1.0.0`.
4. Update `CHANGELOG.md`, README system requirements, known issues, and data-migration notes.
5. Run:

   ```bash
   npm ci
   node scripts/release-assets.mjs verify-version
   npm run verify:linux
   ```

6. Rehearse supported beta database upgrades and confirm backup, integrity verification, reopen, and read-only recovery evidence.

## Create the candidate tag

Create an annotated, signed tag when a signing identity is available:

```bash
git tag -a v1.0.0-rc.1 -m "CodeReader 1.0.0-rc.1"
git push origin v1.0.0-rc.1
```

Pushing a `v1.*` tag starts `.github/workflows/release.yml`. A manual run may be used only with an existing tag.

## Automated build and assembly

The workflow must:

1. Verify the tag and all project versions match.
2. Run the complete Linux production quality gate on Ubuntu 22.04.
3. Build on native Windows/Linux x64/ARM64 runners.
4. Normalize package names to include version, OS, architecture, and format.
5. Reject fewer or more than ten package assets.
6. On every native build runner, validate package architecture/runtime metadata and run automated package install, visible-window launch, and uninstall smoke checks. AppImage must also launch. Bind the resulting JSON to the tag, checkout commit, OS/architecture, and exact package SHA-256 values; do not record absolute paths or user data.
7. Verify all four smoke records and their package hashes in an unprotected job before requesting approval for the `production-release` environment.
8. Generate:
   - `SHA256SUMS`;
   - `CodeReader.spdx.json` (SPDX 2.3 SBOM);
   - `release-metadata.json`;
   - `RELEASE-NOTES.md`.
9. Generate GitHub artifact attestations with Actions OIDC.
10. Pause at the protected `production-release` environment.
11. Create a draft GitHub Release. Automation must not publish it directly.

## Automated native package smoke

The release workflow runs on native Windows/Linux x64/ARM64 GitHub-hosted runners. It checks Debian/RPM architecture and WebKitGTK dependency metadata, installs and removes the native package-manager format, starts a visible application window under the runner desktop/Xvfb, and launches AppImage. The four `native-smoke-<platform>-<arch>.json` files are attested release assets and contain only portable check names, status, release identity, and package hashes.

This automation is deliberately narrower than full product acceptance. An RPM container on the native Linux host validates RPM installation and runtime compatibility but is not evidence of a complete Fedora desktop user journey.

## Maintainer native-hardware acceptance

Before publishing, verify each of the four platform/architecture combinations on native hardware or its GitHub-hosted native runner:

- install the package;
- launch the application;
- migrate a supported beta fixture or initialize a fresh database;
- select an arbitrary test directory through the native picker;
- confirm the full tree, lazy heavy directories, code reading, and Markdown reading;
- execute a mocked or local-model explanation flow;
- persist reading state across restart;
- close cleanly;
- verify uninstall/package removal behavior.

Do not substitute cross-compilation, the automated package smoke, or an RPM container for the following native-hardware functional evidence.

## Windows signature policy

Until Authenticode signing is configured:

- release metadata must say `windowsAuthenticodeSigned: false`;
- README and Release notes must conspicuously warn about SmartScreen and unknown-publisher prompts;
- checksums, SPDX SBOM, and GitHub artifact attestations are mandatory;
- provenance must not be described as an Authenticode replacement.

When Azure Trusted Signing, SignPath, or a conventional certificate is configured, signing and signature verification become mandatory gates. The release must fail rather than silently falling back to unsigned packages.

## Verify the draft

1. Download every draft asset into a clean directory.
2. Verify checksums:

   ```bash
   sha256sum -c SHA256SUMS
   ```

3. Verify each package's GitHub attestation:

   ```bash
   gh attestation verify <asset> -R lrk7353-arch/CodeReader
   ```

4. Confirm there are exactly ten platform packages, four release metadata files, and four native package-smoke records.
5. Confirm each smoke record says `status: pass`, names the correct tag/commit/architecture, contains no absolute path, and hashes exactly the packages in the draft.
6. Confirm Release notes contain:
   - supported OS and architecture matrix;
   - package-selection instructions;
   - database backup/migration statement;
   - unsigned Windows warning when applicable;
   - macOS-next-version statement;
   - known limitations.
7. Confirm there are no open P0/P1 release issues.

## Publish and post-release checks

1. Publish the reviewed draft manually.
2. Install again from the public Release assets, not workflow artifacts.
3. Confirm the in-app update checker sees the correct channel/version and official Release URL.
4. Verify checksums and attestations using the public URLs.
5. Monitor GitHub issues and security reports for migration, installer, and startup failures.
6. If a severe issue is found, mark the release and affected assets clearly, publish recovery instructions, and cut a patched release. Never replace an existing asset silently.
