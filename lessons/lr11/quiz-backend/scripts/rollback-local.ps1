$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$currentTagFile = Join-Path $PSScriptRoot ".release-current"
$previousTagFile = Join-Path $PSScriptRoot ".release-previous"

if (-not (Test-Path $previousTagFile)) {
  Write-Error "No previous release tag found. Rollback is not possible yet."
  exit 1
}

$rollbackTag = (Get-Content $previousTagFile -Raw).Trim()
if (-not $rollbackTag) {
  Write-Error "Previous release tag is empty."
  exit 1
}

Write-Host "Rolling back to: $rollbackTag"
$env:BACKEND_IMAGE = $rollbackTag
docker compose up -d --no-build

Write-Host "Smoke check after rollback: /health"
$maxAttempts = 15
$ok = $false
for ($i = 1; $i -le $maxAttempts; $i++) {
  try {
    $response = Invoke-WebRequest "http://localhost:3000/health" -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      $ok = $true
      break
    }
  }
  catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $ok) {
  docker compose logs --tail=40 backend
  Write-Error "Rollback smoke check failed."
  exit 1
}

Set-Content -Path $currentTagFile -Value $rollbackTag -NoNewline
Write-Host "Rollback succeeded. Active tag: $rollbackTag"
