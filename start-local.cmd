@echo off
setlocal

cd /d "%~dp0"
title QRguitar Local Dev

set "TARGET_PORT=3003"
set "TARGET_HOST=127.0.0.1"

echo.
echo ==========================================
echo   Starting QRguitar locally on %TARGET_PORT%
echo ==========================================
echo.

for /f %%P in ('powershell -NoProfile -Command "(Get-NetTCPConnection -State Listen -LocalPort %TARGET_PORT% -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)"') do set "QRGUITAR_PORT_PID=%%P"

if defined QRGUITAR_PORT_PID (
  echo Reclaiming port %TARGET_PORT% from PID %QRGUITAR_PORT_PID%...
  powershell -NoProfile -Command "Stop-Process -Id %QRGUITAR_PORT_PID% -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 750"
)

if exist "apps\web\.next" (
  echo Clearing stale Next.js dev cache...
  powershell -NoProfile -Command "Remove-Item -LiteralPath 'apps\\web\\.next' -Recurse -Force -ErrorAction SilentlyContinue"
)

echo Launching local dev server in a new window...
start "QRguitar Local Server" cmd /k "cd /d %~dp0 && npm.cmd --workspace apps/web run dev -- --hostname %TARGET_HOST% --port %TARGET_PORT%"

echo Waiting for the app to be ready...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(60); do { try { if (Test-NetConnection %TARGET_HOST% -Port %TARGET_PORT% -InformationLevel Quiet) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"

if errorlevel 1 (
  echo QRguitar did not finish starting within 60 seconds.
  exit /b 1
)

start "" "http://%TARGET_HOST%:%TARGET_PORT%/?fresh=%RANDOM%"
