$rustToolchainName = "stable-x86_64-pc-windows-gnu"
$rustTarget = "x86_64-pc-windows-gnu"
$mingw = "C:\ProgramData\mingw64\mingw64\bin"

$rustcPath = (& rustup which rustc --toolchain $rustToolchainName).Trim()
if ($LASTEXITCODE -ne 0 -or -not $rustcPath) {
    throw "Unable to resolve $rustToolchainName through rustup."
}

$rustBin = Split-Path -Parent $rustcPath
$rustToolchain = Split-Path -Parent $rustBin
$rustSelfContained = Join-Path $rustToolchain "lib\rustlib\$rustTarget\bin\self-contained"
if (-not (Test-Path -LiteralPath $rustSelfContained)) {
    throw "Rust self-contained runtime directory is missing: $rustSelfContained"
}

$env:Path = "$mingw;$rustBin;$rustSelfContained;$env:Path"
