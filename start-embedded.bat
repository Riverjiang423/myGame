@echo off
setlocal

cd /d "%~dp0"

if not exist libzt.config.bat (
  echo libzt.config.bat not found.
  pause
  exit /b 1
)

call libzt.config.bat

if "%LIBZT_NETWORK_ID%"=="" (
  echo LIBZT_NETWORK_ID is empty in libzt.config.bat
  pause
  exit /b 1
)

if not exist "%LIBZT_DLL_PATH%" (
  echo libzt.dll not found: %LIBZT_DLL_PATH%
  echo Put libzt.dll to third_party\\libzt\\winx64\\
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Run setup.bat first.
  pause
  exit /b 1
)

if not exist node_modules (
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Building native addon...
call npm.cmd run build:libzt
if errorlevel 1 (
  echo build:libzt failed. Ensure Visual Studio Build Tools are installed.
  pause
  exit /b 1
)

echo Starting app with embedded libzt...
if "%APP_PORT_LOCAL%"=="" set "APP_PORT_LOCAL=3000"
if "%APP_START_MODE%"=="" set "APP_START_MODE=online-preferred"
set "PORT=%APP_PORT_LOCAL%"
call start.bat

endlocal
exit /b 0
