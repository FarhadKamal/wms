# Updates the live WMS to the latest code on GitHub (main branch).
# Run on the server, in PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File E:\wms\deploy\update.ps1
# The API is stopped for 1-2 minutes while it rebuilds; run it outside working hours.
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads other characters.

param(
  [string]$Service = 'azneo-wms-api',
  [int]$ApiPort = 8102
)

$ErrorActionPreference = 'Stop'
$App = Split-Path -Parent $PSScriptRoot   # the folder holding backend\ and frontend\

function Run([string]$What, [scriptblock]$Cmd) {
  Write-Host "==> $What" -ForegroundColor Cyan
  $global:LASTEXITCODE = 0
  # git and npm print progress on stderr; judge success by the exit code only.
  $ErrorActionPreference = 'Continue'
  & $Cmd
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)." }
}

Set-Location $App
$before = (git rev-parse --short HEAD)
Run 'Get the latest code' { git pull --ff-only origin main }
$after = (git rev-parse --short HEAD)
Write-Host "Code: $before -> $after"

# 1. Web app: built while the old version keeps running.
Set-Location "$App\frontend"
Run 'Web app: install packages' { npx -y npm@11 ci --no-audit --no-fund }
Run 'Web app: build' { npm run build }

# 2. API: stopped while its packages and database are updated.
Set-Location "$App\backend"
Write-Host "==> Stop $Service" -ForegroundColor Cyan
Stop-Service $Service
try {
  Run 'API: install packages' { npx -y npm@11 ci --no-audit --no-fund }
  Run 'API: generate database client' { npx prisma generate }
  Run 'API: build' { npm run build }
  Run 'Database: apply new migrations' { npx prisma migrate deploy }
} finally {
  # Start again even if a step failed, so the previous build keeps serving if it is still intact.
  Write-Host "==> Start $Service" -ForegroundColor Cyan
  Start-Service $Service
}

# 3. Check the API answers and can reach the database.
for ($i = 0; $i -lt 30; $i++) {
  try {
    $h = Invoke-RestMethod "http://127.0.0.1:$ApiPort/api/health" -TimeoutSec 3
    if ($h.database -eq 'ok') {
      Write-Host "Done. WMS is running version $after (database $($h.name))." -ForegroundColor Green
      exit 0
    }
  } catch { }
  Start-Sleep -Seconds 1
}
Write-Host "The API did not answer on port $ApiPort. Check $App\backend\logs\api.log" -ForegroundColor Red
exit 1
