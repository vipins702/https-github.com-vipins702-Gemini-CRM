import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { IntegrationConfig } from '../types';
import {
  MessageCircle, Facebook, Instagram, Mail, Loader2, Save, Plug, ShieldCheck, Lock, ExternalLink,
} from 'lucide-react';

interface Props { onNavigate?: (view: string, params?: any) => void; }

type FieldDef = { key: string; label: string; secret?: boolean; type?: 'text' | 'number' | 'password'; placeholder?: string; help?: string };

const PROVIDER_META: Record<string, {
  label: string; icon: React.ElementType; color: string; bg: string; blurb: string; setupUrl?: string; fields: FieldDef[];
}> = {
  whatsapp: {
    label: 'WhatsApp Business', icon: MessageCircle, color: 'text-emerald-600', bg: 'bg-emerald-100',
    blurb: 'Meta WhatsApp Business Cloud API. Connect this tenant’s own number.',
    setupUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '1234567890', help: 'From Meta → WhatsApp → API Setup' },
      { key: 'token', label: 'Permanent Access Token', secret: true, type: 'password', placeholder: 'EAAG…' },
      { key: 'appSecret', label: 'App Secret', secret: true, type: 'password', help: 'From Meta → App settings → Basic. Required: inbound messages are rejected unless signed with it.' },
      { key: 'verifyToken', label: 'Webhook Verify Token', placeholder: 'flowcrm-wa-verify', help: 'Use this same value in the Meta webhook config' },
    ],
  },
  facebook: {
    label: 'Facebook Lead Ads', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-100',
    blurb: 'Capture leads from Facebook Lead Ad forms via the Graph API.',
    setupUrl: 'https://developers.facebook.com/docs/marketing-api/lead-ads/retrieving',
    fields: [
      { key: 'pageId', label: 'Page ID', placeholder: '1029384756' },
      { key: 'appId', label: 'App ID', placeholder: '987654321' },
      { key: 'appSecret', label: 'App Secret', secret: true, type: 'password' },
      { key: 'pageAccessToken', label: 'Page Access Token', secret: true, type: 'password' },
    ],
  },
  instagram: {
    label: 'Instagram DM', icon: Instagram, color: 'text-rose-600', bg: 'bg-rose-100',
    blurb: 'Instagram Messaging API for direct-message conversations.',
    setupUrl: 'https://developers.facebook.com/docs/messenger-platform/instagram',
    fields: [
      { key: 'igUserId', label: 'IG User ID', placeholder: '17841400000000000' },
      { key: 'appId', label: 'App ID', placeholder: '987654321' },
      { key: 'accessToken', label: 'Access Token', secret: true, type: 'password' },
      { key: 'appSecret', label: 'App Secret', secret: true, type: 'password' },
    ],
  },
  email: {
    label: 'Email (SMTP)', icon: Mail, color: 'text-violet-600', bg: 'bg-violet-100',
    blurb: 'Outbound email via this tenant’s own SMTP server.',
    setupUrl: 'https://nodemailer.com/smtp/',
    fields: [
      { key: 'smtpHost', label: 'SMTP Host', placeholder: 'smtp.example.com' },
      { key: 'smtpPort', label: 'Port', type: 'number', placeholder: '587' },
      { key: 'smtpUser', label: 'Username', placeholder: 'apikey' },
      { key: 'smtpPass', label: 'Password', secret: true, type: 'password' },
      { key: 'from', label: 'From Address', placeholder: 'CRM <noreply@example.com>' },
    ],
  },
};

const ORDER = ['whatsapp', 'facebook', 'instagram', 'email'];

const ProviderCard: React.FC<{ data: IntegrationConfig; onSaved: (c: IntegrationConfig) => void }> = ({ data, onSaved }) => {
  const { addToast } = useToast();
  const meta = PROVIDER_META[data.provider];
  const [form, setForm] = useState<Record<string, any>>({ ...data.config });
  const [enabled, setEnabled] = useState(data.enabled);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ingestKey, setIngestKey] = useState('');

  useEffect(() => {
    if (data.provider === 'facebook') api.getIngestKey().then(r => setIngestKey(r.key)).catch(() => {});
  }, [data.provider]);
  const webhookUrl = `${window.location.origin}/api/ingest/facebook?key=${ingestKey}`;

  const set = (k: string, v: any) => { setForm(p => ({ ...p, [k]: v })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      // Drop masked secret values so the server keeps the stored one.
      const payload: Record<string, any> = {};
      for (const f of meta.fields) {
        const v = form[f.key];
        if (f.secret && typeof v === 'string' && v.includes('••••')) continue;
        if (v !== undefined && v !== '') payload[f.key] = v;
      }
      const saved = await api.saveIntegration(data.provider, { config: payload, enabled });
      onSaved(saved);
      setForm({ ...saved.config });
      setDirty(false);
      addToast(`${meta.label} saved`, 'success');
    } catch (e: any) {
      addToast(e?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const Icon = meta.icon;
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${meta.bg} ${meta.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-ink flex items-center gap-2">
              {meta.label}
              {enabled
                ? <span className="status-pill status-green flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Live</span>
                : <span className="status-pill status-neutral">Disabled</span>}
            </h3>
            <p className="text-xs text-ink-muted mt-0.5 flex flex-wrap items-center gap-1.5">
              <span>{meta.blurb}</span>
              {meta.setupUrl && (
                <a
                  href={meta.setupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                >
                  Setup Guide <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <span className="mono-label text-[10px]">Enabled</span>
          <button
            type="button"
            onClick={() => { setEnabled(e => !e); setDirty(true); }}
            className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-[#4F46E5]' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
          </button>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {meta.fields.map(f => (
          <div key={f.key} className={f.help ? 'md:col-span-2' : ''}>
            <label className="mono-label text-[10px] flex items-center gap-1 mb-1">
              {f.secret && <Lock className="w-3 h-3 text-slate-400" />}{f.label}
              {f.secret && data.secretSet[f.key] && <span className="text-emerald-600 normal-case font-normal">· stored</span>}
            </label>
            <input
              type={f.type || 'text'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder={f.placeholder}
              value={form[f.key] ?? ''}
              onChange={e => set(f.key, e.target.value)}
            />
            {f.help && <p className="text-[11px] text-ink-muted mt-1">{f.help}</p>}
          </div>
        ))}
      </div>

      {data.provider === 'facebook' && (
        <div className="mt-6 p-4 rounded-xl border border-blue-200 bg-blue-50/50">
          <h4 className="font-heading font-bold text-blue-900 text-sm flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Easy Pipeline: Webhook URL
          </h4>
          <p className="text-xs text-blue-800 mb-3">
            Instead of providing developer app secrets, simply paste this unique Webhook URL into Facebook Lead Ads or Zapier. Leads will automatically stream into your CRM.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="flex-1 px-3 py-2 border border-blue-200 bg-white rounded-lg text-[13px] font-mono text-slate-600 outline-none"
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                addToast('Webhook URL copied!', 'success');
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <Button onClick={save} disabled={saving || !dirty} icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
          Save
        </Button>
      </div>
    </Card>
  );
};

export const Integrations: React.FC<Props> = () => {
  const [items, setItems] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setItems(await api.getIntegrations()); }
    catch (e: any) {
      setError(
        /cannot (get|post)|404|not found/i.test(e?.message || '')
          ? 'The Integrations API isn’t available. Restart the backend server (npm run dev:all) so the new routes load, then reload this page.'
          : (e?.message || 'Failed to load integrations.')
      );
    }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onSaved = (saved: IntegrationConfig) =>
    setItems(prev => prev.map(p => (p.provider === saved.provider ? saved : p)));

  const ordered = ORDER
    .map(p => items.find(i => i.provider === p))
    .filter(Boolean) as IntegrationConfig[];

  return (
    <div className="p-6 lg:p-8 font-sans animate-in fade-in duration-300 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <span className="tri-ring-sq w-9 h-9 flex items-center justify-center text-[#3730A3]"><Plug className="w-5 h-5" /></span>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink">Integrations</h1>
      </div>
      <p className="text-sm text-ink-muted mb-6 ml-12">
        Connect each channel with this workspace’s own credentials. Secrets are stored server-side and masked — never shown again after saving.
      </p>

      {loading ? (
        <div className="space-y-4">
          <Skeleton variant="card" className="h-48" />
          <Skeleton variant="card" className="h-48" />
        </div>
      ) : error ? (
        <Card>
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <Plug className="w-6 h-6" />
            </div>
            <p className="text-sm text-ink font-medium mb-1">Couldn’t load integrations</p>
            <p className="text-sm text-ink-muted max-w-md mx-auto">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {ordered.map(item => (
            <ProviderCard key={item.provider} data={item} onSaved={onSaved} />
          ))}
        </div>
      )}
    </div>
  );
};
