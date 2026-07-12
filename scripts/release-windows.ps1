param(
    [switch]$SkipChecks,
    [switch]$NsisOnly,
    [ValidateSet("x64", "arm64")]
    [string]$Architecture = "x64"
)

$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$env:CODEREADER_WINDOWS_ARCH = $Architecture
. (Join-Path $PSScriptRoot "configure-windows-rust.ps1")
. (Join-Path $PSScriptRoot "sign-windows-artifacts.ps1")
$cargoTarget = if ($env:CODEREADER_CARGO_TARGET_DIR) {
    $env:CODEREADER_CARGO_TARGET_DIR
} elseif (Test-Path -LiteralPath "D:\CodeReaderCache") {
    "D:\CodeReaderCache\cargo-target"
} else {
    Join-Path $env:SystemDrive "cr-target"
}
$releaseCacheRoot = if ($env:CODEREADER_RELEASE_CACHE_DIR) {
    [System.IO.Path]::GetFullPath($env:CODEREADER_RELEASE_CACHE_DIR)
} elseif (Test-Path -LiteralPath "D:\CodeReaderCache") {
    "D:\CodeReaderCache\release"
} else {
    Join-Path $env:LOCALAPPDATA "CodeReader\release"
}
$releaseTemp = Join-Path $releaseCacheRoot "temp"
$releaseLocalAppData = Join-Path $releaseCacheRoot "local-app-data"

New-Item -ItemType Directory -Force -Path $cargoTarget | Out-Null
New-Item -ItemType Directory -Force -Path $releaseTemp | Out-Null
New-Item -ItemType Directory -Force -Path $releaseLocalAppData | Out-Null

$env:CARGO_TARGET_DIR = $cargoTarget
$env:CODEREADER_CARGO_TARGET_DIR = $cargoTarget
$env:CODEREADER_RELEASE_CACHE_DIR = $releaseCacheRoot
$env:TEMP = $releaseTemp
$env:TMP = $releaseTemp
$env:LOCALAPPDATA = $releaseLocalAppData

function Invoke-Checked {
    param(
        [string]$Label,
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Label"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

Push-Location $repoRoot
try {
    if (-not $SkipChecks) {
        Invoke-Checked "Environment check" { & node scripts/check-environment.mjs }
        Invoke-Checked "Frontend tests" { & node scripts/test.mjs --run }
        Invoke-Checked "Frontend lint" { & npm run lint }
        Invoke-Checked "Frontend format" { & npm run format:check }
        Invoke-Checked "TypeScript check" { & node node_modules/typescript/bin/tsc --noEmit }
        Invoke-Checked "Rust tests" {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/cargo-test.ps1
        }
        Invoke-Checked "Rust clippy" {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/cargo-clippy.ps1
        }
        Invoke-Checked "Rust check" {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/cargo-check.ps1
        }
        Invoke-Checked "Frontend production build" { & node scripts/build.mjs }
    }

    Invoke-Checked "Windows release runtime build" {
        & cargo build `
            --manifest-path src-tauri/Cargo.toml `
            --release `
            --bin codereader `
            --target $rustTarget
    }
    $targetReleaseRoot = Join-Path $cargoTarget "$rustTarget\release"
    $webViewLoaderSource = Join-Path $targetReleaseRoot "WebView2Loader.dll"
    if (-not (Test-Path -LiteralPath $webViewLoaderSource)) {
        throw "Cargo did not produce the required WebView2 runtime loader: $webViewLoaderSource"
    }
    $unusedCdylib = Join-Path $targetReleaseRoot "codereader_lib.dll"
    if (Test-Path -LiteralPath $unusedCdylib) {
        Remove-Item -LiteralPath $unusedCdylib -Force
    }

    $bundleTargets = if ($NsisOnly) { "nsis" } else { "nsis,msi" }
    Invoke-Checked "Tauri Windows bundle ($bundleTargets)" {
        & node scripts/tauri.mjs build --bundles $bundleTargets --target $rustTarget
    }

    $releaseRoot = $targetReleaseRoot
    $bundleRoot = Join-Path $releaseRoot "bundle"
    $artifactDirectory = [System.IO.Path]::GetFullPath(
        (Join-Path $repoRoot "artifacts\windows-$Architecture")
    )
    $repoPrefix = $repoRoot.TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $artifactDirectory.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean artifact directory outside the repository: $artifactDirectory"
    }
    if (Test-Path -LiteralPath $artifactDirectory) {
        Remove-Item -LiteralPath $artifactDirectory -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null

    $bundlePatterns = @(
        (Join-Path $bundleRoot "nsis\*.exe")
    )
    if (-not $NsisOnly) {
        $bundlePatterns += Join-Path $bundleRoot "msi\*.msi"
    }
    $bundles = @(
        Get-ChildItem -Path $bundlePatterns -File -ErrorAction SilentlyContinue |
            Sort-Object FullName
    )
    if (-not $bundles) {
        throw "No Windows installer bundles were found under $bundleRoot"
    }

    $manifestEntries = foreach ($bundle in $bundles) {
        $destination = Join-Path $artifactDirectory $bundle.Name
        Copy-Item -LiteralPath $bundle.FullName -Destination $destination -Force
        $copied = Get-Item -LiteralPath $destination
        [pscustomobject]@{
            name = $copied.Name
            bundleType = $copied.Extension.TrimStart(".").ToLowerInvariant()
            architecture = if ($Architecture -eq "arm64") { "aarch64" } else { "x86_64" }
            sizeBytes = $copied.Length
            sha256 = $null
            sourcePath = $bundle.FullName
            artifactPath = $copied.FullName
        }
    }

    $package = Get-Content -Raw package.json | ConvertFrom-Json

    $copiedArtifacts = @($manifestEntries | ForEach-Object { Get-Item -LiteralPath $_.artifactPath })
    $signingManifestPath = Join-Path $artifactDirectory "signing-manifest.json"
    $signingEntries = @(Protect-ReleaseArtifacts -Artifacts $copiedArtifacts -ManifestPath $signingManifestPath)
    foreach ($entry in $manifestEntries) {
        $signingEntry = $signingEntries |
            Where-Object { $_.name -eq $entry.name } |
            Select-Object -First 1
        $signingSummary = [ordered]@{
            signed = $signingEntry.signed
            verified = $signingEntry.verified
            signatureStatus = $signingEntry.signatureStatus
            signer = $signingEntry.signer
            thumbprint = $signingEntry.thumbprint
            timestampSigner = $signingEntry.timestampSigner
        }
        Add-Member -NotePropertyName signing -NotePropertyValue $signingSummary -InputObject $entry
        $finalArtifact = Get-Item -LiteralPath $entry.artifactPath
        $entry.sizeBytes = $finalArtifact.Length
        $entry.sha256 = (Get-FileHash -LiteralPath $entry.artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }

    $manifest = [ordered]@{
        product = "CodeReader"
        version = $package.version
        platform = "windows"
        architecture = if ($Architecture -eq "arm64") { "aarch64" } else { "x86_64" }
        generatedAt = [DateTimeOffset]::Now.ToString("o")
        artifacts = @($manifestEntries)
        signingManifest = $signingManifestPath
    }
    $manifestPath = Join-Path $artifactDirectory "release-manifest.json"
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $manifestPath

    $checksumPath = Join-Path $artifactDirectory "SHA256SUMS.txt"
    $manifestEntries |
        ForEach-Object { "$($_.sha256)  $($_.name)" } |
        Set-Content -Encoding ASCII $checksumPath

    Write-Host ""
    Write-Host "Release artifacts:"
    $manifestEntries |
        Select-Object name, bundleType, architecture, sizeBytes, sha256, artifactPath |
        Format-Table -AutoSize
    Write-Host "Manifest: $manifestPath"
    Write-Host "Signing manifest: $signingManifestPath"
    Write-Host "Checksums: $checksumPath"
} finally {
    Pop-Location
}
