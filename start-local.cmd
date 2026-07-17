@echo off
setlocal
cd /d "%~dp0"
title QRguitar Local QA
call npm.cmd run local:qa --workspace @qrguitar/web
if errorlevel 1 exit /b 1
start "" "http://127.0.0.1:3003"
