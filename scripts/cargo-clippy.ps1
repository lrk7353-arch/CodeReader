$ErrorActionPreference = "Stop"

$mingw = "C:\ProgramData\mingw64\mingw64\bin"
$rustToolchain = Join-Path $env:USERPROFILE ".rustup\toolchains\stable-x86_64-pc-windows-gnu"
$rustBin = Join-Path $rustToolchain "bin"
$rustSelfContained = Join-Path $rustToolchain "lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained"
$cargoTarget = if ($env:CODEREADER_CARGO_TARGET_DIR) {
    $env:CODEREADER_CARGO_TARGET_DIR
} elseif (Test-Path -LiteralPath "D:\CodeReaderCache") {
    "D:\CodeReaderCache\cargo-target"
} else {
    Join-Path $env:SystemDrive "cr-target"
}

New-Item -ItemType Directory -Force -Path $cargoTarget | Out-Null

$env:Path = "$mingw;$rustBin;$rustSelfContained;$env:Path"
$env:CARGO_TARGET_DIR = $cargoTarget

cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
