Param(
  [switch]$UseRequire,   # Si prefieres require(): import cors = require("cors")
  [switch]$Install,      # Ejecuta npm ci / npm i en functions
  [switch]$Build         # Ejecuta npm run build en functions
)

$ErrorActionPreference = "Stop"

function Save-Json($path, $obj) {
  $json = $obj | ConvertTo-Json -Depth 20
  $json = $json -replace "`r`n","`n"
  Set-Content -Encoding UTF8 $path $json
}

Write-Host "==> Fix de Firebase Functions (cors, src/, tsconfig, package.json)" -ForegroundColor Cyan

# Ubicar carpeta functions
$root = Get-Location
$funcRoot = Join-Path $root "functions"
if (-not (Test-Path $funcRoot)) {
  throw "No se encontró la carpeta 'functions' en $root. Ejecuta este script desde la raíz del proyecto."
}

# 1) Arreglar carpeta src vs scr
$srcDir = Join-Path $funcRoot "src"
$scrDir = Join-Path $funcRoot "scr"
if ((Test-Path $scrDir) -and -not (Test-Path $srcDir)) {
  Write-Host "Renombrando 'functions/scr' -> 'functions/src'..." -ForegroundColor Yellow
  Rename-Item $scrDir "src"
}
if (-not (Test-Path $srcDir)) {
  Write-Host "Creando 'functions/src'..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Path $srcDir | Out-Null
}

# 2) tsconfig.json de functions (aislar tipos y saltar d.ts de libs)
$tsconfigPath = Join-Path $funcRoot "tsconfig.json"
$tsObj = $null
if (Test-Path $tsconfigPath) {
  try {
    $tsObj = Get-Content $tsconfigPath -Raw | ConvertFrom-Json
  } catch {
    Write-Host "tsconfig.json inválido, recreando..." -ForegroundColor Yellow
  }
}
if (-not $tsObj) { $tsObj = @{ } }
if (-not $tsObj.compilerOptions) { $tsObj.compilerOptions = @{ } }

$co = $tsObj.compilerOptions
$co.target  = "ES2022"
$co.lib     = @("ES2022")
$co.module  = "commonjs"
$co.outDir  = "lib"
$co.rootDir = "src"
$co.strict  = $true
$co.esModuleInterop = $true
$co.allowSyntheticDefaultImports = $true
$co.skipLibCheck = $true
$co.types = @()
$co.typeRoots = @("./node_modules/@types")
$tsObj.include = @("src/**/*.ts")
$tsObj.exclude = @("node_modules","lib","scr")

Save-Json $tsconfigPath $tsObj
Write-Host "tsconfig.json OK" -ForegroundColor Green

# 3) package.json de functions (dependencias mínimas)
$pkgPath = Join-Path $funcRoot "package.json"
$pkg = $null
if (Test-Path $pkgPath) {
  try { $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json } catch {}
}
if (-not $pkg) {
  $pkg = @{
    name = "functions"
    type = "commonjs"
    engines = @{ node = "18" }
    main = "lib/index.js"
    scripts = @{
      build = "tsc"
      serve = "npm run build && firebase emulators:start --only functions,firestore,auth,hosting"
      deploy = "npm run build && firebase deploy --only functions"
      lint = "eslint ."
    }
    dependencies = @{}
    devDependencies = @{}
  }
}
if (-not $pkg.engines) {
  $pkg.engines = @{ node = "18" }
} else {
  $pkg.engines.node = "18"
}
if (-not $pkg.main) { $pkg.main = "lib/index.js" }
if (-not $pkg.scripts) {
  $pkg.scripts = @{
    build = "tsc"
    serve = "npm run build && firebase emulators:start --only functions,firestore,auth,hosting"
    deploy = "npm run build && firebase deploy --only functions"
    lint = "eslint ."
  }
}
if (-not $pkg.dependencies)   { $pkg.dependencies   = @{} }
if (-not $pkg.devDependencies){ $pkg.devDependencies= @{} }

$deps = $pkg.dependencies
$devd = $pkg.devDependencies
if (-not $deps.ContainsKey("firebase-admin"))    { $deps."firebase-admin"    = "^12.5.0" }
if (-not $deps.ContainsKey("firebase-functions")){ $deps."firebase-functions"= "^5.0.0" }
if (-not $deps.ContainsKey("cors"))              { $deps."cors"              = "^2.8.5" }
if (-not $devd.ContainsKey("@types/cors"))       { $devd."@types/cors"       = "^2.8.17" }
if (-not $devd.ContainsKey("typescript"))        { $devd."typescript"        = "^5.5.0" }
if (-not $devd.ContainsKey("eslint"))            { $devd."eslint"            = "^9.0.0" }

Save-Json $pkgPath $pkg
Write-Host "package.json OK" -ForegroundColor Green

# 4) index.ts (import de cors + handler)
$indexTs = Join-Path $srcDir "index.ts"
if (-not (Test-Path $indexTs)) {
@'
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import cors from "cors";

admin.initializeApp();
const db = admin.firestore();

const corsHandler = cors({ origin: true });

export const ping = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    res.status(200).send({ ok: true, ts: Date.now() });
  });
});
'@ | Set-Content -Encoding UTF8 $indexTs
  Write-Host "Creado functions/src/index.ts (ping)" -ForegroundColor Yellow
} else {
  $content = Get-Content $indexTs -Raw

  # Normaliza import de cors (namespace o require -> default import)
  $content = $content -replace 'import\s+\*\s+as\s+cors(Lib)?\s+from\s+["'']cors["''];?', 'import cors from "cors";'
  $content = $content -replace 'const\s+cors\s*=\s*require\(\s*["'']cors["'']\s*\);?', 'import cors from "cors";'

  # Asegura creación de corsHandler
  if ($content -notmatch 'const\s+corsHandler\s*=\s*cors\(') {
    $content = $content -replace 'admin\.initializeApp\(\);\s*', "admin.initializeApp();`nconst db = admin.firestore();`nconst corsHandler = cors({ origin: true });`n"
  }

  # Reemplaza invocaciones cors(req, res, ...) -> corsHandler(req, res, ...)
  $content = $content -replace '\bcors\s*\(\s*req\b', 'corsHandler(req'

  Set-Content -Encoding UTF8 $indexTs $content
  Write-Host "index.ts: import/uso de cors corregido" -ForegroundColor Green
}

# 5) npm install / build si se pide
Push-Location $funcRoot
try {
  if ($Install) {
    if (Test-Path (Join-Path $funcRoot "package-lock.json")) {
      Write-Host "npm ci (functions)..." -ForegroundColor Yellow
      npm ci | Out-Null
    } else {
      Write-Host "npm i (functions)..." -ForegroundColor Yellow
      npm i | Out-Null
    }
  }
  if ($Build) {
    Write-Host "npm run build (functions)..." -ForegroundColor Yellow
    npm run build
  }
} finally {
  Pop-Location
}

Write-Host "==> Fix completado." -ForegroundColor Green
Write-Host "Si VS Code aún mostraba errores, usa: Ctrl+Shift+P -> TypeScript: Restart TS Server." -ForegroundColor Yellow
