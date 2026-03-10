@echo off
setlocal

cd /d "%~dp0"

set "ELEVATED_FLAG=--_zt_elevated"
if /I "%~1"=="%ELEVATED_FLAG%" goto :elevated_ok

net session >nul 2>nul
if errorlevel 1 (
  echo Requesting Administrator permission for ZeroTier join...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%ELEVATED_FLAG%' -Verb RunAs"
  if errorlevel 1 (
    echo Failed to request Administrator permission.
    echo Please right-click start-online.bat and choose "Run as administrator".
    pause
    exit /b 1
  )
  exit /b 0
)

:elevated_ok

if not exist online.config.bat (
  echo online.config.bat not found.
  echo Please create it and set ZT_NETWORK_ID first.
  pause
  exit /b 1
)

call online.config.bat

if "%ZT_NETWORK_ID%"=="" (
  echo ZT_NETWORK_ID is empty in online.config.bat
  echo Please set your ZeroTier network id first.
  pause
  exit /b 1
)

where zerotier-cli.bat >nul 2>nul
if errorlevel 1 (
  where zerotier-cli >nul 2>nul
  if errorlevel 1 (
    echo zerotier-cli was not found.
    echo Install ZeroTier One first: https://www.zerotier.com/download/
    pause
    exit /b 1
  ) else (
    set "ZTCLI=zerotier-cli"
  )
) else (
  set "ZTCLI=zerotier-cli.bat"
)

echo Ensuring ZeroTier network membership: %ZT_NETWORK_ID%
set "ZT_JOIN_LOG=%TEMP%\zt_join_%RANDOM%_%RANDOM%.log"
call %ZTCLI% join %ZT_NETWORK_ID% > "%ZT_JOIN_LOG%" 2>&1
type "%ZT_JOIN_LOG%"
if errorlevel 1 (
  echo.
  echo Failed to join ZeroTier network: %ZT_NETWORK_ID%
  findstr /I /C:"authtoken.secret not found or readable" "%ZT_JOIN_LOG%" >nul 2>nul
  if not errorlevel 1 (
    echo Reason: zerotier-cli needs Administrator permission.
    echo Action: right-click start-online.bat and run as Administrator.
  )
  echo Please check:
  echo   - ZeroTier service is running
  echo   - Network ID is correct
  echo   - Current network allows ZeroTier traffic
  if exist "%ZT_JOIN_LOG%" del /q "%ZT_JOIN_LOG%" >nul 2>nul
  pause
  exit /b 1
)
if exist "%ZT_JOIN_LOG%" del /q "%ZT_JOIN_LOG%" >nul 2>nul

echo.
echo Current ZeroTier networks:
set "ZT_LIST_LOG=%TEMP%\zt_list_%RANDOM%_%RANDOM%.log"
call %ZTCLI% listnetworks > "%ZT_LIST_LOG%" 2>&1
type "%ZT_LIST_LOG%"
if errorlevel 1 (
  echo.
  echo Failed to query ZeroTier networks.
  echo This usually means the current shell has insufficient permission.
  echo Please run this script as Administrator.
  if exist "%ZT_LIST_LOG%" del /q "%ZT_LIST_LOG%" >nul 2>nul
  pause
  exit /b 1
)
if exist "%ZT_LIST_LOG%" del /q "%ZT_LIST_LOG%" >nul 2>nul
echo.
echo Starting app...

if "%APP_PORT%"=="" set "APP_PORT=3000"
if "%APP_HOST%"=="" set "APP_HOST=0.0.0.0"
set "PORT=%APP_PORT%"
set "HOST=%APP_HOST%"
set "APP_START_MODE=local"
set "LIBZT_ENABLE=0"

call start.bat
set "APP_EXIT_CODE=%ERRORLEVEL%"
if not "%APP_EXIT_CODE%"=="0" (
  echo.
  echo App exited with error code %APP_EXIT_CODE%.
  pause
)

endlocal
exit /b %APP_EXIT_CODE%
