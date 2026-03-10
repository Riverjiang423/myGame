@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Run setup.bat first.
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
  echo node_modules not found. Installing dependencies first...
  if exist package-lock.json (
    call npm.cmd ci
  ) else (
    call npm.cmd install
  )
  if errorlevel 1 (
    echo Failed to install dependencies. Run setup.bat manually.
    pause
    exit /b 1
  )
)

if "%PORT%"=="" (
  set "BASE_PORT=3000"
) else (
  set "BASE_PORT=%PORT%"
)

set "APP_PORT=%BASE_PORT%"
set "PORT_FOUND="
for /L %%i in (0,1,30) do (
  set /a TRY_PORT=BASE_PORT+%%i
  set "PORT_BUSY="
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":!TRY_PORT! .*LISTENING"') do (
    set "PORT_BUSY=1"
  )
  if not defined PORT_BUSY (
    set "APP_PORT=!TRY_PORT!"
    set "PORT_FOUND=1"
    goto :port_checked
  )
)

:port_checked
if not defined PORT_FOUND (
  echo No available port found in range %BASE_PORT%-!TRY_PORT!.
  pause
  exit /b 1
)

if not "%APP_PORT%"=="%BASE_PORT%" (
  echo Port %BASE_PORT% is in use. Starting app on port %APP_PORT%...
) else (
  echo Starting app on port %APP_PORT%...
)
set "PORT=%APP_PORT%"

call npm.cmd run dev
set "APP_EXIT_CODE=%ERRORLEVEL%"

echo.
echo App process exited.
if not "%APP_EXIT_CODE%"=="0" if "%START_BAT_SKIP_PAUSE_ON_ERROR%"=="1" goto :exit_now
pause
:exit_now
exit /b %APP_EXIT_CODE%
