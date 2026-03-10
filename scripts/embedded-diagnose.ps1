param()

$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath ..

$projectRoot = (Get-Location).Path
$diagDir = Join-Path $projectRoot 'diagnostics'
if (-not (Test-Path -LiteralPath $diagDir)) {
  New-Item -ItemType Directory -Path $diagDir | Out-Null
}

$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$logFile = Join-Path $diagDir "embedded-diagnose_$ts.log"
$runLog = Join-Path $diagDir "embedded-start_$ts.log"

function Write-Log([string]$line = '') {
  Write-Host $line
  Add-Content -LiteralPath $logFile -Value $line
}

function Write-Section([string]$title) {
  Write-Log ''
  Write-Log ("-------------------- {0} --------------------" -f $title)
}

function Run-Cmd([string]$cmdLine) {
  Write-Log ("[CMD] {0}" -f $cmdLine)
  $output = cmd /d /c $cmdLine 2>&1
  $exit = $LASTEXITCODE
  if ($output) {
    $output | Add-Content -LiteralPath $logFile
  }
  if ($exit -ne 0) {
    Write-Log ("[WARN] ExitCode={0}" -f $exit)
  }
}

function Check-File([string]$relativePath) {
  $fullPath = Join-Path $projectRoot $relativePath
  if (Test-Path -LiteralPath $fullPath) {
    $size = (Get-Item -LiteralPath $fullPath).Length
    Write-Log ("[OK] {0} ({1} bytes)" -f $relativePath, $size)
  } else {
    Write-Log ("[WARN] Missing: {0}" -f $relativePath)
  }
}

Write-Log '============================================================'
Write-Log ("Embedded Diagnose Started: {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Log ("Project Root: {0}" -f $projectRoot)
Write-Log ("Main Log: {0}" -f $logFile)
Write-Log ("Start Log: {0}" -f $runLog)
Write-Log '============================================================'

Write-Section '1) Permission / Runtime'
Run-Cmd 'ver'
Run-Cmd 'whoami'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($admin) {
  Write-Log '[OK] Current shell is Administrator.'
} else {
  Write-Log '[WARN] Current shell is NOT Administrator.'
}

Write-Section '2) Toolchain'
Run-Cmd 'where node'
Run-Cmd 'node -v'
Run-Cmd 'where npm.cmd'
Run-Cmd 'npm -v'
Run-Cmd 'where python'
Run-Cmd 'python --version'
Run-Cmd 'where msbuild'

Write-Section '3) Required Files'
Check-File 'third_party\libzt\winx64\libzt.dll'
Check-File 'build\Release\libztaddon.node'
Check-File 'libzt.config.bat'
Check-File 'start-embedded.bat'

Write-Section '4) Embedded Env Snapshot'
if (Test-Path -LiteralPath (Join-Path $projectRoot 'libzt.config.bat')) {
  $envDump = cmd /d /c 'call libzt.config.bat >nul 2>nul && set LIBZT_'
  if ($LASTEXITCODE -eq 0 -and $envDump) {
    foreach ($line in $envDump) { Write-Log $line }
  } else {
    Write-Log '[WARN] Failed to read LIBZT_* from libzt.config.bat'
  }
} else {
  Write-Log '[WARN] libzt.config.bat not found.'
}

Write-Section '5) Network Snapshot'
Run-Cmd 'ipconfig /all'
Run-Cmd 'route print'
Run-Cmd 'powershell -NoProfile -Command "Get-NetAdapter | Format-Table -AutoSize"'
Run-Cmd 'powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Format-Table -AutoSize"'

Write-Section '6) ZeroTier Snapshot'
$ztCli = $null
if (Get-Command 'zerotier-cli.bat' -ErrorAction SilentlyContinue) {
  $ztCli = 'zerotier-cli.bat'
} elseif (Get-Command 'zerotier-cli' -ErrorAction SilentlyContinue) {
  $ztCli = 'zerotier-cli'
}

if ($ztCli) {
  Write-Log ("[OK] ZeroTier CLI found: {0}" -f $ztCli)
  Run-Cmd "$ztCli info"
  Run-Cmd "$ztCli listnetworks"
  Run-Cmd "$ztCli listpeers"
} else {
  Write-Log '[WARN] zerotier-cli not found in PATH.'
}
Run-Cmd 'sc query ZeroTierOneService'

Write-Section '7) External Connectivity'
Run-Cmd 'ping -n 1 my.zerotier.com'
Run-Cmd 'ping -n 1 1.1.1.1'
Run-Cmd 'powershell -NoProfile -Command "Test-NetConnection my.zerotier.com -Port 443"'

Write-Section '8) Embedded Startup Log'
Write-Log 'Running: start-embedded.bat (captured to run log)'
$runOutput = cmd /d /c 'echo.| start-embedded.bat' 2>&1
$startExit = $LASTEXITCODE
if ($runOutput) {
  $runOutput | Set-Content -LiteralPath $runLog -Encoding UTF8
} else {
  '' | Set-Content -LiteralPath $runLog -Encoding UTF8
}
Write-Log ("start-embedded exit code: {0}" -f $startExit)
Write-Log '----- start-embedded output (begin) -----'
Get-Content -LiteralPath $runLog | Add-Content -LiteralPath $logFile
Write-Log '----- start-embedded output (end) -----'

Write-Section '9) Quick Summary'
if ($startExit -eq 0) {
  Write-Log '[OK] Embedded startup exited with code 0.'
} else {
  Write-Log '[WARN] Embedded startup failed. Check run log details.'
}

$runText = Get-Content -LiteralPath $runLog -Raw
$mainText = Get-Content -LiteralPath $logFile -Raw
if ($runText -match 'zts_net_join failed') {
  Write-Log '[HINT] zts_net_join failed: verify networkId + Central authorization + outbound network.'
}
if ($mainText -match 'authtoken.secret not found or readable') {
  Write-Log '[HINT] zerotier-cli permission issue: run terminal as Administrator.'
}

Write-Log 'Done.'
Write-Log ("Main log: {0}" -f $logFile)
Write-Log ("Start log: {0}" -f $runLog)
Write-Log '============================================================'

exit 0
