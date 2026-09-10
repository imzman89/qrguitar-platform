@echo off
setlocal
cd /d "%~dp0"
title QRguitar Live Push
call npm.cmd run push:live
if errorlevel 1 (
  echo.
  echo Release stopped. Read the reported failure before retrying.
  pause
  exit /b 1
)
echo.
echo Production release identity and public app checks passed.
pause
