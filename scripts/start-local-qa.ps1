param(
  [switch]$Strict,
  [switch]$RunLaunchTests,
  [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$expectedLeaf = "qrguitar-platform-recovered"
$hostName = "127.0.0.1"
$port = 3003
$origin = "http://${hostName}:${port}"

if ((Split-Path $repo -Leaf) -ne $expectedLeaf -or -not (Test-Path (Join-Path $repo ".git"))) {
  throw "Local QA must run from the recovered QRguitar repository: $expectedLeaf"
}

Set-Location $repo
$sha = (git rev-parse HEAD).Trim()
$branch = (git branch --show-current).Trim()
$status = @(git status --short)
$dirty = $status.Count -gt 0

Write-Host "Repository: $repo"
Write-Host "Git SHA:    $sha"
Write-Host "Branch:     $branch"
Write-Host "Git status:"
if ($dirty) { $status | ForEach-Object { Write-Host "  $_" } } else { Write-Host "  clean" }

if ($Strict -and $dirty) {
  throw "Strict local QA requires a clean working tree. Review the listed changes first."
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $occupant = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  $commandLine = [string]$occupant.CommandLine
  Write-Host "Port $port is occupied by PID $($listener.OwningProcess): $commandLine"
  if ($commandLine.IndexOf($repo, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "Port $port belongs to an unrelated process. It was not stopped."
  }
  Write-Host "Stopping the previous QRguitar listener on port $port..."
  Stop-Process -Id $listener.OwningProcess -Force
  Start-Sleep -Milliseconds 750
}

$env:QRGUITAR_BUILD_ENV = "local"
$env:QRGUITAR_GIT_SHA = $sha
$env:QRGUITAR_BUILD_TIMESTAMP = (Get-Date).ToUniversalTime().ToString("o")
$env:QRGUITAR_BUILD_DIRTY = if ($dirty) { "true" } else { "false" }
$env:QRGUITAR_DEPLOYMENT_ID = "local-$($sha.Substring(0, 12))"

Write-Host "Building the production artifact..."
& cmd /c npm run build --workspace @qrguitar/web
if ($LASTEXITCODE -ne 0) { throw "QRguitar build failed." }

Write-Host "Running typecheck..."
& cmd /c npm run typecheck --workspace @qrguitar/web
if ($LASTEXITCODE -ne 0) { throw "QRguitar typecheck failed." }

if ($RunLaunchTests) {
  Write-Host "Running launch tests..."
  & cmd /c npm run test:launch --workspace @qrguitar/web
  if ($LASTEXITCODE -ne 0) { throw "QRguitar launch tests failed." }
}

$stateDir = Join-Path $env:LOCALAPPDATA "QRguitar\local-qa"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$stdout = Join-Path $stateDir "server.stdout.log"
$stderr = Join-Path $stateDir "server.stderr.log"
Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue

Write-Host "Starting production-style QRguitar at $origin..."
$server = Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/s", "/c", "npm.cmd run start --workspace @qrguitar/web -- --hostname $hostName --port $port" -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

$deadline = (Get-Date).AddSeconds(90)
$listenerPid = $null
do {
  Start-Sleep -Milliseconds 500
  $active = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($active) { $listenerPid = $active.OwningProcess }
} while (-not $listenerPid -and (Get-Date) -lt $deadline -and -not $server.HasExited)

if (-not $listenerPid) {
  $errorTail = if (Test-Path $stderr) { (Get-Content $stderr -Tail 30) -join "`n" } else { "No server error log was written." }
  throw "QRguitar did not start on $origin.`n$errorTail"
}

$buildInfo = Invoke-RestMethod -Uri "$origin/api/build-info" -Headers @{ "Cache-Control" = "no-cache" }
if ($buildInfo.gitCommitSha -ne $sha -or $buildInfo.environment -ne "local" -or $buildInfo.origin -ne $origin) {
  throw "Build identity did not match the requested local candidate."
}

$state = [ordered]@{
  repository = $repo
  gitSha = $sha
  branch = $branch
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
  pid = $listenerPid
  launcherPid = $server.Id
  port = $port
  host = $hostName
  origin = $origin
  serverMode = "production-style"
  dirtyWorkingTree = $dirty
  stdout = $stdout
  stderr = $stderr
}
$stateFile = Join-Path $stateDir "state.json"
$state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

Write-Host "Local QA ready: $origin"
Write-Host "Listener PID: $listenerPid"
Write-Host "State file: $stateFile"
if ($OpenBrowser) { Start-Process $origin }
