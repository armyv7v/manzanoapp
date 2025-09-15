Param(
  [switch]$FunctionsOnly,
  [switch]$HostingOnly
)

Write-Host "==> Despliegue" -ForegroundColor Cyan

if ($FunctionsOnly -and $HostingOnly) {
  throw "No puedes usar -FunctionsOnly y -HostingOnly a la vez."
}

if ($FunctionsOnly) {
  Push-Location functions
  npm ci
  npm run deploy
  Pop-Location
  exit
}

if ($HostingOnly) {
  firebase deploy --only hosting
  exit
}

# full deploy
Push-Location functions
npm ci
npm run deploy
Pop-Location

firebase deploy --only firestore:rules
firebase deploy --only storage
firebase deploy --only firestore:indexes
firebase deploy --only hosting

Write-Host "Despliegue completo." -ForegroundColor Green
