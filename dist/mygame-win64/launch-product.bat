@echo off
setlocal EnableDelayedExpansion
set "DIST_ROOT=%~dp0"
set "APP_ROOT=%DIST_ROOT%app"
set "LOG_DIR=%DIST_ROOT%logs"
set "LOG_FILE=%LOG_DIR%\app.log"
set "SERVER_BAT=%DIST_ROOT%run-product-server.bat"
set "NODE_EXE=%DIST_ROOT%runtime\node.exe"
if not exist "%NODE_EXE%" (
  echo Node runtime not found: %NODE_EXE%
  echo Please place Windows x64 Node runtime under: runtime\
  echo Expected file: runtime\node.exe
  pause
  exit /b 1
)
if not exist "%SERVER_BAT%" (
  echo Server launcher not found: %SERVER_BAT%
  pause
  exit /b 1
)
if not exist "%APP_ROOT%\index.js" (
  echo App entry not found: %APP_ROOT%\index.js
  pause
  exit /b 1
)
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
> "%LOG_FILE%" type nul
cd /d "%APP_ROOT%"
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
set "APP_URL=http://127.0.0.1:%APP_PORT%/"
echo Launching background service...
start "myGame Server" /min "%SERVER_BAT%" %APP_PORT%
echo Waiting for service to become ready...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(70); $url='http://127.0.0.1:%APP_PORT%/api/ping'; while((Get-Date) -lt $deadline){ try { $response=Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2; if($response.StatusCode -ge 200 -and $response.StatusCode -lt 500){ exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 (
  echo.
  echo App did not become ready in time.
  echo Log file: %LOG_FILE%
  powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '%LOG_FILE%') { Get-Content '%LOG_FILE%' -Tail 30 }"
  pause
  exit /b 1
)
echo Opening browser...
start "" "%APP_URL%"
echo.
echo App is running at: %APP_URL%
echo If the browser did not open automatically, open that address manually.
echo Log file: %LOG_FILE%
echo.
pause
endlocal