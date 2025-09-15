Param(
  [string]$ProjectId = $(Read-Host "Project ID de Firebase (ej. manoapp-prod)"),
  [switch]$InstallCLI
)

Write-Host "==> Setup Firebase para $ProjectId" -ForegroundColor Cyan

if ($InstallCLI) {
  Write-Host "Instalando Firebase CLI via npm - requiere Node.js" -ForegroundColor Yellow
  npm i -g firebase-tools
}

firebase --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Firebase CLI no disponible. Ejecuta con -InstallCLI o instala Node/npm." }

firebase login
firebase use $ProjectId

@"
{
  "projects": { "default": "$ProjectId" }
}
"@ | Set-Content -Encoding UTF8 .firebaserc

Write-Host "Creando reglas e índices por defecto..." -ForegroundColor Cyan
if (-not (Test-Path ./firestore.rules)) { New-Item firestore.rules -ItemType File | Out-Null }
if (-not (Test-Path ./storage.rules))   { New-Item storage.rules   -ItemType File | Out-Null }
if (-not (Test-Path ./firestore.indexes.json)) { New-Item firestore.indexes.json -ItemType File | Out-Null }

Write-Host "Setup completo." -ForegroundColor Green
