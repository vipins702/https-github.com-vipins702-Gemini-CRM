import { SystemSettings } from '../types';
import { setActiveCurrency } from './currency';

/**
 * Theme application layer.
 * Pushes per-tenant SystemSettings onto the live document so the UI actually
 * reflects the chosen brand color, font, size, density and animation level.
 *
 * What is applied today (verified to work app-wide):
 *  - brandColor  -> CSS vars --brand-500/600/700 (drive primary buttons + focus rings)
 *  - fontSize    -> root font-size (scales all rem-based Tailwind text)
 *  - fontFamily  -> body font-family (inherited by the app)
 *  - animation   -> data-animation attribute (CSS in index.css respects it)
 *  - density     -> data-density attribute (hook for compact spacing)
 *
 * NOT applied yet (needs a component-level dark-mode pass): full dark theme.
 */

const BRAND_PALETTES: Record<string, { c500: string; c600: string; c700: string }> = {
  indigo: { c500: '#6366f1', c600: '#4f46e5', c700: '#4338ca' },
  blue: { c500: '#3b82f6', c600: '#2563eb', c700: '#1d4ed8' },
  purple: { c500: '#a855f7', c600: '#9333ea', c700: '#7e22ce' },
  emerald: { c500: '#10b981', c600: '#059669', c700: '#047857' },
  rose: { c500: '#f43f5e', c600: '#e11d48', c700: '#be123c' },
  orange: { c500: '#f97316', c600: '#ea580c', c700: '#c2410c' },
};

const FONT_FAMILIES: Record<string, string> = {
  sans: "'Figtree', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif: "'Merriweather', Georgia, 'Times New Roman', serif",
  mono: "'Spline Sans Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
};

const FONT_SIZES: Record<string, string> = {
  sm: '14px',
  md: '16px',
  lg: '18px',
};

export function applySettings(settings: Partial<SystemSettings> | null | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Brand color -> CSS variables (used by .btn-primary-brand and focus rings)
  const palette = BRAND_PALETTES[settings?.primaryColor || 'indigo'] || BRAND_PALETTES.indigo;
  root.style.setProperty('--brand-500', palette.c500);
  root.style.setProperty('--brand-600', palette.c600);
  root.style.setProperty('--brand-700', palette.c700);

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
