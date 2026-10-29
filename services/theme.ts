import { SystemSettings } from '../types';
import { setActiveCurrency } from './currency';

/**
 * Theme application layer.
 * Pushes per-tenant SystemSettings onto the live document:
 *  - theme       -> "dark" class on <html> (light / dark / follow the OS). A user's own
 *                   choice (top-bar toggle) is kept in localStorage and wins over the
 *                   tenant default; index.html applies it before first paint.
 *  - brandColor  -> data-brand on <html>; index.css maps the accent palette to it
 *  - fontSize    -> root font-size (scales all rem-based Tailwind text)
 *  - fontFamily  -> body font-family (inherited by the app)
 *  - animation   -> data-animation attribute (CSS in index.css respects it)
 *  - density     -> data-density attribute (hook for compact spacing)
 */

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'flowcrm_theme';
const THEME_EVENT = 'flowcrm-theme-change';

const BRANDS = new Set(['blue', 'indigo', 'purple', 'emerald', 'rose', 'orange']);

const FONT_FAMILIES: Record<string, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: "'Merriweather', Georgia, 'Times New Roman', serif",
  mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
};

const FONT_SIZES: Record<string, string> = {
  sm: '14px',
  md: '16px',
  lg: '18px',
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

  // Brand colour -> accent palette (index.css [data-brand])
  const brand = settings?.primaryColor && BRANDS.has(settings.primaryColor) ? settings.primaryColor : 'blue';
  root.setAttribute('data-brand', brand);

  // Font size -> root font-size (rem-based text scales)
  root.style.fontSize = FONT_SIZES[settings?.fontSize || 'md'] || FONT_SIZES.md;

  // Font family -> body (inline style beats the font-sans utility class)
  const family = FONT_FAMILIES[settings?.fontFamily || 'sans'] || FONT_FAMILIES.sans;
  if (document.body) document.body.style.fontFamily = family;
  root.style.setProperty('--font-family', family);

  // Density + animation -> data attributes (CSS hooks)
  root.setAttribute('data-density', settings?.density || 'comfortable');
  root.setAttribute('data-animation', settings?.animationIntensity || 'full');

  // Glassmorphism flag (optional hook for components)
  root.setAttribute('data-glass', settings?.glassmorphism ? 'on' : 'off');

  // Currency + locale -> drives currency formatting app-wide
  setActiveCurrency(settings?.defaultCurrency, settings?.locale);
}
