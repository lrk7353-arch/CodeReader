$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$iconDirectory = Join-Path $repoRoot "src-tauri\icons"
$sourceIcon = Join-Path $iconDirectory "app-icon-source.png"

New-Item -ItemType Directory -Force -Path $iconDirectory | Out-Null

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $diameter = $Radius * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc(
        $X + $Width - $diameter,
        $Y + $Height - $diameter,
        $diameter,
        $diameter,
        0,
        90
    )
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

$bitmap = [System.Drawing.Bitmap]::new(1024, 1024)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$backgroundPath = New-RoundedRectanglePath -X 52 -Y 52 -Width 920 -Height 920 -Radius 190
$backgroundBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.Color]::FromArgb(255, 31, 42, 46)
)
$graphics.FillPath($backgroundBrush, $backgroundPath)

$accentPath = New-RoundedRectanglePath -X 112 -Y 112 -Width 92 -Height 800 -Radius 46
$accentBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.Color]::FromArgb(255, 63, 157, 126)
)
$graphics.FillPath($accentBrush, $accentPath)

$codePen = [System.Drawing.Pen]::new(
    [System.Drawing.Color]::FromArgb(255, 244, 246, 242),
    72
)
$codePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$codePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$codePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$graphics.DrawLines(
    $codePen,
    [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(438, 330),
        [System.Drawing.PointF]::new(310, 512),
        [System.Drawing.PointF]::new(438, 694)
    )
)
$graphics.DrawLines(
    $codePen,
    [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(650, 330),
        [System.Drawing.PointF]::new(778, 512),
        [System.Drawing.PointF]::new(650, 694)
    )
)

$cursorPen = [System.Drawing.Pen]::new(
    [System.Drawing.Color]::FromArgb(255, 63, 157, 126),
    66
)
$cursorPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$cursorPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($cursorPen, 532, 700, 606, 324)

$bitmap.Save($sourceIcon, [System.Drawing.Imaging.ImageFormat]::Png)

$cursorPen.Dispose()
$codePen.Dispose()
$accentBrush.Dispose()
$accentPath.Dispose()
$backgroundBrush.Dispose()
$backgroundPath.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Push-Location $repoRoot
try {
    & node scripts/tauri.mjs icon $sourceIcon --output $iconDirectory
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

$generatedDirectoriesToRemove = @(
    (Join-Path $iconDirectory "android"),
    (Join-Path $iconDirectory "ios")
)
$generatedFilesToRemove = @(
    (Join-Path $iconDirectory "icon.icns"),
    (Join-Path $iconDirectory "StoreLogo.png"),
    (Join-Path $iconDirectory "Square30x30Logo.png"),
    (Join-Path $iconDirectory "Square44x44Logo.png"),
    (Join-Path $iconDirectory "Square71x71Logo.png"),
    (Join-Path $iconDirectory "Square89x89Logo.png"),
    (Join-Path $iconDirectory "Square107x107Logo.png"),
    (Join-Path $iconDirectory "Square142x142Logo.png"),
    (Join-Path $iconDirectory "Square150x150Logo.png"),
    (Join-Path $iconDirectory "Square284x284Logo.png"),
    (Join-Path $iconDirectory "Square310x310Logo.png")
)
foreach ($directory in $generatedDirectoriesToRemove) {
    if (Test-Path -LiteralPath $directory) {
        Remove-Item -LiteralPath $directory -Recurse -Force
    }
}
foreach ($file in $generatedFilesToRemove) {
    if (Test-Path -LiteralPath $file) {
        Remove-Item -LiteralPath $file -Force
    }
}

Write-Host "Generated CodeReader icon set in $iconDirectory"
