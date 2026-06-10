import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';
import { applySettings } from '../services/theme';
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

export const Settings: React.FC = () => {
   const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'notifications'>('appearance');
   const [settings, setSettings] = useState<SystemSettings | null>(null);
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
      applySettings(next); // live preview — apply instantly as the user changes options
   };

   const colors = [
      { id: 'indigo', label: 'Indigo', class: 'bg-indigo-600' },
      { id: 'blue', label: 'Blue', class: 'bg-blue-600' },
      { id: 'purple', label: 'Purple', class: 'bg-purple-600' },
      { id: 'emerald', label: 'Emerald', class: 'bg-emerald-600' },
      { id: 'rose', label: 'Rose', class: 'bg-rose-600' },
      { id: 'orange', label: 'Orange', class: 'bg-orange-600' },
   ];

   if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;
   if (!settings) return <div>Error loading settings</div>;

   return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
         {/* Header */}
         <div className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between shrink-0">
            <div>
               <h1 className="text-xl font-bold text-gray-900">System Preferences</h1>
               <p className="text-xs text-gray-500">Customize the look and feel of your CRM.</p>
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'general' ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-gray-200' : 'text-gray-500 hover:bg-gray-100'}`}
               >
                  <Building className="w-5 h-5" /> Organization
               </button>
               <button
                  onClick={() => setActiveTab('appearance')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'appearance' ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-gray-200' : 'text-gray-500 hover:bg-gray-100'}`}
               >
                  <Palette className="w-5 h-5" /> Appearance
               </button>
               <button
                  onClick={() => setActiveTab('notifications')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'notifications' ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-gray-200' : 'text-gray-500 hover:bg-gray-100'}`}
               >
                  <Bell className="w-5 h-5" /> Notifications
               </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 max-w-3xl space-y-6 overflow-y-auto pb-20">

               {activeTab === 'general' && (
                  <Card title="Organization Details" className="animate-in fade-in slide-in-from-bottom-2">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Default Currency</label>
                              <select
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                 value={settings.defaultCurrency || 'USD'}
                                 onChange={(e) => updateSetting('defaultCurrency', e.target.value)}
                              >
                                 {CURRENCIES.map((c) => (
                                    <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
                                 ))}
                              </select>
                           </div>
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Number / Currency Format</label>
                              <select
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                 value={settings.locale || ''}
                                 onChange={(e) => updateSetting('locale', e.target.value)}
                              >
                                 {LOCALES.map((l) => (
                                    <option key={l.id} value={l.id}>{l.label}</option>
                                 ))}
                              </select>
                           </div>
                        </div>
                        <div className="text-xs text-gray-500 -mt-2">
                           Preview: <span className="font-semibold text-gray-700">{formatCurrency(1234567.89, settings.defaultCurrency || 'USD', settings.locale || undefined)}</span>
                           <span className="ml-1">— applies to all currency fields across records, lists and dashboards.</span>
                        </div>
                     </div>
                  </Card>
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
                                 className={`p-4 rounded-xl border-2 flex flex-col items-center gap-3 transition-all ${settings.theme === mode ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
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
                                 className={`w-12 h-12 rounded-full ${color.class} flex items-center justify-center transition-transform ${settings.primaryColor === color.id ? 'ring-4 ring-offset-2 ring-gray-200 scale-110' : 'hover:scale-105'}`}
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
                                 <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.glassmorphism ? 'translate-x-6' : 'translate-x-1'}`} />
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
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${settings.primaryColor === 'indigo' ? 'bg-indigo-600' : settings.primaryColor === 'blue' ? 'bg-blue-600' : settings.primaryColor === 'purple' ? 'bg-purple-600' : settings.primaryColor === 'emerald' ? 'bg-emerald-600' : settings.primaryColor === 'rose' ? 'bg-rose-600' : 'bg-orange-600'}`}>
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
