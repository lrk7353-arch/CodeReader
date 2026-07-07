# GitHub Release Checklist

This checklist publishes a public CodeReader release through GitHub Releases.

## 1. Version

Update the version in:

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

For MSI builds, keep `bundle.windows.wix.version` compatible with MSI version rules.

## 2. Quality Gates

Run:

```bash
npm ci
npm test
npm run lint
npm run format:check
npm run build
npm run cargo:test
npm run cargo:clippy
npm run cargo:check
```

Linux validation:

```bash
npm run doctor:linux
npm run verify:linux
```

## 3. Windows Artifacts

On Windows PowerShell:

```powershell
npm run release:windows
npm run smoke:windows-release
```

Upload from `artifacts/windows-x64/`:

- `CodeReader_*_x64-setup.exe`
- `CodeReader_*_x64_zh-CN.msi`
- `release-manifest.json`
- `signing-manifest.json`
- `SHA256SUMS.txt`

If artifacts are unsigned, state that clearly in the release notes.

## 4. Linux Evidence

Run:

```bash
npm run evidence:linux
npm run smoke:linux-desktop
```

Upload Linux evidence files when they are useful for the release:

- `artifacts/linux-evidence/verify-linux.json`
- `artifacts/linux-evidence/desktop-smoke.json`

Linux binary packages are optional until packaging is stable.

## 5. Tag And Release

Create a tag:

```bash
git tag v0.11.0-beta.4
git push origin v0.11.0-beta.4
```

Create the GitHub Release from that tag. Use `CHANGELOG.md` as the source for release notes.

## 6. Post-Release Checks

- Download uploaded artifacts from GitHub.
- Verify SHA-256 checksums.
- Install on a clean Windows user profile when publishing Windows installers.
- Confirm the in-app update check sees the new release.
