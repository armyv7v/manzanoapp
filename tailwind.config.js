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
    'bg-blue-200',
    'text-blue-600',
    'bg-purple-600',
    'hover:bg-purple-700',
    'bg-purple-200',
    'text-purple-600',
    'bg-teal-200',
    'text-teal-600',
    'bg-yellow-100',
    'text-yellow-800',
    'bg-green-100',
    'text-green-800',
    'text-blue-700'
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
