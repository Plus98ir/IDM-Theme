@echo off
setlocal
set "APP_DIR=%~dp0idm-ui"
set "ELECTRON_RUN_AS_NODE="
cd /d "%APP_DIR%"
if not exist "%APP_DIR%\node_modules\electron\dist\electron.exe" (
  echo First run: installing Electron with npm...
  call npm install || (echo npm install failed. Install Node.js from https://nodejs.org and try again. & pause & exit /b 1)
)
start "" "%APP_DIR%\node_modules\electron\dist\electron.exe" "%APP_DIR%"
