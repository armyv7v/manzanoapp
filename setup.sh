#!/bin/bash

# Este script automatiza la configuración completa de Tailwind CSS para el proyecto.
# Se asegura de que todas las carpetas y archivos de configuración estén en su lugar
# y luego instala las dependencias y compila el CSS por primera vez.

echo "🚀 Iniciando la configuración automática del proyecto..."

# --- Paso 1: Crear el archivo package.json ---
echo "📦 Creando package.json..."
cat <<EOF > package.json
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
EOF

# --- Paso 2: Crear el archivo de configuración de Tailwind ---
echo "🎨 Creando tailwind.config.js..."
cat <<EOF > tailwind.config.js
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
EOF

# --- Paso 3: Crear la estructura de directorios y el archivo CSS de entrada ---
echo "📁 Creando directorio 'src' y archivo 'input.css' con contenido..."
mkdir -p src
cat <<EOF > src/input.css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .historical-status-btn { @apply border-2 border-transparent transition-all duration-200 ease-in-out; }
  .historical-status-btn:not(.active)[data-status="Todos"] { @apply bg-gray-200 text-gray-700; }
  .historical-status-btn:not(.active)[data-status="Pendiente de pago"] { @apply bg-amber-100 text-amber-800 border-amber-400; }
  .historical-status-btn:not(.active)[data-status="Pagado"] { @apply bg-green-100 text-green-800 border-green-400; }
  .historical-status-btn:not(.active)[data-status="Cancelado"] { @apply bg-red-100 text-red-800 border-red-400; }
  /* By adding [data-status], this selector becomes more specific and overrides the others without needing !important */
  .historical-status-btn[data-status].active {
    @apply bg-blue-500 text-white border-blue-500 scale-105 shadow-md;
  }
}
EOF

# --- Paso 4: Asegurarse de que el directorio de salida exista ---
echo "📁 Creando directorio 'public/css' para el archivo de salida..."
mkdir -p public/css

# --- Paso 5: Instalar las dependencias de Node.js ---
echo "📥 Instalando dependencias con npm (esto puede tardar un momento)..."
if ! command -v npm &> /dev/null
then
    echo "⚠️  ADVERTENCIA: El comando 'npm' no se encontró."
    echo "Por favor, instala Node.js y npm, y luego ejecuta 'npm install' y 'npm run build' manualmente."
    exit 1
fi

npm install

# --- Paso 6: Compilar el CSS por primera vez ---
echo "✨ Compilando los estilos de Tailwind CSS..."
npm run build

echo ""
echo "✅ ¡Configuración completada con éxito!"
echo "Tu archivo CSS ha sido generado en 'public/css/styles.css'."
echo "Para seguir desarrollando, puedes usar el comando: npm run watch"
