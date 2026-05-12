#!/usr/bin/env pwsh
# Este script automatiza la configuración completa de Tailwind CSS para el proyecto.

Write-Host "🚀 Iniciando la configuración automática del proyecto..."

# --- Paso 1: Crear package.json ---
Write-Host "📦 Creando package.json..."
$packageJsonContent = @"
{
  "name": "remesas-app-frontend",
  "version": "1.0.0",
  "description": "Frontend assets and Tailwind CSS build for Remesas App",
  "scripts": {
    "build": "tailwindcss -i ./src/input.css -o ./public/css/styles.css --minify",
    "watch": "tailwindcss -i ./src/input.css -o ./public/css/styles.css --watch"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.1"
  }
}
"@
Set-Content -Path "package.json" -Value $packageJsonContent

# --- Paso 2: Crear tailwind.config.js ---
Write-Host "🎨 Creando tailwind.config.js..."
$tailwindConfigContent = @"
const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      maxWidth: {
        '900': '900px',
      }
    },
  },
  plugins: [],
}
"@
Set-Content -Path "tailwind.config.js" -Value $tailwindConfigContent

# --- Paso 3: Crear el directorio 'src' y el archivo 'input.css' ---
Write-Host "📁 Creando directorio 'src' y archivo 'input.css'..."
New-Item -ItemType Directory -Force -Path "./src" | Out-Null
$inputCssContent = @"
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .historical-status-btn { @apply border-2 border-transparent transition-all duration-200 ease-in-out; }
  .historical-status-btn:not(.active)[data-status="Todos"] { @apply bg-gray-200 text-gray-700; }
  .historical-status-btn:not(.active)[data-status="Pendiente de pago"] { @apply bg-amber-100 text-amber-800 border-amber-400; }
  .historical-status-btn:not(.active)[data-status="Pagado"] { @apply bg-green-100 text-green-800 border-green-400; }
  .historical-status-btn:not(.active)[data-status="Cancelado"] { @apply bg-red-100 text-red-800 border-red-400; }
  .historical-status-btn[data-status].active { @apply bg-blue-500 text-white border-blue-500 scale-105 shadow-md; }
}
"@
Set-Content -Path "./src/input.css" -Value $inputCssContent

# --- Paso 4: Asegurarse de que el directorio de salida exista ---
Write-Host "📁 Creando directorio 'public/css' para el archivo de salida..."
New-Item -ItemType Directory -Force -Path "./public/css" | Out-Null

# --- Paso 5: Instalar dependencias de Node.js ---
if (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Host "📥 Instalando dependencias con npm (esto puede tardar un momento)..."
    npm install
    
    # --- Paso 6: Compilar el CSS por primera vez ---
    Write-Host "✨ Compilando los estilos de Tailwind CSS..."
    npm run build
} else {
    Write-Host -ForegroundColor Yellow "⚠️  ADVERTENCIA: El comando 'npm' no se encontró."
    Write-Host -ForegroundColor Yellow "Por favor, instala Node.js y npm, y luego ejecuta 'npm install' y 'npm run build' manualmente."
    # Termina el script aquí para evitar más errores.
    exit
}

Write-Host ""
Write-Host "✅ ¡Configuración completada con éxito!"
Write-Host "Tu archivo CSS ha sido generado en 'public/css/styles.css'."
Write-Host "Para seguir desarrollando, puedes usar el comando: npm run watch"