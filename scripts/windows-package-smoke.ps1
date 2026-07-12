param(
    [ValidateSet("x64", "arm64")][string]$Architecture,
    [string]$ReleaseTag,
    [string]$CommitSha,
    [string]$ArtifactDirectory,
    [string]$Output,
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

function Invoke-ExpectedExit {
    param([string]$Label, [string]$FilePath, [string[]]$ArgumentList, [int[]]$Allowed = @(0))
    Write-Host "==> $Label"
    $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -Wait -PassThru
    if ($process.ExitCode -notin $Allowed) {
        throw "$Label failed with exit code $($process.ExitCode)."
    }
}

function Get-CodeReaderUninstallEntry {
    $roots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    return Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -eq "CodeReader" } |
        Select-Object -First 1
}

function Normalize-CodeReaderInstallLocation {
    param([AllowNull()][string]$InstallLocation)
    if ([string]::IsNullOrWhiteSpace($InstallLocation)) { return $null }

    $normalized = $InstallLocation.Trim()
    if ($normalized.Length -ge 2 -and $normalized.StartsWith('"') -and $normalized.EndsWith('"')) {
        $normalized = $normalized.Substring(1, $normalized.Length - 2).Trim()
    }
    if ([string]::IsNullOrWhiteSpace($normalized)) { return $null }
    return $normalized
}

function Resolve-CodeReaderExecutable {
    param($Entry)
    $candidates = @()
    $installLocation = Normalize-CodeReaderInstallLocation ([string]$Entry.InstallLocation)
    if ($installLocation) {
        $candidates += Join-Path -Path $installLocation -ChildPath "CodeReader.exe"
        $candidates += Join-Path -Path $installLocation -ChildPath "codereader.exe"
    }
    if ($Entry.DisplayIcon) {
        $candidates += ($Entry.DisplayIcon -replace ',\d+$', '').Trim('"')
    }
    $executable = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $executable) { throw "Installed CodeReader executable was not found." }
    return $executable
}

function Test-CodeReaderWindow {
    param([string]$Executable)
    $process = Start-Process -FilePath $Executable -PassThru
    try {
        $deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
        do {
            Start-Sleep -Milliseconds 500
            $process.Refresh()
            if ($process.HasExited) { throw "CodeReader exited before opening its main window." }
            if ($process.MainWindowHandle -ne 0) {
                Add-Type -AssemblyName UIAutomationClient
                $element = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
                if ($element -and $element.Current.Name -like "*CodeReader*") { return }
            }
        } while ([DateTimeOffset]::UtcNow -lt $deadline)
        throw "CodeReader did not expose its main window within 30 seconds."
    } finally {
        if (-not $process.HasExited) {
            $process.CloseMainWindow() | Out-Null
            if (-not $process.WaitForExit(5000)) { Stop-Process -Id $process.Id -Force }
        }
    }
}

function Invoke-NsisUninstall {
    param($Entry)
    $command = [string]$Entry.UninstallString
    if ($command -match '^"([^"]+\.exe)"') { $uninstaller = $Matches[1] }
    elseif ($command -match '^(.+?\.exe)(?:\s|$)') { $uninstaller = $Matches[1] }
    else { throw "Cannot parse the NSIS uninstall command." }
    Invoke-ExpectedExit "Uninstall NSIS package" $uninstaller @("/S")
}

if ($SelfTest) {
    $quoted = Normalize-CodeReaderInstallLocation '"C:\Program Files\CodeReader"'
    if ($quoted -ne "C:\Program Files\CodeReader") { throw "Quoted InstallLocation normalization failed." }
    $plain = Normalize-CodeReaderInstallLocation "C:\Program Files\CodeReader"
    if ($plain -ne "C:\Program Files\CodeReader") { throw "Plain InstallLocation normalization failed." }
    if (Normalize-CodeReaderInstallLocation '""') { throw "Empty InstallLocation must normalize to null." }
    Write-Host "Windows package smoke helper self-test passed."
    exit 0
}

foreach ($required in @{
        Architecture = $Architecture
        ReleaseTag = $ReleaseTag
        CommitSha = $CommitSha
        ArtifactDirectory = $ArtifactDirectory
        Output = $Output
    }.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace([string]$required.Value)) {
        throw "Missing required parameter: $($required.Key)."
    }
}

$expectedRunnerArch = if ($Architecture -eq "arm64") { "ARM64" } else { "AMD64" }
if ($env:PROCESSOR_ARCHITECTURE -ne $expectedRunnerArch) {
    throw "Windows $Architecture smoke requires a native $expectedRunnerArch runner."
}
if ($CommitSha -notmatch '^[0-9a-fA-F]{40}$') { throw "Invalid commit SHA." }

$version = $ReleaseTag -replace '^v', ''
$artifactRoot = [IO.Path]::GetFullPath($ArtifactDirectory)
$nsisName = "CodeReader_${version}_windows_${Architecture}_setup.exe"
$msiName = "CodeReader_${version}_windows_${Architecture}.msi"
$nsis = Join-Path $artifactRoot $nsisName
$msi = Join-Path $artifactRoot $msiName
foreach ($path in @($nsis, $msi)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing release package: $([IO.Path]::GetFileName($path))" }
}

Invoke-ExpectedExit "Install NSIS package" $nsis @("/S")
$nsisEntry = Get-CodeReaderUninstallEntry
if (-not $nsisEntry) { throw "NSIS installation did not register CodeReader." }
Test-CodeReaderWindow (Resolve-CodeReaderExecutable $nsisEntry)
Invoke-NsisUninstall $nsisEntry
Start-Sleep -Seconds 2
if (Get-CodeReaderUninstallEntry) { throw "NSIS uninstall entry remains registered." }

Invoke-ExpectedExit "Install MSI package" "msiexec.exe" @("/i", "`"$msi`"", "/qn", "/norestart") @(0, 3010)
$msiEntry = Get-CodeReaderUninstallEntry
if (-not $msiEntry) { throw "MSI installation did not register CodeReader." }
Test-CodeReaderWindow (Resolve-CodeReaderExecutable $msiEntry)
Invoke-ExpectedExit "Uninstall MSI package" "msiexec.exe" @("/x", "`"$msi`"", "/qn", "/norestart") @(0, 3010)
Start-Sleep -Seconds 2
if (Get-CodeReaderUninstallEntry) { throw "MSI uninstall entry remains registered." }

$packages = @($nsisName, $msiName) | ForEach-Object {
    $path = Join-Path $artifactRoot $_
    [ordered]@{ name = $_; sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$evidence = [ordered]@{
    schemaVersion = 1
    releaseTag = $ReleaseTag
    commitSha = $CommitSha.ToLowerInvariant()
    platform = "windows"
    arch = $Architecture
    status = "pass"
    packages = $packages
    checks = @(
        [ordered]@{ name = "nsis-install-window-uninstall"; status = "pass" },
        [ordered]@{ name = "msi-install-window-uninstall"; status = "pass" }
    )
}
$outputPath = [IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $outputPath -Encoding UTF8
Write-Host "Native Windows package smoke passed for $Architecture."
