const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}"
  ],
  safelist: [
    'bg-orange-500',
    'text-white',
    'bg-orange-100',
    'text-orange-700',
    'border-orange-400',
    'border-blue-500',
    'bg-blue-100',
    'bg-blue-200',
    'text-blue-600',
    'text-blue-800',
    'bg-purple-600',
    'hover:bg-purple-700',
    'bg-purple-100',
    'bg-purple-200',
    'text-purple-600',
    'text-purple-700',
    'text-purple-800',
    'border-purple-500',
    'bg-teal-200',
    'text-teal-600',
    'bg-yellow-100',
    'text-yellow-800',
    'bg-green-100',
    'text-green-800',
    'text-blue-700',
    'bg-green-200',
    'bg-red-200',
    'text-red-800'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}
