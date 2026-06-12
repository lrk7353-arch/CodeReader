$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "configure-windows-rust.ps1")
$cargoTarget = if ($env:CODEREADER_CARGO_TARGET_DIR) {
    $env:CODEREADER_CARGO_TARGET_DIR
} elseif (Test-Path -LiteralPath "D:\CodeReaderCache") {
    "D:\CodeReaderCache\cargo-target"
} else {
    Join-Path $env:SystemDrive "cr-target"
}

New-Item -ItemType Directory -Force -Path $cargoTarget | Out-Null

$env:CARGO_TARGET_DIR = $cargoTarget

cargo test --manifest-path src-tauri/Cargo.toml --lib
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
