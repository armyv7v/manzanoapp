Write-Host "==> CI build check" -ForegroundColor Cyan
$ErrorActionPreference = "Stop"

if (Test-Path package-lock.json) { npm ci } else { npm i }
if (Test-Path functions/package-lock.json) { Push-Location functions; npm ci; Pop-Location }

# Lint opcional
if (Test-Path .eslintrc* ) {
  Write-Host "Ejecutando ESLint (opcional)..." -ForegroundColor Yellow
  npx eslint . || Write-Host "Lint warnings" -ForegroundColor Yellow
}

Write-Host "Build Front (si aplica)..." -ForegroundColor Cyan
if (Test-Path package.json) {
  $pkg = Get-Content package.json | ConvertFrom-Json
  if ($pkg.scripts.build) { npm run build }
}

Write-Host "Build Functions..." -ForegroundColor Cyan
Push-Location functions
npm run build
Pop-Location

Write-Host "CI OK" -ForegroundColor Green
