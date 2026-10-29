/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
    content: [
        "./index.html",
        "./*.{ts,tsx}",
        "./pages/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./services/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Figtree', ...defaultTheme.fontFamily.sans],
                heading: ['Gabarito', ...defaultTheme.fontFamily.sans],
                mono: ['"Spline Sans Mono"', ...defaultTheme.fontFamily.mono],
            },
            colors: {
                brand: {
                    blue: '#4F46E5', bluedeep: '#3730A3',
                    green: '#0D9488', greendeep: '#0F766E',
                    orange: '#D97706', orangedeep: '#B45309',
                },
                ink: { DEFAULT: '#0C0F1D', soft: '#2E3347', muted: '#64668A' },
            },
        },
    },
    plugins: [],
}
