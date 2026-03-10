@echo off
setlocal
set "DIST_ROOT=%~dp0"
set "APP_ROOT=%DIST_ROOT%app"
set "LOG_DIR=%DIST_ROOT%logs"
set "LOG_FILE=%LOG_DIR%\app.log"
set "NODE_EXE=%DIST_ROOT%runtime\node.exe"
if "%~1"=="" (
  set "APP_PORT=3000"
) else (
  set "APP_PORT=%~1"
)
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
cd /d "%APP_ROOT%"
set "PORT=%APP_PORT%"
set "APP_DISTRIBUTION_MODE=1"
set "APP_START_MODE=online-preferred"
set "AUTO_OPEN_BROWSER=0"
"%NODE_EXE%" index.js >> "%LOG_FILE%" 2>&1
endlocal