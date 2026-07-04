# Authenticode signing and verification framework for CodeReader Windows release artifacts.
#
# Signing is opt-in via environment variables. When no certificate is configured the
# framework records every artifact as an "unsigned-internal-beta" build and lets the
# release proceed, so internal beta packaging never requires a real certificate.
#
# Configuration:
#   CODEREADER_CODESIGN_PFX_PATH        Path to a PFX code-signing certificate.
#   CODEREADER_CODESIGN_PASSWORD        Password for the PFX (never written to manifests).
#   CODEREADER_CODESIGN_SHA1            SHA1 thumbprint of a certificate in the Windows store.
#   CODEREADER_CODESIGN_TIMESTAMP_URL   RFC 3161 timestamp server URL.
#   CODEREADER_CODESIGN_DIGEST_ALG      Digest algorithm (default sha256).
#   CODEREADER_CODESIGN_TIMESTAMP_ALG   Timestamp digest algorithm (default sha256).
#   CODEREADER_CODESIGN_REQUIRED        Set to "1" to fail the release when no cert is configured.

function Get-SigningConfiguration {
    $pfxPath = $env:CODEREADER_CODESIGN_PFX_PATH
    $config = [ordered]@{
        Enabled = $false
        Required = $env:CODEREADER_CODESIGN_REQUIRED -eq "1"
        PfxPath = $pfxPath
        PfxPassword = $env:CODEREADER_CODESIGN_PASSWORD
        Sha1 = $env:CODEREADER_CODESIGN_SHA1
        TimestampUrl = $env:CODEREADER_CODESIGN_TIMESTAMP_URL
        TimestampAlgorithm = if ($env:CODEREADER_CODESIGN_TIMESTAMP_ALG) {
            $env:CODEREADER_CODESIGN_TIMESTAMP_ALG
        } else {
            "sha256"
        }
        DigestAlgorithm = if ($env:CODEREADER_CODESIGN_DIGEST_ALG) {
            $env:CODEREADER_CODESIGN_DIGEST_ALG
        } else {
            "sha256"
        }
    }

    $hasPfx = -not [string]::IsNullOrWhiteSpace($pfxPath) -and (Test-Path -LiteralPath $pfxPath)
    $hasSha1 = -not [string]::IsNullOrWhiteSpace($config.Sha1)
    if ($hasPfx -or $hasSha1) {
        $config.Enabled = $true
    }
    return $config
}

function Resolve-SignTool {
    $sdkRoots = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
        "${env:ProgramFiles}\Windows Kits\10\bin"
    )
    foreach ($root in $sdkRoots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }
        $candidate = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match "^\d+\." } |
            Sort-Object Name -Descending |
            Select-Object -First 1
        if ($candidate) {
            $signTool = Join-Path $candidate.FullName "x64\signtool.exe"
            if (Test-Path -LiteralPath $signTool) {
                return $signTool
            }
        }
    }
    $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    return $null
}

function Invoke-AuthenticodeSigning {
    param(
        [string]$ArtifactPath,
        [string]$SignToolPath,
        $Configuration
    )

    $signArgs = @("sign", "/fd", $Configuration.DigestAlgorithm)
    if ($Configuration.PfxPath -and (Test-Path -LiteralPath $Configuration.PfxPath)) {
        $signArgs += @("/f", $Configuration.PfxPath, "/p", $Configuration.PfxPassword)
    } elseif (-not [string]::IsNullOrWhiteSpace($Configuration.Sha1)) {
        $signArgs += @("/sha1", $Configuration.Sha1)
    } else {
        throw "Signing was requested but neither a PFX path nor a SHA1 certificate thumbprint was provided."
    }
    if (-not [string]::IsNullOrWhiteSpace($Configuration.TimestampUrl)) {
        $signArgs += @("/tr", $Configuration.TimestampUrl, "/td", $Configuration.TimestampAlgorithm)
    }
    $signArgs += $ArtifactPath

    & $SignToolPath @signArgs
    if ($LASTEXITCODE -ne 0) {
        throw "signtool sign failed for $ArtifactPath with exit code $LASTEXITCODE."
    }
}

function Test-AuthenticodeSignature {
    param(
        [string]$ArtifactPath,
        [string]$SignToolPath
    )

    $signature = Get-AuthenticodeSignature -FilePath $ArtifactPath
    $signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
    $thumbprint = if ($signature.SignerCertificate) {
        $signature.SignerCertificate.Thumbprint
    } else {
        $null
    }
    $notAfter = if ($signature.SignerCertificate) {
        $signature.SignerCertificate.NotAfter.ToString("o")
    } else {
        $null
    }
    $timeStamper = if ($signature.TimeStamperCertificate) {
        $signature.TimeStamperCertificate.Subject
    } else {
        $null
    }

    $result = [ordered]@{
        status = $signature.Status.ToString()
        signer = $signer
        thumbprint = $thumbprint
        notAfter = $notAfter
        timeStamper = $timeStamper
        verified = $false
        note = $null
    }

    if ($SignToolPath) {
        if (-not $signature.SignerCertificate) {
            $result.note = "Artifact is unsigned; signtool verification was skipped for the internal beta manifest."
            return $result
        }
        $output = & $SignToolPath verify /pa /all $ArtifactPath 2>&1
        $result.note = ($output | Out-String).Trim()
        $result.verified = ($LASTEXITCODE -eq 0)
    } else {
        $result.verified = ($signature.Status -eq "Valid" -and $null -ne $signature.SignerCertificate)
        $result.note = "signtool.exe unavailable; verified via Get-AuthenticodeSignature only."
    }
    return $result
}

function Export-SigningManifest {
    param(
        [string]$Path,
        $Config,
        [object[]]$Entries
    )

    $manifest = [ordered]@{
        product = "CodeReader"
        generatedAt = [DateTimeOffset]::Now.ToString("o")
        configuration = [ordered]@{
            enabled = $Config.Enabled
            required = $Config.Required
            digestAlgorithm = $Config.DigestAlgorithm
            timestampConfigured = -not [string]::IsNullOrWhiteSpace($Config.TimestampUrl)
            timestampAlgorithm = $Config.TimestampAlgorithm
        }
        artifacts = @($Entries)
    }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $Path
}

function Protect-ReleaseArtifacts {
    param(
        [Parameter(Mandatory)][object[]]$Artifacts,
        [string]$ManifestPath
    )

    $config = Get-SigningConfiguration
    $signTool = Resolve-SignTool
    $entries = @()

    foreach ($artifact in $Artifacts) {
        $entry = [ordered]@{
            name = $artifact.Name
            path = $artifact.FullName
            signed = $false
            signer = $null
            thumbprint = $null
            timestampSigner = $null
            signatureStatus = $null
            verified = $false
            verificationNote = $null
        }

        if ($config.Enabled) {
            if (-not $signTool) {
                throw "Authenticode signing is configured but signtool.exe was not found. Install a Windows SDK or add signtool to PATH."
            }
            Invoke-AuthenticodeSigning -ArtifactPath $artifact.FullName -SignToolPath $signTool -Configuration $config
        } elseif ($config.Required) {
            throw "Authenticode signing is required (CODEREADER_CODESIGN_REQUIRED=1) but no certificate was configured. Set CODEREADER_CODESIGN_PFX_PATH/CODEREADER_CODESIGN_PASSWORD or CODEREADER_CODESIGN_SHA1."
        }

        $verification = Test-AuthenticodeSignature -ArtifactPath $artifact.FullName -SignToolPath $signTool
        $entry.signed = $null -ne $verification.signer
        $entry.signer = $verification.signer
        $entry.thumbprint = $verification.thumbprint
        $entry.timestampSigner = $verification.timeStamper
        $entry.signatureStatus = $verification.status
        $entry.verified = $verification.verified
        $entry.verificationNote = $verification.note

        if ($config.Enabled -and -not $verification.verified) {
            $entries += $entry
            Export-SigningManifest -Path $ManifestPath -Config $config -Entries $entries
            throw "Signature verification failed for $($artifact.FullName). Verification output:`n$($verification.note)"
        }

        $entries += $entry
    }

    Export-SigningManifest -Path $ManifestPath -Config $config -Entries $entries

    Write-Host ""
    Write-Host "Authenticode signing summary:"
    $entries |
        Select-Object name, signed, verified, signatureStatus |
        Format-Table -AutoSize
    Write-Host "Signing manifest: $ManifestPath"

    return $entries
}
