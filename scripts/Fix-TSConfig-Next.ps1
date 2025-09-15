Param(
  [switch]$AllowJs
)

$root = Get-Location
Write-Host "==> Arreglando tsconfig para Next.js en $root" -ForegroundColor Cyan

# 1) Crear next-env.d.ts si no existe
$nextEnv = Join-Path $root "next-env.d.ts"
if (-not (Test-Path $nextEnv)) {
  @"
/// <reference types="next" />
/// <reference types="next/types/global" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/basic-features/typescript for more information.
"@ | Set-Content -Encoding UTF8 $nextEnv
  Write-Host "Creado next-env.d.ts" -ForegroundColor Green
} else {
  Write-Host "next-env.d.ts OK" -ForegroundColor Green
}

# 2) Crear/ajustar tsconfig.json
$tsconfigPath = Join-Path $root "tsconfig.json"
$allowJsValue = if ($AllowJs) { "true" } else { "false" }

$tsconfig = @"
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": $allowJsValue,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.cjs", "**/*.mjs"],
  "exclude": ["node_modules"]
}
"@

$tsconfig | Set-Content -Encoding UTF8 $tsconfigPath
Write-Host "tsconfig.json actualizado" -ForegroundColor Green

# 3) Sugerir restart TS Server
Write-Host "TIP: En VS Code, ejecuta 'TypeScript: Restart TS Server' y luego 'npm run dev'." -ForegroundColor Yellow
