@echo off
setlocal

cd /d "%~dp0"

echo [1/4] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Run setup.bat first.
  pause
  exit /b 1
)

echo [2/4] Checking npm...
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Run setup.bat first.
  pause
  exit /b 1
)

echo [3/4] Checking dependencies...
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

echo [4/4] Preparing distribution...
call npm.cmd run dist:prepare
if errorlevel 1 (
  echo Distribution build failed.
  pause
  exit /b 1
)

echo.
echo Distribution is ready:
echo %~dp0dist\mygame-win64
echo Send the whole "mygame-win64" folder to end users.
echo.
pause
exit /b 0
