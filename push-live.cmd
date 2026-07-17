@echo off
setlocal

cd /d "%~dp0"
title QRguitar Live Push

set "DEFAULT_SUPABASE_URL=https://qvoruycxxrbarlafvhbi.supabase.co"
set "NEXT_PUBLIC_SUPABASE_URL="
set "SUPABASE_URL="
set "SUPABASE_SERVICE_ROLE_KEY="
for /f %%A in ('git rev-parse HEAD') do set "QRGUITAR_GIT_SHA=%%A"
for /f "delims=" %%A in ('powershell -NoProfile -Command "(Get-Date).ToUniversalTime().ToString('o')"') do set "QRGUITAR_BUILD_TIMESTAMP=%%A"
set "QRGUITAR_DEPLOYMENT_ID=cli-%QRGUITAR_GIT_SHA:~0,12%"

if exist ".env.local" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.local") do (
    if /I "%%~A"=="NEXT_PUBLIC_SUPABASE_URL" set "NEXT_PUBLIC_SUPABASE_URL=%%~B"
    if /I "%%~A"=="SUPABASE_URL" set "SUPABASE_URL=%%~B"
    if /I "%%~A"=="SUPABASE_SERVICE_ROLE_KEY" set "SUPABASE_SERVICE_ROLE_KEY=%%~B"
  )
)

if not defined NEXT_PUBLIC_SUPABASE_URL set "NEXT_PUBLIC_SUPABASE_URL=%DEFAULT_SUPABASE_URL%"
if not defined SUPABASE_URL set "SUPABASE_URL=%NEXT_PUBLIC_SUPABASE_URL%"

if not defined SUPABASE_SERVICE_ROLE_KEY (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$p = Read-Host 'Paste SUPABASE_SERVICE_ROLE_KEY' -AsSecureString; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($p); try { [Runtime.InteropServices.Marshal]::PtrToStringAuto($b) } finally { if ($b -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) } }"`) do set "SUPABASE_SERVICE_ROLE_KEY=%%A"
)

if not defined SUPABASE_SERVICE_ROLE_KEY (
  echo.
  echo No SUPABASE_SERVICE_ROLE_KEY was provided.
  echo Nothing was pushed live.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -Command "$content = @('NEXT_PUBLIC_SUPABASE_URL=%NEXT_PUBLIC_SUPABASE_URL%','SUPABASE_URL=%SUPABASE_URL%','SUPABASE_SERVICE_ROLE_KEY=%SUPABASE_SERVICE_ROLE_KEY%'); Set-Content -LiteralPath '.env.local' -Value $content"

echo.
echo ==========================================
echo   QRguitar Live Push
echo ==========================================
echo.
echo Supabase URL: %NEXT_PUBLIC_SUPABASE_URL%
echo Local env file: .env.local
echo.

if not exist ".vercel\project.json" (
  echo This folder is not linked to a Vercel project yet.
  echo Run this once in this folder:
  echo   npx --yes vercel@latest link
  echo.
  pause
  exit /b 1
)

echo [1/2] Building the live website...
call npm.cmd run build --workspace @qrguitar/web
if errorlevel 1 (
  echo.
  echo Build failed. Nothing was pushed live.
  echo Fix the error, then run this again.
  echo.
  pause
  exit /b 1
)

echo.
echo [2/2] Pushing to Vercel production...
call npx --yes vercel@latest deploy --prod --yes ^
  --build-env QRGUITAR_BUILD_ENV=production ^
  --build-env QRGUITAR_GIT_SHA=%QRGUITAR_GIT_SHA% ^
  --build-env QRGUITAR_BUILD_TIMESTAMP=%QRGUITAR_BUILD_TIMESTAMP% ^
  --build-env QRGUITAR_BUILD_DIRTY=false ^
  --build-env QRGUITAR_DEPLOYMENT_ID=%QRGUITAR_DEPLOYMENT_ID% ^
  --env QRGUITAR_BUILD_ENV=production ^
  --env QRGUITAR_GIT_SHA=%QRGUITAR_GIT_SHA% ^
  --env QRGUITAR_BUILD_TIMESTAMP=%QRGUITAR_BUILD_TIMESTAMP% ^
  --env QRGUITAR_BUILD_DIRTY=false ^
  --env QRGUITAR_DEPLOYMENT_ID=%QRGUITAR_DEPLOYMENT_ID% ^
  --build-env NEXT_PUBLIC_SUPABASE_URL=%NEXT_PUBLIC_SUPABASE_URL% ^
  --build-env SUPABASE_URL=%SUPABASE_URL% ^
  --build-env SUPABASE_SERVICE_ROLE_KEY=%SUPABASE_SERVICE_ROLE_KEY% ^
  --env NEXT_PUBLIC_SUPABASE_URL=%NEXT_PUBLIC_SUPABASE_URL% ^
  --env SUPABASE_URL=%SUPABASE_URL% ^
  --env SUPABASE_SERVICE_ROLE_KEY=%SUPABASE_SERVICE_ROLE_KEY%
if errorlevel 1 (
  echo.
  echo Deploy failed. Your live site was not changed.
  echo.
  pause
  exit /b 1
)

echo.
echo Done. QRguitar has been pushed live.
echo Live site: https://qrguitar.com
echo.
pause
