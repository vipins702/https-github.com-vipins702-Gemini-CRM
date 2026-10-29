import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';
import { applySettings, setPersonalTheme, getThemeMode, onThemeChange, ThemeMode } from '../services/theme';
import { SystemSettings } from '../types';
import { CURRENCIES, formatCurrency } from '../services/currency';
import {
   Settings as SettingsIcon, Palette, Building, Bell, Moon, Sun,
   Monitor, Type, Layout, Save, Loader2, Check
} from 'lucide-react';

const LOCALES = [
   { id: '', label: 'Auto (browser default)' },
   { id: 'en-US', label: 'English (US) — 1,234.56' },
   { id: 'en-GB', label: 'English (UK) — 1,234.56' },
   { id: 'en-IN', label: 'English (India) — 1,23,456.78' },
   { id: 'de-DE', label: 'German — 1.234,56' },
   { id: 'fr-FR', label: 'French — 1 234,56' },
   { id: 'ja-JP', label: 'Japanese — 1,234' },
   { id: 'ar-AE', label: 'Arabic (UAE)' },
];

const TIMEZONES = [
   'UTC',
   'America/New_York',
   'America/Chicago',
   'America/Denver',
   'America/Los_Angeles',
   'Europe/London',
   'Europe/Paris',
   'Europe/Berlin',
   'Asia/Dubai',
   'Asia/Kolkata',
   'Asia/Bangkok',
   'Asia/Singapore',
   'Asia/Tokyo',
   'Australia/Sydney',
   'Australia/Melbourne',
];

export const Settings: React.FC = () => {
   const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'notifications'>('appearance');
   const [settings, setSettings] = useState<SystemSettings | null>(null);
   // Theme actually in use (a top-bar toggle can differ from the saved workspace default).
   const [activeTheme, setActiveTheme] = useState<ThemeMode>(getThemeMode);
   useEffect(() => onThemeChange(({ mode }) => setActiveTheme(mode)), []);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      const loadSettings = async () => {
         setLoading(true);
         const data = await api.getSettings();
         setSettings(data);
         setLoading(false);
      };
      loadSettings();
   }, []);

   const handleSave = async () => {
      if (!settings) return;
      setSaving(true);
      await api.saveSettings(settings);
      applySettings(settings); // apply persisted theme immediately
      setSaving(false);
   };

   const updateSetting = (key: keyof SystemSettings, value: any) => {
      if (!settings) return;
      const next = { ...settings, [key]: value };
      setSettings(next);
      if (key === 'theme') setPersonalTheme(value); // your own choice wins over any earlier top-bar toggle
      applySettings(next); // live preview — apply instantly as the user changes options
   };

   // Swatches use the fixed palette tokens (bg-blue-* / bg-indigo-* follow the current brand).
   const colors = [
      { id: 'blue', label: 'Blue', swatch: 'rgb(var(--blue-600))' },
      { id: 'indigo', label: 'Indigo', swatch: 'rgb(var(--indigo-600))' },
      { id: 'purple', label: 'Purple', swatch: 'rgb(var(--purple-600))' },
      { id: 'emerald', label: 'Green', swatch: 'rgb(var(--green-600))' },
      { id: 'rose', label: 'Pink', swatch: 'rgb(var(--pink-600))' },
      { id: 'orange', label: 'Orange', swatch: 'rgb(var(--orange-600))' },
   ];

   if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;
   if (!settings) return <div>Error loading settings</div>;

   return (
      <div className="h-screen flex flex-col overflow-hidden">
         {/* Header */}
         <div className="h-16 bg-surface border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
            <div>
               <h1 className="font-heading text-xl font-extrabold tracking-tight text-ink">System Preferences</h1>
               <p className="text-xs text-ink-muted">Customize the look and feel of your CRM.</p>
            </div>
            <Button
               onClick={handleSave}
               disabled={saving}
               icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            >
               {saving ? 'Saving...' : 'Save Changes'}
            </Button>
         </div>

         <div className="flex-1 overflow-hidden p-8 flex gap-8">
            {/* Sidebar */}
            <div className="w-64 space-y-2">
               <button
                  onClick={() => setActiveTab('general')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'general' ? 'bg-surface shadow-sm text-indigo-600 ring-1 ring-gray-200' : 'text-gray-500 hover:bg-gray-100'}`}
               >
                  <Building className="w-5 h-5" /> Organization
               </button>
               <button
                  onClick={() => setActiveTab('appearance')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'appearance' ? 'bg-surface shadow-sm text-indigo-600 ring-1 ring-gray-200' : 'text-gray-500 hover:bg-gray-100'}`}
               >
                  <Palette className="w-5 h-5" /> Appearance
               </button>
               <button
                  onClick={() => setActiveTab('notifications')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'notifications' ? 'bg-surface shadow-sm text-indigo-600 ring-1 ring-gray-200' : 'text-gray-500 hover:bg-gray-100'}`}
               >
                  <Bell className="w-5 h-5" /> Notifications
               </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 max-w-3xl space-y-6 overflow-y-auto pb-20">

               {activeTab === 'general' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                     <Card title="Organization Profile">
                        <div className="space-y-6">
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                              <input
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                 value={settings.organizationName}
                                 onChange={(e) => updateSetting('organizationName', e.target.value)}
                              />
                           </div>
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Company Logo URL</label>
                              <div className="flex gap-4">
                                 {settings.logoUrl && <img src={settings.logoUrl} alt="Logo" className="w-10 h-10 rounded object-contain border" />}
                                 <input
                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={settings.logoUrl || ''}
                                    onChange={(e) => updateSetting('logoUrl', e.target.value)}
                                    placeholder="https://..."
                                 />
                              </div>
                           </div>
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                              <input
                                 type="url"
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                 value={settings.websiteUrl || ''}
                                 onChange={(e) => updateSetting('websiteUrl', e.target.value)}
                                 placeholder="https://example.com"
                              />
                           </div>
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                              <input
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                 value={settings.industry || ''}
                                 onChange={(e) => updateSetting('industry', e.target.value)}
                                 placeholder="e.g. Financial Services, Retail, Healthcare"
                              />
                           </div>
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID / Registration Number</label>
                              <input
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                 value={settings.taxId || ''}
                                 onChange={(e) => updateSetting('taxId', e.target.value)}
                                 placeholder="e.g. GST ID, Tax ID"
                              />
                           </div>
                        </div>
                     </Card>

                     <Card title="Location & Hours">
                        <div className="space-y-6">
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                              <input
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                 value={settings.address || ''}
                                 onChange={(e) => updateSetting('address', e.target.value)}
                                 placeholder="123 Main St"
                              />
                           </div>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                                 <input
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={settings.city || ''}
                                    onChange={(e) => updateSetting('city', e.target.value)}
                                    placeholder="New York"
                                 />
                              </div>
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">State / Province</label>
                                 <input
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={settings.state || ''}
                                    onChange={(e) => updateSetting('state', e.target.value)}
                                    placeholder="NY"
                                 />
                              </div>
                           </div>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Zip / Postal Code</label>
                                 <input
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={settings.zipCode || ''}
                                    onChange={(e) => updateSetting('zipCode', e.target.value)}
                                    placeholder="10001"
                                 />
                              </div>
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                                 <input
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={settings.country || ''}
                                    onChange={(e) => updateSetting('country', e.target.value)}
                                    placeholder="United States"
                                 />
                              </div>
                           </div>
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                              <select
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-surface"
                                 value={settings.timezone || 'UTC'}
                                 onChange={(e) => updateSetting('timezone', e.target.value)}
                              >
                                 {TIMEZONES.map((tz) => (
                                    <option key={tz} value={tz}>{tz}</option>
                                 ))}
                              </select>
                           </div>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Business Hours Start</label>
                                 <input
                                    type="time"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={settings.businessHoursStart || '09:00'}
                                    onChange={(e) => updateSetting('businessHoursStart', e.target.value)}
                                 />
                              </div>
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Business Hours End</label>
                                 <input
                                    type="time"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={settings.businessHoursEnd || '18:00'}
                                    onChange={(e) => updateSetting('businessHoursEnd', e.target.value)}
                                 />
                              </div>
                           </div>
                        </div>
                     </Card>

                     <Card title="Communication">
                        <div className="space-y-6">
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Email Footer / Signature</label>
                              <textarea
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                 value={settings.emailFooter || ''}
                                 onChange={(e) => updateSetting('emailFooter', e.target.value)}
                                 placeholder="Added to all outgoing emails and communications"
                                 rows={4}
                              />
                              <p className="text-xs text-gray-500 mt-1">Applied to all outbound emails, campaigns, and notifications.</p>
                           </div>
                        </div>
                     </Card>

                     <Card title="Regional Settings">
                        <div className="space-y-6">
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Default Currency</label>
                                 <select
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-surface"
                                    value={settings.defaultCurrency || 'USD'}
                                    onChange={(e) => updateSetting('defaultCurrency', e.target.value)}
                                 >
                                    {CURRENCIES.map((c) => (
                                       <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
                                    ))}
                                 </select>
                              </div>
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Number / Date Format</label>
                                 <select
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-surface"
                                    value={settings.locale || ''}
                                    onChange={(e) => updateSetting('locale', e.target.value)}
                                 >
                                    {LOCALES.map((l) => (
                                       <option key={l.id} value={l.id}>{l.label}</option>
                                    ))}
                                 </select>
                              </div>
                           </div>
                           <div className="text-xs text-gray-500">
                              Preview: <span className="font-semibold text-gray-700">{formatCurrency(1234567.89, settings.defaultCurrency || 'USD', settings.locale || undefined)}</span>
                              <span className="ml-1">— applies to all currency fields across records, lists and dashboards.</span>
                           </div>
                        </div>
                     </Card>
                  </div>
               )}

               {activeTab === 'appearance' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">

                     {/* Theme Mode */}
                     <Card title="Interface Theme">
                        <div className="grid grid-cols-3 gap-4">
                           {['light', 'dark', 'system'].map((mode) => (
                              <button
                                 key={mode}
                                 onClick={() => updateSetting('theme', mode)}
                                 className={`p-4 rounded-xl border-2 flex flex-col items-center gap-3 transition-all ${activeTheme === mode ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
                                 aria-pressed={activeTheme === mode}
                              >
                                 {mode === 'light' && <Sun className="w-6 h-6" />}
                                 {mode === 'dark' && <Moon className="w-6 h-6" />}
                                 {mode === 'system' && <Monitor className="w-6 h-6" />}
                                 <span className="capitalize font-medium text-sm">{mode} Mode</span>
                              </button>
                           ))}
                        </div>
                     </Card>

                     {/* Accent Color */}
                     <Card title="Brand Color">
                        <div className="flex gap-4">
                           {colors.map((color) => (
                              <button
                                 key={color.id}
                                 onClick={() => updateSetting('primaryColor', color.id)}
                                 aria-label={`${color.label} brand colour`}
                                 aria-pressed={settings.primaryColor === color.id}
                                 style={{ backgroundColor: color.swatch }}
                                 className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform ${settings.primaryColor === color.id ? 'ring-4 ring-offset-2 ring-offset-surface ring-gray-200 scale-110' : 'hover:scale-105'}`}
                              >
                                 {settings.primaryColor === color.id && <Check className="w-6 h-6 text-white" />}
                              </button>
                           ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-4">This color will be used for buttons, links, and active states.</p>
                     </Card>

                     {/* Density & Typography */}
                     <Card title="Layout & Typography">
                        <div className="space-y-6">
                           <div>
                              <label className="text-sm font-medium text-gray-700 mb-3 block flex items-center gap-2">
                                 <Layout className="w-4 h-4" /> Density
                              </label>
                              <div className="flex gap-4">
                                 <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                       type="radio"
                                       name="density"
                                       checked={settings.density === 'comfortable'}
                                       onChange={() => updateSetting('density', 'comfortable')}
                                       className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm">Comfortable</span>
                                 </label>
                                 <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                       type="radio"
                                       name="density"
                                       checked={settings.density === 'compact'}
                                       onChange={() => updateSetting('density', 'compact')}
                                       className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm">Compact</span>
                                 </label>
                              </div>
                           </div>

                           <div>
                              <label className="text-sm font-medium text-gray-700 mb-3 block flex items-center gap-2">
                                 <Type className="w-4 h-4" /> Font Family
                              </label>
                              <select
                                 className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                 value={settings.fontFamily}
                                 onChange={(e) => updateSetting('fontFamily', e.target.value)}
                              >
                                 <option value="sans">Sans Serif (Inter/Helvetica)</option>
                                 <option value="serif">Serif (Merriweather)</option>
                                 <option value="mono">Monospace (JetBrains Mono)</option>
                              </select>
                           </div>

                           <div>
                              <label className="text-sm font-medium text-gray-700 mb-3 block flex items-center gap-2">
                                 <Type className="w-4 h-4" /> Font Size
                              </label>
                              <div className="grid grid-cols-3 gap-3 max-w-md">
                                 {([
                                    { id: 'sm', label: 'Compact', sample: 'text-xs' },
                                    { id: 'md', label: 'Default', sample: 'text-sm' },
                                    { id: 'lg', label: 'Large', sample: 'text-base' },
                                 ] as const).map((opt) => (
                                    <button
                                       key={opt.id}
                                       onClick={() => updateSetting('fontSize', opt.id)}
                                       className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${(settings.fontSize || 'md') === opt.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                    >
                                       <span className={`font-bold ${opt.sample}`}>Aa</span>
                                       <span className="text-xs font-medium">{opt.label}</span>
                                    </button>
                                 ))}
                              </div>
                              <p className="text-xs text-gray-500 mt-2">Scales text across the entire application.</p>
                           </div>
                        </div>
                     </Card>

                     {/* 2025 Effects */}
                     <Card title="2025 Effects">
                        <div className="space-y-6">
                           {/* Glassmorphism Toggle */}
                           <div className="flex items-center justify-between">
                              <div>
                                 <label className="text-sm font-medium text-gray-700 block">Glassmorphism</label>
                                 <p className="text-xs text-gray-500 mt-0.5">Enable glass-like transparent effects</p>
                              </div>
                              <button
                                 onClick={() => updateSetting('glassmorphism', !settings.glassmorphism)}
                                 className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.glassmorphism ? 'bg-indigo-600' : 'bg-gray-200'}`}
                              >
                                 <span className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${settings.glassmorphism ? 'translate-x-6' : 'translate-x-1'}`} />
                              </button>
                           </div>

                           {/* Animation Intensity */}
                           <div>
                              <label className="text-sm font-medium text-gray-700 mb-3 block">Animation Intensity</label>
                              <div className="grid grid-cols-3 gap-3">
                                 {(['none', 'subtle', 'full'] as const).map((level) => (
                                    <button
                                       key={level}
                                       onClick={() => updateSetting('animationIntensity', level)}
                                       className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${settings.animationIntensity === level
                                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                          : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                    >
                                       {level === 'none' && '🚫 None'}
                                       {level === 'subtle' && '✨ Subtle'}
                                       {level === 'full' && '🎉 Full Motion'}
                                    </button>
                                 ))}
                              </div>
                              <p className="text-xs text-gray-500 mt-2">Control how much motion and animation you see</p>
                           </div>
                        </div>
                     </Card>

                     {/* Preview */}
                     <Card title="Live Preview">
                        <div className={`p-6 rounded-xl ${settings.glassmorphism ? 'glass gradient-mesh' : 'bg-gray-100'}`}>
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white bg-accent">
                                 <Check className="w-6 h-6" />
                              </div>
                              <div>
                                 <div className="font-bold text-gray-900">Sample Card</div>
                                 <div className="text-sm text-gray-500">This is how your UI will look</div>
                              </div>
                           </div>
                        </div>
                     </Card>
                  </div>
               )}

               {activeTab === 'notifications' && (
                  <Card title="Notification Preferences" className="animate-in fade-in slide-in-from-bottom-2">
                     <div className="text-center py-10 text-gray-400">
                        <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Notification settings are coming soon.</p>
                     </div>
                  </Card>
               )}
            </div>
         </div>
      </div>
   );
};
