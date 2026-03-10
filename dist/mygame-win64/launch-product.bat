@echo off
setlocal EnableDelayedExpansion
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
set APP_DISTRIBUTION_MODE=1
set APP_START_MODE=online-preferred
set AUTO_OPEN_BROWSER=1
"%NODE_EXE%" index.js
if errorlevel 1 (
  echo.
  echo App exited with error.
  pause
)
endlocal