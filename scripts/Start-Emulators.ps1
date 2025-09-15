param(
  [switch]$HostingOnly,
  [switch]$Debug
)

Write-Host "==> Preparando entorno de emuladores" -ForegroundColor Cyan

# 1) Verificar que firebase-tools esté disponible
$fb = Get-Command firebase -ErrorAction SilentlyContinue
if (-not $fb) {
  Write-Host "No se encontró 'firebase' en PATH." -ForegroundColor Red
  Write-Host "Instala la CLI: npm i -g firebase-tools" -ForegroundColor Yellow
  Write-Host "O ejecútalo sin instalar globalmente: npx firebase emulators:start" -ForegroundColor Yellow
  exit 1
}

# 2) Sugerir Java si no está para Firestore/Auth (emuladores basados en Java)
$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java -and -not $HostingOnly) {
  Write-Host "Java no detectado. Firestore/Auth emuladores requieren Java 11+." -ForegroundColor Yellow
  Write-Host "Opciones:" -ForegroundColor Yellow
  Write-Host " - Instala Java 11+ y vuelve a intentar" -ForegroundColor Yellow
  Write-Host " - Ejecuta solo Hosting: .\\scripts\\Start-Emulators.ps1 -HostingOnly" -ForegroundColor Yellow
}

# 3) Construir comando
$argsList = @('emulators:start')
if ($HostingOnly) { 
    $argsList += @('--only','hosting') 
} else {
    # Inicia solo los emuladores necesarios para el frontend, evitando el error de Functions.
    $argsList += @('--only', 'auth,firestore,hosting')
}
if ($Debug) { $argsList += '--debug' }

Write-Host ("==> Iniciando emuladores con: firebase {0}" -f ($argsList -join ' ')) -ForegroundColor Cyan

# 4) Ejecutar y mostrar salida en vivo
& firebase @argsList
if ($LASTEXITCODE -ne 0) {
  Write-Host "Los emuladores salieron con código $LASTEXITCODE" -ForegroundColor Red
  Write-Host "Prueba con más detalle: .\\scripts\\Start-Emulators.ps1 -Debug" -ForegroundColor Yellow
  exit $LASTEXITCODE
}
