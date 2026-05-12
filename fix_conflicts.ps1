#!/usr/bin/env pwsh
# Este script corrige los conflictos de clases 'flex' y 'hidden' en el archivo index.html.
# Busca elementos que tienen ambas clases y elimina 'flex' para resolver las advertencias
# de Tailwind CSS IntelliSense y seguir las mejores prácticas.

# Ruta al archivo a modificar
# --- Configuration ---
$htmlFilePath = ".\public\index.html"
$conflictPattern = 'flex items-center justify-center'
$fixPattern = 'items-center justify-center'

# --- Script Body ---
Write-Host "Iniciando script para corregir conflictos de clases en $htmlFilePath..."

# Verificar si el archivo existe
if (-not (Test-Path $htmlFilePath)) {
    # Usamos Join-Path para mostrar la ruta completa de forma segura.
    $fullPath = (Join-Path $PSScriptRoot $htmlFilePath).FullName
    Write-Host -ForegroundColor Red "ERROR: No se encontro el archivo en la ruta esperada: $fullPath"
    Write-Host -ForegroundColor Red 'Asegurate de ejecutar el script desde la raiz del proyecto.'
    exit
}

# Leer el contenido del archivo
$htmlContent = Get-Content -Path $htmlFilePath -Raw

# Verificar si el conflicto existe en el archivo
if ($htmlContent -match [regex]::Escape($conflictPattern)) {
    Write-Host 'Conflicto encontrado. Aplicando correccion...'
    $newHtmlContent = $htmlContent -replace $conflictPattern, $fixPattern
    Set-Content -Path $htmlFilePath -Value $newHtmlContent
    Write-Host -ForegroundColor Green 'Exito! Se ha eliminado la clase `flex` de los elementos ocultos.'
    Write-Host -ForegroundColor Yellow 'IMPORTANTE: Recuerda actualizar tu `js/main.js` para manejar la clase `flex` al mostrar/ocultar modales.'
} else {
    Write-Host -ForegroundColor Cyan 'No se encontraron conflictos. El archivo ya parece estar corregido.'
}
