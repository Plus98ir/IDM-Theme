<#
.SYNOPSIS
    Install or uninstall the "UIUXMonster Dark" toolbar theme for Internet Download Manager.
.PARAMETER Uninstall
    Removes the UIUXMonster Dark theme files from IDM's Toolbar directory.
#>
param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ThemeDir = Join-Path $ScriptDir "UIUXMonster-Dark"

$IdmCandidates = @(
    "${env:ProgramFiles(x86)}\Internet Download Manager\Toolbar",
    "${env:ProgramFiles}\Internet Download Manager\Toolbar"
)
$TargetToolbarDir = $IdmCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $TargetToolbarDir) {
    Write-Error "Internet Download Manager Toolbar directory not found. Checked: $($IdmCandidates -join ', ')"
    exit 1
}

$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $IsAdmin) {
    Write-Host "Administrator privileges are required to write to '$TargetToolbarDir'. Requesting elevation..." -ForegroundColor Yellow
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    if ($Uninstall) { $argList += "-Uninstall" }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
    exit 0
}

$ThemeFiles = @(
    "uiuxmonster_dark.tbi",
    "uiux_large.bmp",
    "uiux_largeHot.bmp",
    "uiux_small.bmp",
    "uiux_smallHot.bmp",
    "uiux_hdpi.bmp",
    "uiux_hdpiHot.bmp"
)

if ($Uninstall) {
    foreach ($file in $ThemeFiles) {
        $dest = Join-Path $TargetToolbarDir $file
        if (Test-Path $dest) {
            Remove-Item $dest -Force
            Write-Host "Removed: $dest" -ForegroundColor Cyan
        }
    }
    Write-Host "`nUIUXMonster Dark theme uninstalled. Restart IDM (Tasks -> Exit) to reload toolbars." -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $ThemeDir)) {
    Write-Error "Theme folder not found at '$ThemeDir'. Run 'python generate_theme.py' first."
    exit 1
}

foreach ($file in $ThemeFiles) {
    $src = Join-Path $ThemeDir $file
    if (-not (Test-Path $src)) {
        Write-Error "Missing theme asset: $src"
        exit 1
    }
    Copy-Item -Path $src -Destination (Join-Path $TargetToolbarDir $file) -Force
    Write-Host "Installed: $file" -ForegroundColor Cyan
}

Write-Host "`nDone! Next steps in IDM:" -ForegroundColor Green
Write-Host "  1. Fully close IDM: Tasks -> Exit (not just the X button)."
Write-Host "  2. Reopen Internet Download Manager."
Write-Host "  3. Enable dark mode: View -> Dark Mode support (with Windows Dark app mode)."
Write-Host "  4. Select toolbar:   View -> Toolbar -> UIUXMonster Dark"
