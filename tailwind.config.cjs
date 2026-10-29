/** @type {import('tailwindcss').Config} */

// Every palette resolves to CSS tokens defined in index.css, which switch between
// light and dark mode. So existing classes (bg-gray-50, text-indigo-600, …) follow
// the theme without per-component dark: variants.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (token) => Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--${token}-${s}) / <alpha-value>)`]));
const v = (token) => `rgb(var(--${token}) / <alpha-value>)`;

const neutral = scale('neutral');
const accent = scale('accent');
const systemFont = ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'];

module.exports = {
    darkMode: 'class',
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
                sans: systemFont,
                heading: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'Inter', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
                mono: ['ui-monospace', '"SF Mono"', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
            },
            colors: {
                // One neutral family for every grey.
                gray: neutral, slate: neutral, zinc: neutral, neutral: neutral, stone: neutral,
                // Primary actions follow the brand colour (default Apple Blue).
                blue: accent, indigo: accent, sky: accent, accent: { ...accent, DEFAULT: v('accent-600'), deep: v('accent-700'), soft: v('accent-50') },
                // Apple system colours for status and charts.
                violet: scale('purple'), purple: scale('purple'), fuchsia: scale('purple'),
                green: scale('green'), emerald: scale('green'), lime: scale('green'),
                teal: scale('teal'), cyan: scale('teal'),
                amber: scale('orange'), yellow: scale('orange'), orange: scale('orange'),
                red: scale('red'),
                rose: scale('pink'), pink: scale('pink'),
                success: { DEFAULT: v('green-600'), deep: v('green-700'), soft: v('green-50') },
                warning: { DEFAULT: v('orange-600'), deep: v('orange-700'), soft: v('orange-50') },
                danger: { DEFAULT: v('red-600'), deep: v('red-700'), soft: v('red-50') },
                // Surfaces: soft canvas, white cards (dark: black canvas, graphite cards).
                canvas: v('c-canvas'),
                surface: { DEFAULT: v('c-surface'), 2: v('c-surface-2') },
                // Text.
                ink: { DEFAULT: v('neutral-900'), soft: v('neutral-700'), muted: v('neutral-500') },
                brand: { blue: v('accent-600'), bluedeep: v('accent-700'), green: v('green-600'), greendeep: v('green-700'), orange: v('orange-600'), orangedeep: v('orange-700') },
            },
            borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },
        },
    },
    plugins: [],
}
