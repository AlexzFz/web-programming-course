$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$newTag = "quiz-backend:release-$timestamp"
$currentTagFile = Join-Path $PSScriptRoot ".release-current"
$previousTagFile = Join-Path $PSScriptRoot ".release-previous"

if (Test-Path $currentTagFile) {
  $currentTag = (Get-Content $currentTagFile -Raw).Trim()
  if ($currentTag) {
    Set-Content -Path $previousTagFile -Value $currentTag -NoNewline
  }
}

Write-Host "Building new image: $newTag"
docker build -t $newTag .

Write-Host "Starting compose with tag: $newTag"
$env:BACKEND_IMAGE = $newTag
docker compose up -d --no-build

Write-Host "Smoke check: /health"
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
  Write-Error "Smoke check failed. Run rollback script: .\scripts\rollback-local.ps1"
  exit 1
}

Set-Content -Path $currentTagFile -Value $newTag -NoNewline
Write-Host "Release succeeded. Current tag: $newTag"
