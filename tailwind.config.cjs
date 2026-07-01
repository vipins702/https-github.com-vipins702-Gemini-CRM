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
                    blue: '#2563EB', bluedeep: '#1E40AF',
                    green: '#059669', greendeep: '#047857',
                    orange: '#EA7317', orangedeep: '#C75D08',
                },
                ink: { DEFAULT: '#101528', soft: '#3B415A', muted: '#6E7490' },
            },
        },
    },
    plugins: [],
}
