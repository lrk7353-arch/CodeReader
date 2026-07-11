$architecture = if ($env:CODEREADER_WINDOWS_ARCH) {
    $env:CODEREADER_WINDOWS_ARCH.ToLowerInvariant()
} else {
    "x64"
}

switch ($architecture) {
    "x64" {
        # Preserve the verified local GNU build path while CI uses the native
        # MSVC target. Both produce x64 NSIS/MSI packages.
        $rustToolchainName = "stable-x86_64-pc-windows-gnu"
        $rustTarget = "x86_64-pc-windows-gnu"
        $mingw = "C:\ProgramData\mingw64\mingw64\bin"
    }
    "arm64" {
        $rustToolchainName = "stable-aarch64-pc-windows-msvc"
        $rustTarget = "aarch64-pc-windows-msvc"
        $mingw = $null
    }
    default {
        throw "Unsupported Windows release architecture: $architecture"
    }
}

$rustcPath = (& rustup which rustc --toolchain $rustToolchainName).Trim()
if ($LASTEXITCODE -ne 0 -or -not $rustcPath) {
    throw "Unable to resolve $rustToolchainName through rustup. Install it before building $architecture packages."
}

$rustBin = Split-Path -Parent $rustcPath
$toolPaths = @($rustBin)
if ($mingw) {
    $rustToolchain = Split-Path -Parent $rustBin
    $rustSelfContained = Join-Path $rustToolchain "lib\rustlib\$rustTarget\bin\self-contained"
    if (-not (Test-Path -LiteralPath $rustSelfContained)) {
        throw "Rust self-contained runtime directory is missing: $rustSelfContained"
    }
    $toolPaths = @($mingw, $rustBin, $rustSelfContained)
}

$env:Path = "$($toolPaths -join ';');$env:Path"
