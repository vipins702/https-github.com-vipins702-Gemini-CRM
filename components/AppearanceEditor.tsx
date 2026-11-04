import React from 'react';
import { Check, Moon, Sun, Monitor, RotateCcw } from 'lucide-react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { SystemSettings } from '../types';
import {
  BRAND_OPTIONS, FONT_CATALOG, THEME_PRESETS, DEFAULT_APPEARANCE, ThemeMode, isHex,
} from '../services/theme';

interface Props {
  settings: SystemSettings;
  activeTheme: ThemeMode;
  /** Change one or more settings at once; applied live. */
  patch: (changes: Partial<SystemSettings>) => void;
}

const choice = (on: boolean) =>
  `p-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${on ? 'border-accent bg-accent/10 text-ink' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`;

const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <div className="mb-2">
    <div className="text-sm font-medium text-gray-800">{children}</div>
    {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
  </div>
);

export const AppearanceEditor: React.FC<Props> = ({ settings, activeTheme, patch }) => {
  const brand = BRAND_OPTIONS.some(b => b.id === settings.primaryColor) || settings.primaryColor === 'custom'
    ? settings.primaryColor : DEFAULT_APPEARANCE.primaryColor;
  const tone = settings.neutralTone || DEFAULT_APPEARANCE.neutralTone;
  const sidebar = settings.sidebarStyle || DEFAULT_APPEARANCE.sidebarStyle;
  const radius = settings.radius || DEFAULT_APPEARANCE.radius;
  const body = settings.fontBody || 'system';
  const heading = settings.fontHeading || 'same';
  const customHex = isHex(settings.customColor) ? settings.customColor! : '#B88F30';

  const applyPreset = (id: string) => {
    const p = THEME_PRESETS.find(x => x.id === id);
    if (p) patch({ ...p.values, customColor: settings.customColor, themePreset: id });
  };
  const reset = () => patch({ ...DEFAULT_APPEARANCE, themePreset: 'maison', fontSize: 'md', density: 'comfortable' });
  // Any manual tweak means it no longer matches a named preset.
  const tweak = (changes: Partial<SystemSettings>) => patch({ ...changes, themePreset: 'custom' });

  const fontGroups: Array<[string, typeof FONT_CATALOG]> = [
    ['Sans serif', FONT_CATALOG.filter(f => f.kind === 'sans')],
    ['Serif', FONT_CATALOG.filter(f => f.kind === 'serif')],
    ['Monospace', FONT_CATALOG.filter(f => f.kind === 'mono')],
  ];
  const fontSelect = (value: string, onChange: (v: string) => void, withSame = false) => (
    <select
      className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40 bg-surface"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {withSame && <option value="same">Same as body text</option>}
      {fontGroups.map(([label, fonts]) => (
        <optgroup key={label} label={label}>
          {fonts.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </optgroup>
      ))}
    </select>
  );

  return (
    <>
      {/* Presets */}
      <Card title="Theme presets">
        <div className="flex items-start justify-between gap-4 mb-4">
          <p className="text-sm text-gray-500">
            One click sets colours, surfaces, sidebar, corners and fonts for your whole workspace. Fine-tune anything below.
          </p>
          <button onClick={reset} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-ink">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {THEME_PRESETS.map(p => {
            const on = settings.themePreset === p.id;
            return (
              <button key={p.id} onClick={() => applyPreset(p.id)} aria-pressed={on}
                className={`text-left rounded-xl border-2 overflow-hidden transition-all ${on ? 'border-accent ring-2 ring-accent/20' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="h-16 flex" style={{ background: p.preview.bg }}>
                  <div className="w-1/4" style={{ background: p.preview.side }} />
                  <div className="flex-1 p-2 flex flex-col gap-1.5 justify-center">
                    <div className="h-2 rounded-full w-2/3" style={{ background: p.preview.accent }} />
                    <div className="h-2 rounded-full w-1/2 bg-black/10" />
                  </div>
                </div>
                <div className="px-3 py-2 bg-surface">
                  <div className="text-sm font-semibold text-ink flex items-center gap-1.5">{p.label}{on && <Check className="w-3.5 h-3.5 text-accent" />}</div>
                  <div className="text-xs text-gray-500">{p.blurb}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Mode */}
      <Card title="Interface theme">
        <div className="grid grid-cols-3 gap-3">
          {(['light', 'dark', 'system'] as const).map(mode => (
            <button key={mode} onClick={() => patch({ theme: mode })} aria-pressed={activeTheme === mode}
              className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${activeTheme === mode ? 'border-accent bg-accent/10 text-ink' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {mode === 'light' && <Sun className="w-5 h-5" />}
              {mode === 'dark' && <Moon className="w-5 h-5" />}
              {mode === 'system' && <Monitor className="w-5 h-5" />}
              <span className="capitalize font-medium text-sm">{mode}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Colours */}
      <Card title="Colours">
        <div className="space-y-6">
          <div>
            <Label hint="Buttons, links, charts highlights and the active menu item.">Brand colour</Label>
            <div className="flex flex-wrap gap-3 items-center">
              {BRAND_OPTIONS.map(c => (
                <button key={c.id} onClick={() => tweak({ primaryColor: c.id })} title={c.label} aria-label={`${c.label} brand colour`} aria-pressed={brand === c.id}
                  style={{ background: c.swatch }}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-transform shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] ${brand === c.id ? 'ring-4 ring-offset-2 ring-offset-surface ring-gray-300 scale-110' : 'hover:scale-105'}`}>
                  {brand === c.id && <Check className="w-5 h-5 text-white" />}
                </button>
              ))}
              {/* Any colour: the full shade scale is generated from it */}
              <label title="Pick any colour" aria-label="Custom brand colour"
                className={`relative w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-transform ${brand === 'custom' ? 'ring-4 ring-offset-2 ring-offset-surface ring-gray-300 scale-110' : 'hover:scale-105'}`}
                style={{ background: brand === 'custom' ? customHex : 'conic-gradient(#f43f5e, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)' }}>
                {brand === 'custom' && <Check className="w-5 h-5 text-white drop-shadow" />}
                <input type="color" value={customHex}
                  onChange={e => tweak({ primaryColor: 'custom', customColor: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
              {brand === 'custom' && <span className="text-xs font-mono text-gray-500 uppercase">{customHex}</span>}
            </div>
          </div>

          <div>
            <Label hint="The tone of page backgrounds, cards, borders and text.">Surface tone</Label>
            <div className="grid grid-cols-3 gap-3 max-w-xl">
              {([
                { id: 'warm', label: 'Warm', sub: 'Ivory & stone', bg: '#F7F4EE' },
                { id: 'cool', label: 'Cool', sub: 'Slate', bg: '#F4F6FA' },
                { id: 'neutral', label: 'Neutral', sub: 'Pure grey', bg: '#F5F5F7' },
              ] as const).map(t => (
                <button key={t.id} onClick={() => tweak({ neutralTone: t.id })} aria-pressed={tone === t.id} className={choice(tone === t.id)}>
                  <span className="block w-full h-6 rounded-md border border-black/10 mb-2" style={{ background: t.bg }} />
                  {t.label}<span className="block text-xs font-normal text-gray-500">{t.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label hint="Dark gives a premium contrast; light keeps the menu on the page colour.">Sidebar</Label>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {(['dark', 'light'] as const).map(s => (
                <button key={s} onClick={() => tweak({ sidebarStyle: s })} aria-pressed={sidebar === s} className={choice(sidebar === s)}>
                  <span className={`block w-full h-6 rounded-md border border-black/10 mb-2 ${s === 'dark' ? 'bg-[#14120F]' : 'bg-white'}`} />
                  <span className="capitalize">{s}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Typography */}
      <Card title="Typography">
        <div className="space-y-6">
          <div>
            <Label hint="Used for body text, tables and forms.">Body font</Label>
            {fontSelect(body, v => tweak({ fontBody: v }))}
          </div>
          <div>
            <Label hint="Used for page titles and large numbers.">Heading font</Label>
            {fontSelect(heading, v => tweak({ fontHeading: v }), true)}
          </div>
          <div>
            <Label hint="Scales text across the whole application.">Text size</Label>
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {([
                { id: 'sm', label: 'Compact', sample: 'text-xs' },
                { id: 'md', label: 'Default', sample: 'text-sm' },
                { id: 'lg', label: 'Large', sample: 'text-base' },
              ] as const).map(o => (
                <button key={o.id} onClick={() => patch({ fontSize: o.id })} aria-pressed={(settings.fontSize || 'md') === o.id}
                  className={`${choice((settings.fontSize || 'md') === o.id)} flex flex-col items-center gap-1`}>
                  <span className={`font-bold ${o.sample}`}>Aa</span>
                  <span className="text-xs font-medium">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4 bg-surface-2">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Preview</div>
            <div className="font-heading text-xl font-semibold text-ink">Quarterly pipeline review</div>
            <p className="text-sm text-gray-600 mt-1">Forty-two opportunities worth $1,284,500 moved forward this week. Revenue is up 12.4%.</p>
            <div className="flex items-center gap-2 mt-3">
              <button className="btn-primary-brand px-3.5 py-1.5 text-sm font-medium rounded-lg">Primary action</button>
              <Badge status="Qualified" /><Badge status="Won" /><Badge status="New" />
            </div>
          </div>
        </div>
      </Card>

      {/* Shape & density */}
      <Card title="Shape & density">
        <div className="space-y-6">
          <div>
            <Label hint="How rounded cards, buttons and inputs are.">Corners</Label>
            <div className="grid grid-cols-3 gap-3 max-w-xl">
              {([
                { id: 'sharp', label: 'Sharp', r: 'rounded-sm' },
                { id: 'soft', label: 'Soft', r: 'rounded-lg' },
                { id: 'round', label: 'Round', r: 'rounded-2xl' },
              ] as const).map(r => (
                <button key={r.id} onClick={() => tweak({ radius: r.id })} aria-pressed={radius === r.id} className={choice(radius === r.id)}>
                  <span className={`block w-full h-8 border-2 border-gray-400 mb-2 ${r.r}`} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label hint="Compact fits more rows on screen.">Density</Label>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {(['comfortable', 'compact'] as const).map(d => (
                <button key={d} onClick={() => patch({ density: d })} aria-pressed={settings.density === d} className={choice(settings.density === d)}>
                  <span className="capitalize">{d}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </>
  );
};
