Param(
  [string]$EnvPath = ".env.local"
)

Write-Host "==> Creando $EnvPath" -ForegroundColor Cyan

$apiKey = Read-Host "VITE_FB_API_KEY"
$authDomain = Read-Host "VITE_FB_AUTH_DOMAIN (ej. manoapp.firebaseapp.com)"
$projectId = Read-Host "VITE_FB_PROJECT_ID"
$storageBucket = Read-Host "VITE_FB_STORAGE_BUCKET (ej. manoapp.appspot.com)"
$msgSender = Read-Host "VITE_FB_MESSAGING_SENDER_ID"
$appId = Read-Host "VITE_FB_APP_ID"

@"
VITE_FB_API_KEY=$apiKey
VITE_FB_AUTH_DOMAIN=$authDomain
VITE_FB_PROJECT_ID=$projectId
VITE_FB_STORAGE_BUCKET=$storageBucket
VITE_FB_MESSAGING_SENDER_ID=$msgSender
VITE_FB_APP_ID=$appId
"@ | Set-Content -Encoding UTF8 $EnvPath

Write-Host "Archivo .env listo." -ForegroundColor Green
