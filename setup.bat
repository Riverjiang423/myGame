@echo off
setlocal

cd /d "%~dp0"

echo [1/3] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 18+ first:
  echo https://nodejs.org/
  pause
  exit /b 1
)

echo [2/3] Checking npm...
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please reinstall Node.js.
  pause
  exit /b 1
)

echo [3/3] Installing dependencies...
if exist package-lock.json (
  call npm.cmd ci
) else (
  call npm.cmd install
)
if errorlevel 1 (
  echo Dependency installation failed. Check network and try again.
  pause
  exit /b 1
)

echo.
echo Setup complete.
echo Run start.bat to launch the app.
echo.
pause
exit /b 0
