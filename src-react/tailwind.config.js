const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', ...defaultTheme.fontFamily.sans],
            },
            maxWidth: {
                '900': '900px',
            },
            colors: {
                manzano: {
                    50: '#f4f9e8',
                    100: '#e6f1cc',
                    200: '#cfe4a0',
                    300: '#b8d674',
                    400: '#a2c028',
                    500: '#8aab1f',
                    600: '#6f8a18',
                    700: '#546812',
                    800: '#3a470d',
                    900: '#1f2507',
                },
                charcoal: {
                    50: '#f5f5f5',
                    100: '#e0e0e0',
                    200: '#b8b8b8',
                    300: '#8f8f8f',
                    400: '#666666',
                    500: '#4d4d4d',
                    600: '#3d3d3d',
                    700: '#323232',
                    800: '#262626',
                    900: '#1a1a1a',
                },
            },
        },
    },
    plugins: [],
}
