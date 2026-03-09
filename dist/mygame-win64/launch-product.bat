@echo off
setlocal
set "DIST_ROOT=%~dp0"
set "NODE_EXE=%DIST_ROOT%runtime\node.exe"
if not exist "%NODE_EXE%" (
  echo Node runtime not found: %NODE_EXE%
  echo Please place Windows x64 Node runtime under: runtime\
  echo Expected file: runtime\node.exe
  pause
  exit /b 1
)
cd /d "%DIST_ROOT%app"
set APP_DISTRIBUTION_MODE=1
set APP_START_MODE=online-preferred
set AUTO_OPEN_BROWSER=1
"%NODE_EXE%" index.js
endlocal