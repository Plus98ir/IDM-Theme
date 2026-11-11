<#
.SYNOPSIS
    Makes IDM Modern open whenever you open Internet Download Manager from its shortcuts.
.DESCRIPTION
    - Copies IDM Modern to %LOCALAPPDATA%\Programs\IDM Modern (when run from somewhere else).
    - Points IDM's Desktop / Start Menu / taskbar shortcuts to IDM Modern (IDM icon kept).
    - Adds an "IDM Classic" Start Menu shortcut for the original window.
    IDM itself is not changed; IDM Modern starts IDM in the tray in the background.
.PARAMETER Undo
    Points the shortcuts back to IDMan.exe and removes "IDM Classic".
#>
param([switch]$Undo)

$ErrorActionPreference = "Stop"

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Host "Administrator rights are needed for the all-users Start Menu shortcut. Requesting elevation..." -ForegroundColor Yellow
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    if ($Undo) { $argList += "-Undo" }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
    exit 0
}

$IdmExe = @("${env:ProgramFiles(x86)}\Internet Download Manager\IDMan.exe",
            "${env:ProgramFiles}\Internet Download Manager\IDMan.exe") |
          Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $IdmExe) { Write-Error "Internet Download Manager (IDMan.exe) is not installed."; exit 1 }

$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\IDM Modern"
$AppExe = Join-Path $InstallDir "IDM Modern.exe"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

$Ws = New-Object -ComObject WScript.Shell
$Folders = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('CommonDesktopDirectory'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('CommonPrograms'),
    "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
) | Where-Object { $_ -and (Test-Path $_) }

$ClassicLnk = Join-Path ([Environment]::GetFolderPath('Programs')) "IDM Classic.lnk"
$ModernLnks = @((Join-Path ([Environment]::GetFolderPath('Desktop')) "IDM Modern.lnk"),
                (Join-Path ([Environment]::GetFolderPath('Programs')) "IDM Modern.lnk"))

function Get-IdmShortcuts([string]$targetPattern) {
    foreach ($d in $Folders) {
        Get-ChildItem $d -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
            $s = $Ws.CreateShortcut($_.FullName)
            if ($_.BaseName -like "Internet Download Manager*" -and $s.TargetPath -match $targetPattern) { $s }
        }
    }
}

if ($Undo) {
    foreach ($s in Get-IdmShortcuts 'IDM Modern\.exe$') {
        $s.TargetPath = $IdmExe
        $s.Arguments = ""
        $s.WorkingDirectory = Split-Path $IdmExe
        $s.IconLocation = "$IdmExe,0"
        $s.Description = "Internet Download Manager"
        $s.Save()
        Write-Host "Restored: $($s.FullName)" -ForegroundColor Cyan
    }
    Remove-Item $ClassicLnk -ErrorAction SilentlyContinue
    Write-Host "`nDone. IDM shortcuts open the classic IDM window again." -ForegroundColor Green
    exit 0
}

# Install / update the app files
if ((Test-Path (Join-Path $ScriptDir "IDM Modern.exe")) -and ($ScriptDir.TrimEnd('\') -ne $InstallDir.TrimEnd('\'))) {
    Get-Process -Name "IDM Modern" -ErrorAction SilentlyContinue | Stop-Process -Force
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
    New-Item -ItemType Directory -Force (Split-Path $InstallDir) | Out-Null
    Copy-Item $ScriptDir $InstallDir -Recurse
    Write-Host "Installed to: $InstallDir" -ForegroundColor Cyan
}
if (-not (Test-Path $AppExe)) { Write-Error "IDM Modern.exe not found in '$InstallDir'. Run this script from the unzipped IDM-Modern folder."; exit 1 }

$changed = 0
foreach ($s in Get-IdmShortcuts 'IDMan\.exe$') {
    if ($s.Arguments) { continue }
    $s.TargetPath = $AppExe
    $s.WorkingDirectory = $InstallDir
    $s.IconLocation = "$IdmExe,0"
    $s.Description = "IDM Modern - dark UI for Internet Download Manager"
    $s.Save()
    $changed++
    Write-Host "Now opens IDM Modern: $($s.FullName)" -ForegroundColor Cyan
}

# Extra "IDM Modern" shortcuts are not needed any more
foreach ($l in $ModernLnks) { Remove-Item $l -ErrorAction SilentlyContinue }

$c = $Ws.CreateShortcut($ClassicLnk)
$c.TargetPath = $IdmExe
$c.WorkingDirectory = Split-Path $IdmExe
$c.IconLocation = "$IdmExe,0"
$c.Description = "Classic Internet Download Manager window"
$c.Save()

if ($changed -eq 0) {
    $l = $Ws.CreateShortcut($ModernLnks[1])
    $l.TargetPath = $AppExe; $l.WorkingDirectory = $InstallDir; $l.IconLocation = "$IdmExe,0"; $l.Save()
    Write-Host "No IDM shortcuts found; added 'IDM Modern' to the Start Menu instead." -ForegroundColor Yellow
}

Write-Host "`nDone. Opening IDM from its shortcuts now opens IDM Modern." -ForegroundColor Green
Write-Host "Classic window: Start Menu -> IDM Classic (or Tasks -> Open Classic IDM inside the app)."
Write-Host "Undo: .\set-default.ps1 -Undo"
