<#
.SYNOPSIS
    Builds the release zips into .\release:
      IDM-Modern-win-x64.zip      portable app (no install, no Node.js needed)
      UIUXMonster-Dark-Toolbar.zip toolbar theme + installer
#>
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Ui = Join-Path $Root "idm-ui"
$Dist = Join-Path $Ui "node_modules\electron\dist"
$Out = Join-Path $Root "release"

if (-not (Test-Path (Join-Path $Dist "electron.exe"))) {
    Push-Location $Ui; npm install; Pop-Location
}

if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
$App = Join-Path $Out "IDM-Modern"
New-Item -ItemType Directory -Force $App | Out-Null

Copy-Item "$Dist\*" $App -Recurse
Rename-Item (Join-Path $App "electron.exe") "IDM Modern.exe"
Remove-Item (Join-Path $App "resources\default_app.asar") -ErrorAction SilentlyContinue

$AppSrc = Join-Path $App "resources\app"
New-Item -ItemType Directory -Force $AppSrc | Out-Null
foreach ($f in "main.js", "preload.js", "renderer.js", "index.html", "styles.css", "package.json") {
    Copy-Item (Join-Path $Ui $f) $AppSrc
}
Copy-Item (Join-Path $Root "LICENSE") $App

Compress-Archive -Path $App -DestinationPath (Join-Path $Out "IDM-Modern-win-x64.zip") -CompressionLevel Optimal

$Tb = Join-Path $Out "UIUXMonster-Dark-Toolbar"
New-Item -ItemType Directory -Force $Tb | Out-Null
Copy-Item (Join-Path $Root "UIUXMonster-Dark") $Tb -Recurse
Copy-Item (Join-Path $Root "install.ps1"), (Join-Path $Root "LICENSE") $Tb
Compress-Archive -Path $Tb -DestinationPath (Join-Path $Out "UIUXMonster-Dark-Toolbar.zip") -CompressionLevel Optimal

Get-ChildItem $Out -Filter *.zip | ForEach-Object { "{0}  {1:N1} MB" -f $_.Name, ($_.Length / 1MB) }
