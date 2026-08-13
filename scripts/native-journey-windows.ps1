param(
    [ValidateSet("x64", "arm64")][string]$Architecture,
    [string]$ReleaseTag,
    [string]$CommitSha,
    [string]$HarnessCommitSha,
    [string]$Package,
    [string]$Project,
    [string]$Fixture010,
    [string]$Fixture011,
    [string]$Fixture011Current,
    [string]$Output,
    [switch]$RequiredPathSelfTest,
    [switch]$DatabasePathSelfTest,
    [switch]$RegistryDiscoverySelfTest
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RequiredChecks = @(
    "native-picker-open-project", "explanation-generation", "restart-reauthorize-restore",
    "legacy-0.10-upgrade", "legacy-0.11-upgrade", "uninstall-data-policy",
    "keyboard-focus-roundtrip", "reduced-motion", "long-content", "zoom-200-contrast"
)
$Observed = @{}
foreach ($name in $RequiredChecks) { $Observed[$name] = $false }

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

if ($RequiredPathSelfTest) {
    $existing = [IO.Path]::GetTempFileName()
    try {
        foreach ($expectedMissing in @(0, 1, 2)) {
            $probePaths = switch ($expectedMissing) {
                0 { @($existing) }
                1 { @($existing, "$existing.missing") }
                2 { @("$existing.missing-one", "$existing.missing-two") }
            }
            $missing = @($probePaths | Where-Object { -not (Test-Path -LiteralPath $_) })
            if ($missing.Count -ne $expectedMissing) { throw "Required path count self-test failed." }
            [ordered]@{ expected = $expectedMissing; actual = $missing.Count } | ConvertTo-Json -Compress
        }
        exit 0
    } finally {
        Remove-Item -LiteralPath $existing -Force -ErrorAction SilentlyContinue
    }
}

function Complete-Check([string]$Name, [bool]$ProbeResult) {
    Assert-True ($Name -in $RequiredChecks) "Unknown native journey check: $Name"
    Assert-True $ProbeResult "Native journey probe did not complete: $Name"
    $Observed[$Name] = $true
}

function Invoke-Process([string]$FilePath, [string[]]$Arguments, [int[]]$Allowed = @(0)) {
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -Wait -PassThru
    if ($process.ExitCode -notin $Allowed) { throw "$FilePath failed with exit code $($process.ExitCode)." }
}

function Get-SafeProperty($Object, [string]$Name) {
    if ($null -eq $Object -or $null -eq $Object.PSObject.Properties[$Name]) { return $null }
    [string]$Object.$Name
}

function Get-MsiProperty([string]$MsiPath, [string]$Name) {
    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        $database = $installer.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $installer, @($MsiPath, 0))
        $view = $database.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $database, @("SELECT ``Value`` FROM ``Property`` WHERE ``Property``='$Name'"))
        $view.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $view, $null) | Out-Null
        $record = $view.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $view, $null)
        if ($null -eq $record) { throw 'missing-property' }
        [string]$record.GetType().InvokeMember('StringData', 'GetProperty', $null, $record, 1)
    } catch {
        throw 'Native journey phase=installer-discovery category=package-identity-error exit=1.'
    }
}

function Get-MsiInstalledLocation([string]$ProductCode) {
    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        [string]$installer.GetType().InvokeMember('ProductInfo', 'GetProperty', $null, $installer, @($ProductCode, 'InstallLocation'))
    } catch {
        return $null
    }
}

function Assert-MsiProductIdentity([string]$ProductCode, [string]$ProductVersion) {
    if ($ProductCode -notmatch '^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$' -or $ProductVersion -ne '1.0.0') {
        throw 'Native journey phase=installer-discovery category=invalid-package exit=1.'
    }
}

function Get-ExecutableCandidates($Entry, [AllowNull()][string]$InstalledLocation) {
    $candidates = @()
    $root = Get-SafeProperty $Entry 'InstallLocation'
    if (-not [string]::IsNullOrWhiteSpace($root)) { $root = $root.Trim('"') }
    if ([string]::IsNullOrWhiteSpace($root)) { $root = $InstalledLocation }
    if (-not [string]::IsNullOrWhiteSpace($root)) {
        $candidates += Join-Path $root 'CodeReader.exe'
        $candidates += Join-Path $root 'codereader.exe'
    }
    $displayIcon = Get-SafeProperty $Entry 'DisplayIcon'
    if (-not [string]::IsNullOrWhiteSpace($displayIcon)) { $candidates += $displayIcon.Split(',')[0].Trim('"') }
    if ($candidates.Count -eq 0) { throw 'Native journey phase=installer-discovery category=invalid-entry exit=1.' }
    $candidates
}

function Select-CodeReaderUninstallEntry($Entries, [string]$ProductCode, [string]$DisplayVersion, [switch]$AllowNotFound) {
    $matches = @($Entries | Where-Object {
        $null -ne $_ -and
        (Get-SafeProperty $_ 'DisplayName') -ceq 'CodeReader' -and
        (Get-SafeProperty $_ 'PSChildName') -ieq $ProductCode -and
        (Get-SafeProperty $_ 'DisplayVersion') -ceq $DisplayVersion -and
        (Get-SafeProperty $_ 'Publisher') -ceq 'CodeReader Project'
    })
    if ($matches.Count -eq 0) {
        if ($AllowNotFound) { return $null }
        throw 'Native journey phase=installer-discovery category=not-found exit=1.'
    }
    if ($matches.Count -ne 1) {
        throw 'Native journey phase=installer-discovery category=ambiguous exit=1.'
    }
    $matches[0]
}

function Invoke-InstallerCleanup($PrimaryFailure, [scriptblock]$Probe, [scriptblock]$Uninstall) {
    try {
        $cleanupEntry = & $Probe
        if ($null -ne $cleanupEntry) { & $Uninstall }
    } catch {
        if ($null -eq $PrimaryFailure) { throw }
        Write-Warning 'Native journey cleanup failed category=cleanup-error; preserving primary phase failure.'
    }
    if ($null -ne $PrimaryFailure) { throw $PrimaryFailure }
}

if ($RegistryDiscoverySelfTest) {
    $missingProperty = [pscustomobject]@{ Publisher = 'test' }
    $unrelated = [pscustomobject]@{ DisplayName = 'Other' }
    $codeReader = [pscustomobject]@{ DisplayName = 'CodeReader'; PSChildName = '{CURRENT-PRODUCT}'; DisplayVersion = '1.0.0'; Publisher = 'CodeReader Project'; InstallLocation = 'controlled' }
    $staleCodeReader = [pscustomobject]@{ DisplayName = 'CodeReader'; PSChildName = '{STALE-PRODUCT}'; DisplayVersion = '0.11.0'; Publisher = 'CodeReader Project' }
    $secondCurrent = [pscustomobject]@{ DisplayName = 'CodeReader'; PSChildName = '{CURRENT-PRODUCT}'; DisplayVersion = '1.0.0'; Publisher = 'CodeReader Project'; DisplayIcon = 'controlled' }
    $scenarios = @(
        [ordered]@{ expected = 'unique'; entries = @($missingProperty, $unrelated, $staleCodeReader, $codeReader) },
        [ordered]@{ expected = 'not-found'; entries = @($missingProperty, $unrelated) },
        [ordered]@{ expected = 'ambiguous'; entries = @($missingProperty, $codeReader, $secondCurrent) },
        [ordered]@{ expected = 'not-found'; entries = @($staleCodeReader) }
    )
    foreach ($scenario in $scenarios) {
        $actual = 'unique'
        try {
            Select-CodeReaderUninstallEntry $scenario.entries '{CURRENT-PRODUCT}' '1.0.0' | Out-Null
        } catch {
            if ($_.Exception.Message -match 'category=([a-z-]+)') { $actual = $Matches[1] } else { throw }
        }
        if ($actual -ne $scenario.expected) { throw 'Registry discovery self-test failed.' }
        [ordered]@{ expected = $scenario.expected; actual = $actual } | ConvertTo-Json -Compress
    }
    $cleanupScenarios = @(
        [ordered]@{ expected = 'installed-cleaned'; primary = $null; probe = { $codeReader }; uninstall = { 'installed-cleaned' } },
        [ordered]@{ expected = 'already-clean'; primary = $null; probe = { $null }; uninstall = { throw 'unexpected' } },
        [ordered]@{ expected = 'ambiguous-failed'; primary = $null; probe = { throw 'Native journey phase=installer-discovery category=ambiguous exit=1.' }; uninstall = { throw 'unexpected' } },
        [ordered]@{ expected = 'primary-preserved'; primary = [System.Management.Automation.ErrorRecord]::new([Exception]::new('Native journey phase=product category=failed exit=9.'), 'primary', [System.Management.Automation.ErrorCategory]::OperationStopped, $null); probe = { throw 'Native journey phase=installer-discovery category=registry-error exit=1.' }; uninstall = { throw 'unexpected' } }
    )
    foreach ($scenario in $cleanupScenarios) {
        $actual = if ($scenario.expected -eq 'already-clean') { 'already-clean' } else { 'installed-cleaned' }
        try {
            $result = Invoke-InstallerCleanup $scenario.primary $scenario.probe $scenario.uninstall 3>$null
            if ($null -ne $result) { $actual = [string]$result }
        } catch {
            if ($_.Exception.Message -match 'category=ambiguous') { $actual = 'ambiguous-failed' }
            elseif ($_.Exception.Message -match 'phase=product category=failed') { $actual = 'primary-preserved' }
            else { throw }
        }
        if ($actual -ne $scenario.expected) { throw 'Cleanup semantics self-test failed.' }
        [ordered]@{ expected = $scenario.expected; actual = $actual } | ConvertTo-Json -Compress
    }
    $invalidCurrent = [pscustomobject]@{ DisplayName = 'CodeReader'; PSChildName = '{CURRENT-PRODUCT}'; DisplayVersion = '1.0.0'; Publisher = 'CodeReader Project' }
    try {
        Get-ExecutableCandidates $invalidCurrent $null | Out-Null
        throw 'Invalid current package self-test did not fail.'
    } catch {
        if ($_.Exception.Message -notmatch 'category=invalid-entry') { throw }
        [ordered]@{ expected = 'invalid-entry'; actual = 'invalid-entry' } | ConvertTo-Json -Compress
    }
    foreach ($identity in @(
        [ordered]@{ code = '{12345678-1234-ABCD-9876-1234567890ab}'; expected = 'valid-package' },
        [ordered]@{ code = '{1234567-81234-ABCD-9876-1234567890ab}'; expected = 'invalid-package' },
        [ordered]@{ code = '{--------}'; expected = 'invalid-package' },
        [ordered]@{ code = '{12345678-1234-ABCG-9876-1234567890ab}'; expected = 'invalid-package' }
    )) {
        $actual = 'valid-package'
        try { Assert-MsiProductIdentity $identity.code '1.0.0' } catch {
            if ($_.Exception.Message -match 'category=invalid-package') { $actual = 'invalid-package' } else { throw }
        }
        if ($actual -ne $identity.expected) { throw 'MSI product identity self-test failed.' }
        [ordered]@{ expected = $identity.expected; actual = $actual } | ConvertTo-Json -Compress
    }
    exit 0
}

function Get-UninstallEntry([string]$ProductCode, [string]$DisplayVersion) {
    try {
        $entries = @()
        foreach ($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall')) {
            try {
                $children = @(Get-ChildItem -LiteralPath $root -ErrorAction Stop)
            } catch [System.Management.Automation.ItemNotFoundException] {
                continue
            }
            foreach ($child in $children) {
                $entries += Get-ItemProperty -LiteralPath $child.PSPath -ErrorAction Stop
            }
        }
        Select-CodeReaderUninstallEntry $entries $ProductCode $DisplayVersion
    } catch {
        if ($_.Exception.Message -match '^Native journey phase=installer-discovery category=(?:not-found|ambiguous) exit=1\.$') { throw }
        throw 'Native journey phase=installer-discovery category=registry-error exit=1.'
    }
}

function Get-UninstallEntryForCleanup([string]$ProductCode, [string]$DisplayVersion) {
    try {
        $entries = @()
        foreach ($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall')) {
            try {
                $children = @(Get-ChildItem -LiteralPath $root -ErrorAction Stop)
            } catch [System.Management.Automation.ItemNotFoundException] {
                continue
            }
            foreach ($child in $children) {
                $entries += Get-ItemProperty -LiteralPath $child.PSPath -ErrorAction Stop
            }
        }
        Select-CodeReaderUninstallEntry $entries $ProductCode $DisplayVersion -AllowNotFound
    } catch {
        if ($_.Exception.Message -match '^Native journey phase=installer-discovery category=ambiguous exit=1\.$') { throw }
        throw 'Native journey phase=installer-discovery category=registry-error exit=1.'
    }
}

function Resolve-Executable([string]$ProductCode, [string]$DisplayVersion) {
    try {
        $entry = Get-UninstallEntry $ProductCode $DisplayVersion
        $candidates = @(Get-ExecutableCandidates $entry (Get-MsiInstalledLocation $ProductCode))
        $candidate = $candidates |
            Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($null -eq $candidate) { throw 'invalid-entry' }
        $candidate
    } catch {
        if ($_.Exception.Message -match '^Native journey phase=installer-discovery category=(?:not-found|ambiguous) exit=1\.$') {
            throw
        }
        throw 'Native journey phase=installer-discovery category=invalid-entry exit=1.'
    }
}

function Find-Element($Root, [string]$Name, $ControlType = $null, [int]$Timeout = 30) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($Timeout)
    do {
        $conditions = New-Object System.Collections.Generic.List[System.Windows.Automation.Condition]
        $conditions.Add((New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, $Name)))
        if ($null -ne $ControlType) {
            $conditions.Add((New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty, $ControlType)))
        }
        $condition = New-Object System.Windows.Automation.AndCondition($conditions.ToArray())
        $element = $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
        if ($null -ne $element) { return $element }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "UIAutomation element not found: $Name"
}

function Find-ElementByPrefix($Root, [string]$Prefix, $ControlType, [int]$Timeout = 30) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($Timeout)
    do {
        $condition = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty, $ControlType)
        $elements = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
        $element = $elements | Where-Object { $_.Current.Name.StartsWith($Prefix) } | Select-Object -First 1
        if ($null -ne $element) { return $element }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "UIAutomation element prefix not found: $Prefix"
}

function Invoke-Element($Element) {
    $pattern = $Element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    Assert-True ($null -ne $pattern) "Element has no InvokePattern: $($Element.Current.Name)"
    $pattern.Invoke()
}

function Select-Element($Element) {
    $candidate = $null
    if ($Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$candidate)) {
        Invoke-Element $Element
        return
    }
    $pattern = $Element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    Assert-True ($null -ne $pattern) "Element is neither invokable nor selectable: $($Element.Current.Name)"
    $pattern.Select()
}

function Assert-FocusedAndSelected($Element, [string]$Context) {
    $selection = $Element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    Assert-True ($Element.Current.HasKeyboardFocus -and $selection.Current.IsSelected) "$Context requires both UIA keyboard focus and selected state."
    return $true
}

function Set-ElementValue($Element, [string]$Value) {
    $pattern = $Element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    Assert-True (-not $pattern.Current.IsReadOnly) "Editable control is read-only."
    $pattern.SetValue($Value)
}

function Start-App([string]$Executable) {
    $process = Start-Process -FilePath $Executable -PassThru -Environment @{
        APPDATA = $env:APPDATA
        LOCALAPPDATA = $env:LOCALAPPDATA
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
    }
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 300
        $process.Refresh()
        if ($process.HasExited) { throw "CodeReader exited before opening its main window." }
    } while ($process.MainWindowHandle -eq 0 -and [DateTimeOffset]::UtcNow -lt $deadline)
    Assert-True ($process.MainWindowHandle -ne 0) "Main window unavailable to UIAutomation."
    [pscustomobject]@{
        Process = $process
        Root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
    }
}

function Wait-CodeReaderDatabase([string[]]$Candidates, [int]$TimeoutSeconds = 30) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $matches = @($Candidates | Where-Object { Test-Path -LiteralPath $_ })
        if ($matches.Count -eq 1) { return $matches[0] }
        if ($matches.Count -gt 1) { throw 'Native journey phase=migration category=ambiguous-database exit=1.' }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw 'Native journey phase=migration category=database-not-created exit=1.'
}

if ($DatabasePathSelfTest) {
    $root = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
    $one = Join-Path $root 'one.sqlite'
    $two = Join-Path $root 'two.sqlite'
    try {
        New-Item -ItemType Directory -Force -Path $root | Out-Null
        try { Wait-CodeReaderDatabase @($one, $two) 0 | Out-Null } catch {
            Assert-True ($_.Exception.Message -eq 'Native journey phase=migration category=database-not-created exit=1.') 'Database wait zero-result contract failed.'
            [ordered]@{ expected = 'not-found'; actual = 'not-found' } | ConvertTo-Json -Compress
        }
        New-Item -ItemType File -Force -Path $one | Out-Null
        Assert-True ((Wait-CodeReaderDatabase @($one, $two) 0) -eq $one) 'Database wait unique-result contract failed.'
        [ordered]@{ expected = 'unique'; actual = 'unique' } | ConvertTo-Json -Compress
        New-Item -ItemType File -Force -Path $two | Out-Null
        try { Wait-CodeReaderDatabase @($one, $two) 0 | Out-Null } catch {
            Assert-True ($_.Exception.Message -eq 'Native journey phase=migration category=ambiguous-database exit=1.') 'Database wait many-result contract failed.'
            [ordered]@{ expected = 'ambiguous'; actual = 'ambiguous' } | ConvertTo-Json -Compress
        }
        exit 0
    } finally {
        Remove-Item -Recurse -Force -LiteralPath $root -ErrorAction SilentlyContinue
    }
}

function Stop-App($App) {
    if ($null -ne $App -and -not $App.Process.HasExited) {
        $App.Process.CloseMainWindow() | Out-Null
        if (-not $App.Process.WaitForExit(5000)) { Stop-Process -Id $App.Process.Id -Force }
    }
}

function Invoke-PythonSql([string]$Database, [string]$Sql) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Sql))
    $code = 'import base64,sqlite3,sys; db=sqlite3.connect(sys.argv[1]); rows=db.executescript(base64.b64decode(sys.argv[2]).decode()) if False else db.execute(base64.b64decode(sys.argv[2]).decode()).fetchall(); print(rows[0][0] if rows and len(rows[0])==1 else rows); db.close()'
    $result = & python -c $code $Database $encoded
    if ($LASTEXITCODE -ne 0) { throw "SQLite query failed." }
    [string]$result
}

function Invoke-WebViewProbe([string]$Expression) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Expression))
    $result = & node $WebViewProbe $encoded
    if ($LASTEXITCODE -ne 0) { throw "WebView computed-style probe failed." }
    return $result | ConvertFrom-Json
}

function Assert-PersistedProjectIdentity([string]$Database, [string]$ExpectedRoot) {
    $escaped = [IO.Path]::GetFullPath($ExpectedRoot).Replace("'", "''")
    $projectId = Invoke-PythonSql $Database "SELECT id FROM projects WHERE root_path='$escaped';"
    Assert-True (-not [string]::IsNullOrWhiteSpace($projectId)) "Expected canonical project root is absent from persistence."
    $escapedId = $projectId.Replace("'", "''")
    Assert-True ((Invoke-PythonSql $Database "SELECT count(*) FROM reader_resume_state WHERE slot='current' AND project_id='$escapedId';") -eq '1') "Resume state is not bound to the canonical project identity."
    Assert-True ((Invoke-PythonSql $Database "SELECT count(*) FROM explanation_nodes WHERE project_id='$escapedId' AND status='valid';") -ge '1') "No valid explanation remains bound to the canonical project identity."
    return $projectId
}

function Copy-HistoricalDatabase([string]$Database, [string]$Fixture) {
    Assert-True (Test-Path -LiteralPath $Fixture) "Sanitized historical SQLite fixture is missing: $Fixture"
    New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($Database)) | Out-Null
    Copy-Item -LiteralPath $Fixture -Destination $Database -Force
}

function Test-Migration([string]$Executable, [int]$Version, [string]$Fixture) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $CurrentDataCandidates, $LegacyDataCandidates
    foreach ($legacyRoot in $LegacyDataCandidates) {
        New-Item -ItemType Directory -Force -Path $legacyRoot | Out-Null
        Copy-HistoricalDatabase (Join-Path $legacyRoot 'codereader.sqlite') $Fixture
    }
    $legacy = Join-Path $LegacyDataCandidates[0] 'codereader.sqlite'
    Assert-True ((Invoke-PythonSql $legacy 'PRAGMA user_version;') -eq [string]$Version) "Historical fixture has the wrong schema version."
    $app = Start-App $Executable
    try {
        $current = Wait-CodeReaderDatabase $CurrentDatabaseCandidates
        $script:CurrentData = [IO.Path]::GetDirectoryName($current)
        $script:LegacyData = Join-Path ([IO.Path]::GetDirectoryName($script:CurrentData)) 'com.codereader.app'
        Assert-True ((Invoke-PythonSql $current 'PRAGMA user_version;') -eq '6') "Database did not migrate to v6."
        Assert-True ((Invoke-PythonSql $current "SELECT count(*) FROM projects WHERE id='project:fixture';") -eq '1') "Fixture project was lost."
        Assert-True ((Invoke-PythonSql $current "SELECT count(*) FROM explanation_nodes WHERE id='exp:fixture';") -eq '1') "Fixture explanation was lost."
        Assert-True ((Invoke-PythonSql $current "SELECT count(*) FROM user_reading_states WHERE id='reading:fixture';") -eq '1') "Fixture reading state was lost."
        Assert-True ((Invoke-PythonSql $current "SELECT count(*) FROM model_provider_settings WHERE id='default';") -eq '1') "Fixture model settings were lost."
        if ($Version -ge 2) {
            Assert-True ((Invoke-PythonSql $current "SELECT count(*) FROM prompt_versions WHERE version='legacy-canary';") -eq '1') "Fixture prompt version was lost."
        }
        Assert-True ((Invoke-PythonSql $current 'PRAGMA integrity_check;') -eq 'ok') "Migrated database failed integrity check."
        $backup = Get-ChildItem -LiteralPath $LegacyData -Filter 'codereader.sqlite.backup-*' | Select-Object -First 1
        Assert-True ($null -ne $backup) "Migration backup is missing."
        Assert-True ((Invoke-PythonSql $backup.FullName 'PRAGMA integrity_check;') -eq 'ok') "Migration backup is not readable."
        Assert-True ((Invoke-PythonSql $backup.FullName 'PRAGMA user_version;') -eq [string]$Version) "Migration backup does not preserve the source version."
        Assert-True ((Invoke-PythonSql $backup.FullName "SELECT count(*) FROM explanation_nodes WHERE id='exp:fixture';") -eq '1') "Migration backup lost source content."
        return $true
    } finally { Stop-App $app }
}

function Test-MigrationFailureRecovery([string]$Executable, [string]$Fixture) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $CurrentDataCandidates, $LegacyDataCandidates
    New-Item -ItemType Directory -Force -Path $CurrentData | Out-Null
    $database = Join-Path $CurrentData 'codereader.sqlite'
    Copy-HistoricalDatabase $database $Fixture
    $code = 'import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); d.execute("CREATE TABLE user_annotations(id TEXT PRIMARY KEY)"); d.commit(); d.close()'
    & python -c $code $database
    if ($LASTEXITCODE -ne 0) { throw "Could not prepare the migration failure fixture." }
    $app = Start-App $Executable
    try { Start-Sleep -Seconds 3 } finally { Stop-App $app }
    Assert-True ((Invoke-PythonSql $database 'PRAGMA user_version;') -eq '3') "Failed migration did not restore the original v3 database."
    Assert-True ((Invoke-PythonSql $database "SELECT count(*) FROM projects WHERE id='project:fixture';") -eq '1') "Failed migration lost original data."
    $backup = Get-ChildItem -LiteralPath $CurrentData -Filter 'codereader.sqlite.backup-*' | Select-Object -First 1
    Assert-True ($null -ne $backup) "Failed migration backup is missing."
    Assert-True ((Invoke-PythonSql $backup.FullName 'PRAGMA integrity_check;') -eq 'ok') "Failed migration backup is corrupt."
    $recovery = Join-Path $CurrentData 'recovered-from-backup.sqlite'
    Copy-Item -LiteralPath $backup.FullName -Destination $recovery -Force
    $code = 'import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); d.execute("DROP TABLE user_annotations"); d.commit(); d.close()'
    & python -c $code $recovery
    if ($LASTEXITCODE -ne 0) { throw "Could not apply the documented recovery correction to the backup copy." }
    Copy-Item -LiteralPath $recovery -Destination $database -Force
    $app = Start-App $Executable
    try {
        $deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
        do {
            Start-Sleep -Milliseconds 250
            $version = Invoke-PythonSql $database 'PRAGMA user_version;'
        } while ($version -ne '6' -and [DateTimeOffset]::UtcNow -lt $deadline)
        Assert-True ($version -eq '6') "Recovered backup did not migrate after restart."
        Assert-True ((Invoke-PythonSql $database "SELECT count(*) FROM projects WHERE id='project:fixture';") -eq '1') "Recovered backup lost fixture data after restart."
        Assert-True ((Invoke-PythonSql $database "SELECT count(*) FROM explanation_nodes WHERE id='exp:fixture';") -eq '1') "Recovered backup lost its explanation after restart."
        Assert-True ((Invoke-PythonSql $database "SELECT count(*) FROM user_reading_states WHERE id='reading:fixture';") -eq '1') "Recovered backup lost its reading state after restart."
        Assert-True ((Invoke-PythonSql $database "SELECT count(*) FROM model_provider_settings WHERE id='default';") -eq '1') "Recovered backup lost its model settings after restart."
        Assert-True ((Invoke-PythonSql $database "SELECT count(*) FROM prompt_versions WHERE version='current-canary';") -eq '1') "Recovered backup lost its prompt version after restart."
        Assert-True ((Invoke-PythonSql $database 'PRAGMA integrity_check;') -eq 'ok') "Recovered database failed integrity check after restart."
        Assert-True ((Invoke-PythonSql $backup.FullName 'PRAGMA user_version;') -eq '3') "Recovery backup no longer preserves its original schema version."
        Assert-True ((Invoke-PythonSql $backup.FullName 'PRAGMA integrity_check;') -eq 'ok') "Recovery backup is unreadable after recovery restart."
    } finally { Stop-App $app }
    return $true
}

function Set-ReducedMotion {
    if (-not ('NativeJourneySystemParameters' -as [type])) {
        Add-Type @'
using System.Runtime.InteropServices;
public static class NativeJourneySystemParameters {
 [DllImport("user32.dll", SetLastError=true)] public static extern bool SystemParametersInfo(uint action,uint param,ref bool value,uint flags);
}
'@
    }
    $disabled = $false
    Assert-True ([NativeJourneySystemParameters]::SystemParametersInfo(0x1043, 0, [ref]$disabled, 0x03)) "Could not disable client animations."
    $enabled = $true
    Assert-True ([NativeJourneySystemParameters]::SystemParametersInfo(0x1042, 0, [ref]$enabled, 0)) "Could not query client animations."
    Assert-True (-not $enabled) "Reduced-motion setting was not applied."
    return $true
}

function Configure-LocalModel($Root, [int]$Port) {
    Invoke-Element (Find-Element $Root '更多' ([System.Windows.Automation.ControlType]::Button))
    Invoke-Element (Find-Element $Root '模型设置' ([System.Windows.Automation.ControlType]::MenuItem))
    $dialog = Find-Element $Root '模型设置' ([System.Windows.Automation.ControlType]::Window)
    $edits = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
    Assert-True ($edits.Count -ge 3) "Model settings fields unavailable to UIAutomation."
    Set-ElementValue $edits[0] "http://127.0.0.1:$Port/v1/chat/completions"
    Set-ElementValue $edits[1] 'journey-stub'
    Set-ElementValue $edits[2] 'journey-local-key'
    Invoke-Element (Find-Element $dialog '测试连接' ([System.Windows.Automation.ControlType]::Button))
    Find-Element $dialog '连接成功：journey-stub' $null 20 | Out-Null
    Invoke-Element (Find-Element $dialog '保存配置' ([System.Windows.Automation.ControlType]::Button))
}

function Authorize-NativePicker([string]$Path) {
    Start-Sleep -Seconds 1
    [System.Windows.Forms.SendKeys]::SendWait('%d')
    [System.Windows.Forms.SendKeys]::SendWait($Path)
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds 750
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
}

function Open-ProjectWithNativePicker($Root, [string]$Path) {
    Invoke-Element (Find-Element $Root '打开项目' ([System.Windows.Automation.ControlType]::Button))
    Authorize-NativePicker $Path
    Find-Element $Root 'README.md' $null 30 | Out-Null
    return $true
}

function Resume-WithNativePicker($Root, [string]$Path) {
    $continue = Find-ElementByPrefix $Root '继续' ([System.Windows.Automation.ControlType]::Button)
    Invoke-Element $continue
    Authorize-NativePicker $Path
    Find-Element $Root 'README.md' $null 30 | Out-Null
    return $true
}

function Reject-WrongResumeAuthorization($Root, [string]$WrongPath) {
    $continue = Find-ElementByPrefix $Root '继续' ([System.Windows.Automation.ControlType]::Button)
    Invoke-Element $continue
    Authorize-NativePicker $WrongPath
    Find-Element $Root '所选项目与最近记录不匹配' $null 30 | Out-Null
    $savedExplanation = $Root.FindFirst(
        [System.Windows.Automation.TreeScope]::Descendants,
        (New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty,
            'The selected function validates input and returns a stable result.')))
    Assert-True ($null -eq $savedExplanation) "Mismatched project authorization restored an explanation from the saved project."
    return $true
}

function Test-LongContent($Root) {
    Select-Element (Find-Element $Root 'README.md')
    Find-Element $Root 'NATIVE_JOURNEY_LONG_CONTENT_START' $null 20 | Out-Null
    [System.Windows.Forms.SendKeys]::SendWait('^{END}')
    $end = Find-Element $Root 'NATIVE_JOURNEY_LONG_CONTENT_END' $null 20
    Assert-True (-not $end.Current.IsOffscreen) "Long-content endpoint exists but is not visibly on screen."
    $endRect = $end.Current.BoundingRectangle
    $rootRect = $Root.Current.BoundingRectangle
    Assert-True ($endRect.Top -ge $rootRect.Top -and $endRect.Bottom -le $rootRect.Bottom) "Long-content endpoint is outside the native window."
    return $true
}

function Measure-ComputedContrast {
    return Invoke-WebViewProbe @'
(() => {
  const tab = [...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent.trim() === '真实代码');
  if (!tab) throw new Error('target tab missing');
  const parse = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
  const luminance = (value) => parse(value).map((part) => { const channel = part / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  let owner = tab;
  let background = getComputedStyle(owner).backgroundColor;
  while (owner.parentElement && /rgba?\([^)]*,\s*0(?:\.0+)?\)$/.test(background)) { owner = owner.parentElement; background = getComputedStyle(owner).backgroundColor; }
  const foreground = getComputedStyle(tab).color;
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return { foreground, background, ratio: (values[1] + .05) / (values[0] + .05) };
})()
'@
}

function Test-ReducedMotionApplication($Root) {
    $codeTab = Find-Element $Root '真实代码' ([System.Windows.Automation.ControlType]::TabItem)
    $whyTab = Find-Element $Root '为什么重要' ([System.Windows.Automation.ControlType]::TabItem)
    Select-Element $whyTab
    $motion = Invoke-WebViewProbe @'
(() => {
  const target = [...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent.trim() === '为什么重要');
  if (!target) throw new Error('target tab missing');
  const milliseconds = (value) => Math.max(...value.split(',').map((item) => item.trim().endsWith('ms') ? parseFloat(item) : parseFloat(item) * 1000));
  const style = getComputedStyle(target);
  return { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, transitionMs: milliseconds(style.transitionDuration), animationMs: milliseconds(style.animationDuration) };
})()
'@
    Assert-True ($motion.reduced -and $motion.transitionMs -le 0.01 -and $motion.animationMs -le 0.01) "Application computed styles did not honor reduced motion."
    Assert-FocusedAndSelected $whyTab 'Reduced-motion target' | Out-Null
    Select-Element $codeTab
    return $true
}

function Test-KeyboardAndZoom($App) {
    $codeTab = Find-Element $App.Root '真实代码' ([System.Windows.Automation.ControlType]::TabItem)
    $codeTab.SetFocus()
    Assert-FocusedAndSelected $codeTab 'Keyboard roundtrip origin' | Out-Null
    [System.Windows.Forms.SendKeys]::SendWait('{RIGHT}')
    Start-Sleep -Milliseconds 250
    $whyTab = Find-Element $App.Root '为什么重要' ([System.Windows.Automation.ControlType]::TabItem)
    Assert-FocusedAndSelected $whyTab 'Keyboard roundtrip right target' | Out-Null
    [System.Windows.Forms.SendKeys]::SendWait('{LEFT}')
    Start-Sleep -Milliseconds 250
    Assert-FocusedAndSelected $codeTab 'Keyboard roundtrip restored origin' | Out-Null
    Complete-Check 'keyboard-focus-roundtrip' $true
    [System.Windows.Forms.SendKeys]::SendWait('^0')
    Start-Sleep -Milliseconds 500
    $baselineZoom = [double](Invoke-WebViewProbe 'window.devicePixelRatio')
    for ($i = 0; $i -lt 5; $i++) { [System.Windows.Forms.SendKeys]::SendWait('^{ADD}') }
    Start-Sleep -Seconds 1
    $zoomedCodeTab = Find-Element $App.Root '真实代码' ([System.Windows.Automation.ControlType]::TabItem)
    $zoomedRatio = [double](Invoke-WebViewProbe 'window.devicePixelRatio') / $baselineZoom
    Assert-True ($zoomedRatio -ge 1.95 -and $zoomedRatio -le 2.05) "WebView did not report 200% zoom (ratio $zoomedRatio)."
    foreach ($name in @('下一步', '真实代码', '为什么重要')) {
        $tab = Find-Element $App.Root $name ([System.Windows.Automation.ControlType]::TabItem)
        $rect = $tab.Current.BoundingRectangle
        Assert-True (-not $rect.IsEmpty -and $rect.Right -le $App.Root.Current.BoundingRectangle.Right) "Zoom hid $name outside the window."
    }
    $contrast = Measure-ComputedContrast
    Assert-True ($contrast.ratio -ge 4.5) "Computed target-tab contrast is below 4.5:1 ($($contrast.ratio))."
    return $true
}

function Generate-Explanation($Root) {
    Select-Element (Find-Element $Root 'entry.ts')
    Invoke-Element (Find-Element $Root '生成解释' ([System.Windows.Automation.ControlType]::Button))
    $dialog = Find-Element $Root '生成确认'
    Invoke-Element (Find-Element $dialog '确认发送' ([System.Windows.Automation.ControlType]::Button))
    Find-Element $Root 'The selected function validates input and returns a stable result.' $null 30 | Out-Null
    return $true
}

if ($CommitSha -notmatch '^[0-9a-fA-F]{40}$') { throw "Invalid commit SHA." }
if ($HarnessCommitSha -notmatch '^[0-9a-fA-F]{40}$') { throw "Invalid harness commit SHA." }
if ($ReleaseTag -notmatch '^v1\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?$') { throw "Invalid release tag." }
$requiredPaths = @($Package, $Fixture010, $Fixture011, $Fixture011Current)
$missingRequiredPaths = @($requiredPaths | Where-Object { -not (Test-Path -LiteralPath $_) })
Assert-True ($missingRequiredPaths.Count -eq 0) "Package and all three sanitized SQLite fixtures are required."
$expected = if ($Architecture -eq "arm64") { "ARM64" } else { "AMD64" }
Assert-True ($env:PROCESSOR_ARCHITECTURE -eq $expected) "Journey requires native $expected."
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms
$MsiProductCode = Get-MsiProperty $Package 'ProductCode'
$MsiProductVersion = Get-MsiProperty $Package 'ProductVersion'
Assert-MsiProductIdentity $MsiProductCode $MsiProductVersion

$KnownRoamingData = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
Assert-True ([IO.Path]::IsPathRooted($KnownRoamingData)) 'Native journey phase=migration category=data-root-unavailable exit=1.'
$profile = Join-Path $env:RUNNER_TEMP 'codereader-native-journey'
$env:APPDATA = Join-Path $profile 'Roaming'
$env:LOCALAPPDATA = Join-Path $profile 'Local'
$AllowedDataRoots = @($KnownRoamingData)
$CurrentDataCandidates = @($AllowedDataRoots | ForEach-Object { Join-Path $_ 'com.codereader.desktop' })
$LegacyDataCandidates = @($AllowedDataRoots | ForEach-Object { Join-Path $_ 'com.codereader.app' })
$CurrentDatabaseCandidates = @($CurrentDataCandidates | ForEach-Object { Join-Path $_ 'codereader.sqlite' })
$CurrentData = $CurrentDataCandidates[0]
$LegacyData = $LegacyDataCandidates[0]
New-Item -ItemType Directory -Force -Path $env:APPDATA, $env:LOCALAPPDATA | Out-Null
$WebViewProbe = Join-Path $profile 'webview-probe.mjs'
@'
const expression = Buffer.from(process.argv[2], "base64").toString("utf8");
let targets;
for (let attempt = 0; attempt < 120; attempt++) {
  try {
    targets = await fetch("http://127.0.0.1:9222/json").then((response) => response.json());
    if (targets.some((target) => target.type === "page" && target.webSocketDebuggerUrl)) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const target = targets?.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
if (!target) throw new Error("CodeReader WebView DevTools target unavailable");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const response = await new Promise((resolve, reject) => {
  socket.onmessage = (event) => { const message = JSON.parse(event.data); if (message.id === 1) resolve(message); };
  socket.onerror = reject;
  socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
});
socket.close();
if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text);
process.stdout.write(JSON.stringify(response.result.result.value));
'@ | Set-Content -LiteralPath $WebViewProbe -Encoding UTF8
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222 --remote-allow-origins=http://127.0.0.1:9222'
$ControlledProject = Join-Path $profile 'controlled-project'
$WrongProject = Join-Path $profile 'wrong-project'
New-Item -ItemType Directory -Force -Path $ControlledProject | Out-Null
New-Item -ItemType Directory -Force -Path $WrongProject | Out-Null
'# Deliberately mismatched resume project' | Set-Content -LiteralPath (Join-Path $WrongProject 'README.md') -Encoding UTF8
@'
# Controlled native journey project

This readme intentionally contains long paragraphs so the installed desktop application must keep
the project outline, document content, and explanation panel reachable at two hundred percent zoom.
The sample is generated outside the repository and never changes the maintained R4 example projects.

NATIVE_JOURNEY_LONG_CONTENT_START

The following repeated sections exercise native scrolling without placing private paths or source code
in exported evidence. They are generated inside the runner profile and removed with that profile.

## Section 1
Accessibility, recovery, compatibility, and model-offline behavior remain product requirements.

## Section 2
Accessibility, recovery, compatibility, and model-offline behavior remain product requirements.

## Section 3
Accessibility, recovery, compatibility, and model-offline behavior remain product requirements.

## Section 4
Accessibility, recovery, compatibility, and model-offline behavior remain product requirements.

## Section 5
Accessibility, recovery, compatibility, and model-offline behavior remain product requirements.

## Section 6
Accessibility, recovery, compatibility, and model-offline behavior remain product requirements.

## Section 7
Accessibility, recovery, compatibility, and model-offline behavior remain product requirements.

## Section 8
Accessibility, recovery, compatibility, and model-offline behavior remain product requirements.

NATIVE_JOURNEY_LONG_CONTENT_END

## Entry

Open `entry.ts`, select the exported function, and request the deterministic local explanation.
'@ | Set-Content -LiteralPath (Join-Path $ControlledProject 'README.md') -Encoding UTF8
@'
export function validateJourneyInput(value: string): string {
  if (!value.trim()) throw new Error("value is required");
  return value.trim();
}
'@ | Set-Content -LiteralPath (Join-Path $ControlledProject 'entry.ts') -Encoding UTF8

$primaryFailure = $null
try {
    Invoke-Process msiexec.exe @('/i', "`"$Package`"", '/qn', '/norestart') @(0, 3010)
    $executable = Resolve-Executable $MsiProductCode $MsiProductVersion
    Complete-Check 'legacy-0.10-upgrade' (Test-Migration $executable 1 $Fixture010)
    Complete-Check 'legacy-0.11-upgrade' (Test-Migration $executable 2 $Fixture011)
    Test-MigrationFailureRecovery $executable $Fixture011Current | Out-Null
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $CurrentData, $LegacyData
    Set-ReducedMotion | Out-Null
    $stub = Start-Process -FilePath node -ArgumentList @('scripts/native-journey-model-stub.mjs', '18765') -PassThru -WindowStyle Hidden
    try {
        $app = Start-App $executable
        try {
            Complete-Check 'native-picker-open-project' (Open-ProjectWithNativePicker $app.Root $ControlledProject)
            Complete-Check 'long-content' (Test-LongContent $app.Root)
            Configure-LocalModel $app.Root 18765
            Complete-Check 'zoom-200-contrast' (Test-KeyboardAndZoom $app)
            Complete-Check 'reduced-motion' (Test-ReducedMotionApplication $app.Root)
            Complete-Check 'explanation-generation' (Generate-Explanation $app.Root)
        } finally { Stop-App $app }
        $database = Join-Path $CurrentData 'codereader.sqlite'
        $canonicalProjectId = Assert-PersistedProjectIdentity $database $ControlledProject
        $app = Start-App $executable
        try {
            Reject-WrongResumeAuthorization $app.Root $WrongProject | Out-Null
            Assert-True ((Assert-PersistedProjectIdentity $database $ControlledProject) -eq $canonicalProjectId) "Wrong authorization changed the persisted project identity."
            Resume-WithNativePicker $app.Root $ControlledProject | Out-Null
            Find-Element $app.Root 'README.md' $null 30 | Out-Null
            Find-Element $app.Root 'The selected function validates input and returns a stable result.' $null 30 | Out-Null
            Assert-True ((Assert-PersistedProjectIdentity $database $ControlledProject) -eq $canonicalProjectId) "Correct reauthorization did not restore the same project identity."
            Complete-Check 'restart-reauthorize-restore' $true
        } finally { Stop-App $app }
    } finally { if (-not $stub.HasExited) { Stop-Process -Id $stub.Id -Force } }

    $database = Join-Path $CurrentData 'codereader.sqlite'
    Assert-True (Test-Path -LiteralPath $database) "Journey database missing before uninstall."
    Invoke-Process msiexec.exe @('/x', "`"$Package`"", '/qn', '/norestart') @(0, 3010)
    Assert-True (-not (Test-Path -LiteralPath $executable)) "Executable remains after uninstall."
    Assert-True (Test-Path -LiteralPath $database) "Uninstall removed user data."
    Invoke-Process msiexec.exe @('/i', "`"$Package`"", '/qn', '/norestart') @(0, 3010)
    $executable = Resolve-Executable $MsiProductCode $MsiProductVersion
    $app = Start-App $executable
    try {
        Resume-WithNativePicker $app.Root $ControlledProject | Out-Null
        Find-Element $app.Root 'README.md' $null 30 | Out-Null
        Find-Element $app.Root 'The selected function validates input and returns a stable result.' $null 30 | Out-Null
        Assert-True ((Invoke-PythonSql $database 'SELECT count(*) FROM reader_resume_state WHERE slot=''current'';') -eq '1') "Reinstall did not preserve resume state."
        Assert-True ((Invoke-PythonSql $database 'SELECT count(*) FROM explanation_nodes WHERE status=''valid'';') -ge '1') "Reinstall did not preserve generated explanations."
        Assert-True ((Assert-PersistedProjectIdentity $database $ControlledProject) -eq $canonicalProjectId) "Reinstall changed the canonical project identity or its resume/explanation bindings."
    } finally { Stop-App $app }
    Complete-Check 'uninstall-data-policy' $true

    $missing = @($RequiredChecks | Where-Object { -not $Observed[$_] })
    Assert-True ($missing.Count -eq 0) "Native journey is incomplete: $($missing -join ', ')"
    $evidence = [ordered]@{
        schemaVersion = 2; releaseTag = $ReleaseTag; commitSha = $CommitSha.ToLowerInvariant()
        harnessCommitSha = $HarnessCommitSha.ToLowerInvariant()
        platform = 'windows'; arch = $Architecture; observedAt = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
        status = 'pass'; windowsAuthenticodeSigned = $false
        checks = @($RequiredChecks | ForEach-Object { [ordered]@{ name = $_; status = 'pass' } })
    }
    $outputPath = [IO.Path]::GetFullPath($Output)
    New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
    $evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $outputPath -Encoding UTF8
} catch {
    $primaryFailure = $_
} finally {
    Invoke-InstallerCleanup $primaryFailure { Get-UninstallEntryForCleanup $MsiProductCode $MsiProductVersion } {
        try {
            Invoke-Process msiexec.exe @('/x', "`"$Package`"", '/qn', '/norestart') @(0, 3010)
        } catch {
            throw 'Native journey phase=installer-cleanup category=uninstall-error exit=1.'
        }
    }
}
