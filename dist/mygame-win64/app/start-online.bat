@echo off
setlocal

cd /d "%~dp0"

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
%ZTCLI% join %ZT_NETWORK_ID% >nul 2>nul

echo.
echo Current ZeroTier networks:
%ZTCLI% listnetworks
echo.
echo Starting app...

if "%APP_PORT%"=="" set "APP_PORT=3000"
if "%APP_HOST%"=="" set "APP_HOST=0.0.0.0"
set "PORT=%APP_PORT%"
set "HOST=%APP_HOST%"

call start.bat

endlocal
exit /b 0
