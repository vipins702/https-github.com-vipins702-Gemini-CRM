import { SystemSettings } from '../types';
import { setActiveCurrency } from './currency';

// ─── Workspace appearance engine ────────────────────────────────────────────────
// Everything a workspace can configure about how the app looks lives here:
// brand colour (preset or any custom hex), surface tone, sidebar style, fonts,
// text size, corner shape and density. Settings are saved per tenant (see
// SystemSettings) and applied live to <html> as attributes + CSS variables that
// index.css and tailwind.config.cjs read.

export interface FontOption {
  id: string;
  label: string;
  stack: string;
  /** Google Fonts family query (loaded on demand). Omitted for system fonts. */
  google?: string;
  kind: 'sans' | 'serif' | 'mono';
}

const SANS_FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';

export const FONT_CATALOG: FontOption[] = [
  { id: 'system', label: 'System (Apple / Segoe)', kind: 'sans', stack: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: 'inter', label: 'Inter', kind: 'sans', stack: `"Inter", ${SANS_FALLBACK}`, google: 'Inter:wght@400;500;600;700' },
  { id: 'dm-sans', label: 'DM Sans', kind: 'sans', stack: `"DM Sans", ${SANS_FALLBACK}`, google: 'DM+Sans:wght@400;500;600;700' },
  { id: 'manrope', label: 'Manrope', kind: 'sans', stack: `"Manrope", ${SANS_FALLBACK}`, google: 'Manrope:wght@400;500;600;700' },
  { id: 'jakarta', label: 'Plus Jakarta Sans', kind: 'sans', stack: `"Plus Jakarta Sans", ${SANS_FALLBACK}`, google: 'Plus+Jakarta+Sans:wght@400;500;600;700' },
  { id: 'poppins', label: 'Poppins', kind: 'sans', stack: `"Poppins", ${SANS_FALLBACK}`, google: 'Poppins:wght@400;500;600;700' },
  { id: 'plex', label: 'IBM Plex Sans', kind: 'sans', stack: `"IBM Plex Sans", ${SANS_FALLBACK}`, google: 'IBM+Plex+Sans:wght@400;500;600;700' },
  { id: 'source', label: 'Source Sans 3', kind: 'sans', stack: `"Source Sans 3", ${SANS_FALLBACK}`, google: 'Source+Sans+3:wght@400;500;600;700' },
  { id: 'playfair', label: 'Playfair Display', kind: 'serif', stack: `"Playfair Display", ${SERIF_FALLBACK}`, google: 'Playfair+Display:wght@500;600;700' },
  { id: 'cormorant', label: 'Cormorant Garamond', kind: 'serif', stack: `"Cormorant Garamond", ${SERIF_FALLBACK}`, google: 'Cormorant+Garamond:wght@500;600;700' },
  { id: 'lora', label: 'Lora', kind: 'serif', stack: `"Lora", ${SERIF_FALLBACK}`, google: 'Lora:wght@400;500;600;700' },
  { id: 'merriweather', label: 'Merriweather', kind: 'serif', stack: `"Merriweather", ${SERIF_FALLBACK}`, google: 'Merriweather:wght@400;700' },
  { id: 'georgia', label: 'Georgia', kind: 'serif', stack: SERIF_FALLBACK },
  { id: 'jetbrains', label: 'JetBrains Mono', kind: 'mono', stack: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace', google: 'JetBrains+Mono:wght@400;500;600;700' },
];

const fontById = (id?: string) => FONT_CATALOG.find(f => f.id === id);

// Settings saved before fonts were configurable used sans / serif / mono.
const LEGACY_FONT: Record<string, string> = { sans: 'system', serif: 'georgia', mono: 'jetbrains' };

const loadedFonts = new Set<string>();
function loadFont(font: FontOption | undefined) {
  if (!font?.google || loadedFonts.has(font.id) || typeof document === 'undefined') return;
  loadedFonts.add(font.id);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.id = `gf-${font.id}`;
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.appendChild(link);
}

// ─── Brand colours ─────────────────────────────────────────────────────────────
export interface BrandOption { id: string; label: string; swatch: string }

export const BRAND_OPTIONS: BrandOption[] = [
  { id: 'gold', label: 'Champagne Gold', swatch: 'linear-gradient(140deg, rgb(212 175 84), rgb(146 105 28))' },
  { id: 'onyx', label: 'Onyx', swatch: 'linear-gradient(140deg, rgb(64 60 54), rgb(14 13 11))' },
  { id: 'sapphire', label: 'Sapphire', swatch: 'linear-gradient(140deg, rgb(46 94 190), rgb(22 55 126))' },
  { id: 'burgundy', label: 'Burgundy', swatch: 'linear-gradient(140deg, rgb(170 44 76), rgb(112 22 47))' },
  { id: 'emerald', label: 'Emerald', swatch: 'linear-gradient(140deg, rgb(22 134 90), rgb(10 88 60))' },
  { id: 'blue', label: 'Classic Blue', swatch: 'linear-gradient(140deg, rgb(10 132 255), rgb(0 91 184))' },
  { id: 'indigo', label: 'Indigo', swatch: 'linear-gradient(140deg, rgb(94 92 230), rgb(60 58 166))' },
  { id: 'purple', label: 'Amethyst', swatch: 'linear-gradient(140deg, rgb(175 82 222), rgb(123 47 163))' },
  { id: 'rose', label: 'Rose', swatch: 'linear-gradient(140deg, rgb(255 45 85), rgb(173 16 50))' },
  { id: 'orange', label: 'Amber', swatch: 'linear-gradient(140deg, rgb(255 149 0), rgb(163 85 0))' },
];
const BRANDS = new Set([...BRAND_OPTIONS.map(b => b.id), 'custom']);

type RGB = [number, number, number];
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

export function isHex(v: unknown): v is string { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function luminance([r, g, b]: RGB) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a: RGB, b: RGB) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const fmt = (c: RGB) => c.join(' ');

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Build the 11-step accent scale (and text colour for filled buttons) from one brand hex. */
export function buildAccentScale(hex: string, dark: boolean): { scale: Record<number, string>; onAccent: string; sidebar500: string; sidebar700: string } {
  const [h, s0] = rgbToHsl(hexToRgb(hex));
  const s = clamp(s0, 0.25, 0.92);
  const hsl = (l: number, sat = s) => hslToRgb(h, clamp(sat, 0, 1), clamp(l, 0.03, 0.98));
  const WHITE: RGB = [255, 255, 255], INK: RGB = [24, 20, 8];

  // Filled buttons put white (light) or dark ink on shade 600; keep it readable.
  let l600 = clamp(rgbToHsl(hexToRgb(hex))[2], 0.3, 0.66);
  if (!dark) { while (l600 > 0.2 && contrast(hsl(l600), WHITE) < 4.5) l600 -= 0.02; }
  const L: Record<number, number> = dark
    ? { 50: 0.14, 100: 0.18, 200: 0.24, 300: 0.32, 400: 0.62, 500: 0.58, 600: Math.max(l600, 0.55), 700: 0.74, 800: 0.82, 900: 0.89, 950: 0.94 }
    : { 50: 0.97, 100: 0.93, 200: 0.86, 300: 0.76, 400: 0.64, 500: l600 + 0.09, 600: l600, 700: l600 - 0.07, 800: l600 - 0.14, 900: l600 - 0.2, 950: l600 - 0.28 };

  const scale: Record<number, string> = {};
  for (const sh of SHADES) scale[sh] = fmt(hsl(L[sh], sh <= 200 ? s * 0.85 : s));
  const base = hsl(L[600]);
  const onAccent = fmt(contrast(base, WHITE) >= contrast(base, INK) ? WHITE : INK);
  return { scale, onAccent, sidebar500: fmt(hsl(0.62)), sidebar700: fmt(hsl(0.76)) };
}

// ─── Presets ───────────────────────────────────────────────────────────────────
export type NeutralTone = 'warm' | 'cool' | 'neutral';
export type SidebarStyle = 'dark' | 'light';
export type CornerShape = 'sharp' | 'soft' | 'round';

export interface AppearanceValues {
  primaryColor: string;
  customColor?: string;
  neutralTone: NeutralTone;
  sidebarStyle: SidebarStyle;
  radius: CornerShape;
  fontBody: string;
  fontHeading: string; // 'same' = follow the body font
}

export interface ThemePreset { id: string; label: string; blurb: string; values: AppearanceValues; preview: { bg: string; side: string; accent: string } }

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'maison', label: 'Maison', blurb: 'Ivory, obsidian and champagne gold', preview: { bg: '#F7F4EE', side: '#14120F', accent: '#B88F30' },
    values: { primaryColor: 'gold', neutralTone: 'warm', sidebarStyle: 'dark', radius: 'soft', fontBody: 'system', fontHeading: 'same' } },
  { id: 'classic', label: 'Classic', blurb: 'Clean light blue, the original look', preview: { bg: '#F5F5F7', side: '#FFFFFF', accent: '#0A84FF' },
    values: { primaryColor: 'blue', neutralTone: 'neutral', sidebarStyle: 'light', radius: 'soft', fontBody: 'system', fontHeading: 'same' } },
  { id: 'midnight', label: 'Midnight', blurb: 'Cool slate with a sapphire accent', preview: { bg: '#F4F6FA', side: '#0F1626', accent: '#2E5EBE' },
    values: { primaryColor: 'sapphire', neutralTone: 'cool', sidebarStyle: 'dark', radius: 'soft', fontBody: 'inter', fontHeading: 'same' } },
  { id: 'estate', label: 'Emerald Estate', blurb: 'Deep green on warm stone', preview: { bg: '#F7F4EE', side: '#0E1A15', accent: '#16865A' },
    values: { primaryColor: 'emerald', neutralTone: 'warm', sidebarStyle: 'dark', radius: 'soft', fontBody: 'system', fontHeading: 'same' } },
  { id: 'rouge', label: 'Rouge', blurb: 'Burgundy with rounded corners', preview: { bg: '#F7F4EE', side: '#FFFFFF', accent: '#8A1C3A' },
    values: { primaryColor: 'burgundy', neutralTone: 'warm', sidebarStyle: 'light', radius: 'round', fontBody: 'dm-sans', fontHeading: 'same' } },
  { id: 'mono', label: 'Monochrome', blurb: 'Black and white, sharp and precise', preview: { bg: '#F5F5F7', side: '#FFFFFF', accent: '#1E1C19' },
    values: { primaryColor: 'onyx', neutralTone: 'neutral', sidebarStyle: 'light', radius: 'sharp', fontBody: 'plex', fontHeading: 'same' } },
];

export const DEFAULT_APPEARANCE = THEME_PRESETS[0].values;

// ─── Applying ──────────────────────────────────────────────────────────────────
let customHex: string | null = null;

const ACCENT_VARS = SHADES.map(s => `--accent-${s}`);
const SIDEBAR_VARS = ['--sb-500', '--sb-700', '--on-accent'];

/** Re-derives the custom accent scale (called on settings change and on light/dark switch). */
export function applyCustomAccent(dark: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!customHex) {
    [...ACCENT_VARS, ...SIDEBAR_VARS].forEach(v => root.style.removeProperty(v));
    return;
  }
  const { scale, onAccent, sidebar500, sidebar700 } = buildAccentScale(customHex, dark);
  for (const sh of SHADES) root.style.setProperty(`--accent-${sh}`, scale[sh]);
  root.style.setProperty('--on-accent', onAccent);
  root.style.setProperty('--sb-500', sidebar500);
  root.style.setProperty('--sb-700', sidebar700);
}

export function applyAppearance(s: Partial<AppearanceValues> | null | undefined) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const d = DEFAULT_APPEARANCE;

  // Brand colour: preset id, or a custom hex.
  const wantsCustom = s?.primaryColor === 'custom' && isHex(s?.customColor);
  customHex = wantsCustom ? (s!.customColor as string) : null;
  const brand = wantsCustom ? 'custom' : (s?.primaryColor && BRANDS.has(s.primaryColor) ? s.primaryColor : d.primaryColor);
  root.setAttribute('data-brand', brand);

  root.setAttribute('data-tone', s?.neutralTone || d.neutralTone);
  root.setAttribute('data-sidebar', s?.sidebarStyle || d.sidebarStyle);
  root.setAttribute('data-radius', s?.radius || d.radius);

  // Fonts: body, and a separate heading font ('same' follows body).
  const body = fontById(s?.fontBody) || fontById('system')!;
  const heading = s?.fontHeading && s.fontHeading !== 'same' ? (fontById(s.fontHeading) || body) : body;
  loadFont(body); loadFont(heading);
  root.style.setProperty('--font-family', body.stack);
  root.style.setProperty('--font-heading', heading.stack);
  if (document.body) document.body.style.fontFamily = body.stack;

  applyCustomAccent(root.classList.contains('dark'));
}

/** Map settings saved by older versions onto the current fields. */
export function legacyFontBody(fontFamily?: string): string | undefined {
  return fontFamily ? LEGACY_FONT[fontFamily] : undefined;
}


/**
 * Theme application layer.
 * Pushes per-tenant SystemSettings onto the live document:
 *  - theme       -> "dark" class on <html> (light / dark / follow the OS). A user's own
 *                   choice (top-bar toggle) is kept in localStorage and wins over the
 *                   tenant default; index.html applies it before first paint.
 *  - appearance  -> brand colour / tone / sidebar / corners / fonts, see the engine above
 *  - fontSize    -> root font-size (scales all rem-based Tailwind text)
 *  - animation   -> data-animation attribute (CSS in index.css respects it)
 *  - density     -> data-density attribute (hook for compact spacing)
 */

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'flowcrm_theme';
const THEME_EVENT = 'flowcrm-theme-change';

// Root size that rem-based text scales from. "sm" stays at 15px so the smallest
// labels (12px at default) never drop below ~11px.
const FONT_SIZES: Record<string, string> = {
  sm: '15px',
  md: '16px',
  lg: '17px',
};

let tenantTheme: ThemeMode = 'light';

const isMode = (m: unknown): m is ThemeMode => m === 'light' || m === 'dark' || m === 'system';
const prefersDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function readPersonalTheme(): ThemeMode | null {
  try {
    const m = localStorage.getItem(THEME_KEY);
    return isMode(m) ? m : null;
  } catch {
    return null;
  }
}

/** The theme in effect: the user's own choice, else the workspace default. */
export function getThemeMode(): ThemeMode {
  return readPersonalTheme() || tenantTheme;
}

/** True when the page is currently rendered dark. */
export function isDarkActive(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function applyThemeMode(mode: ThemeMode): void {
  const dark = mode === 'dark' || (mode === 'system' && prefersDark());
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.setAttribute('data-theme', mode);
  applyCustomAccent(dark);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { mode, dark } }));
}

/** Set (and remember) this user's own light/dark choice. */
export function setPersonalTheme(mode: ThemeMode): void {
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* private mode: apply for this session only */ }
  applyThemeMode(mode);
}

/** Subscribe to theme changes (returns an unsubscribe function). */
export function onThemeChange(cb: (state: { mode: ThemeMode; dark: boolean }) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(THEME_EVENT, handler);
  return () => window.removeEventListener(THEME_EVENT, handler);
}

// Follow the OS when the theme is "system".
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getThemeMode() === 'system') applyThemeMode('system');
  });
}

export function applySettings(settings: Partial<SystemSettings> | null | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Light / dark / system
  if (isMode(settings?.theme)) tenantTheme = settings!.theme as ThemeMode;
  applyThemeMode(getThemeMode());

  // Brand colour, tone, sidebar, corners and fonts (all workspace-configurable)
  applyAppearance({
    ...settings,
    fontBody: settings?.fontBody || legacyFontBody(settings?.fontFamily),
  } as Partial<AppearanceValues>);

  // Font size -> root font-size (rem-based text scales)
  root.style.fontSize = FONT_SIZES[settings?.fontSize || 'md'] || FONT_SIZES.md;

  // Density + animation -> data attributes (CSS hooks)
  root.setAttribute('data-density', settings?.density || 'comfortable');
  root.setAttribute('data-animation', settings?.animationIntensity || 'full');

  // Glassmorphism flag (optional hook for components)
  root.setAttribute('data-glass', settings?.glassmorphism ? 'on' : 'off');

  // Currency + locale -> drives currency formatting app-wide
  setActiveCurrency(settings?.defaultCurrency, settings?.locale);
}
