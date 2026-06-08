$ErrorActionPreference = "Stop"

$mingw = "C:\ProgramData\mingw64\mingw64\bin"
$rustSelfContained = "C:\ProgramData\chocolatey\lib\rust\tools\lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained"
$cargoTarget = Join-Path $env:USERPROFILE ".cache\codereader\cargo-target"

New-Item -ItemType Directory -Force -Path $cargoTarget | Out-Null

$env:Path = "$mingw;$rustSelfContained;$env:Path"
$env:CARGO_TARGET_DIR = $cargoTarget

cargo check --manifest-path src-tauri/Cargo.toml
