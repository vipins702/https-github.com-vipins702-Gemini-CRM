import React, { useEffect, useMemo, useState } from 'react';
import {
  Megaphone, Plus, Send, Users, Mail, MessageSquare, ArrowLeft,
  Loader2, Trash2, RefreshCw, Share2, Eye, FileText as FormIcon,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { FormBuilder } from '../components/FormBuilder';
import { api } from '../services/api';
import { BulkCampaign, CampaignFilter, EntityDefinition } from '../types';
import { PREDEFINED_TEMPLATES } from '../services/webFormTemplates';

const blank = (): BulkCampaign => ({
  id: '', name: '', channel: 'email', entityType: 'lead', filters: [],
  subject: '', body: '', status: 'Draft', audienceCount: 0, sentCount: 0, failedCount: 0, openedCount: 0, submissionCount: 0,
});

export const Campaigns: React.FC = () => {
  const { addToast } = useToast();
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [items, setItems] = useState<BulkCampaign[]>([]);
  const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BulkCampaign | null>(null);
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [list, sch] = await Promise.all([api.getBulkCampaigns(), api.getSchemas().catch(() => ({}))]);
      setItems(list); setSchemas(sch as any);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const send = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.sendBulkCampaign(id);
      addToast(`Sent to ${r.sentCount} · ${r.failedCount} failed`, r.failedCount ? 'warning' : 'success');
      await load();
    } catch (e: any) { addToast(e?.message || 'Send failed', 'error'); }
    finally { setBusy(''); }
  };

  if (view === 'edit' && editing) {
    return <Builder initial={editing} schemas={schemas} onCancel={() => setView('list')}
      onSaved={() => { setView('list'); load(); }} />;
  }

  return (
    <div className="p-6 lg:p-8 font-sans">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><Megaphone className="w-[18px] h-[18px] text-[#2563EB]" /></span></span>
            Campaigns
          </h1>
          <p className="text-ink-muted text-sm mt-1">Bulk outreach to a segment via Email or WhatsApp, with open tracking.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={load}>Refresh</Button>
          <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(blank()); setView('edit'); }}>New Campaign</Button>
        </div>
      </div>

      {loading ? (
        <div className="glass-showcase p-5"><div className="space-y-3"><Skeleton variant="text" /><Skeleton variant="text" /></div></div>
      ) : items.length === 0 ? (
        <div className="glass-showcase p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3"><Megaphone className="w-7 h-7 text-slate-300" /></div>
          <p className="font-heading font-bold text-lg text-ink">No campaigns yet</p>
          <p className="text-ink-muted text-sm mt-1 mb-5">Create one to reach a segment of leads or customers.</p>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(blank()); setView('edit'); }}>New Campaign</Button>
        </div>
      ) : (
        <div className="glass-showcase overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left mono-label">Campaign</th>
                <th className="px-4 py-3 text-left mono-label">Channel</th>
                <th className="px-4 py-3 text-left mono-label">Status</th>
                <th className="px-4 py-3 text-right mono-label">Audience</th>
                <th className="px-4 py-3 text-right mono-label">Sent</th>
                <th className="px-4 py-3 text-right mono-label">Opened</th>
                <th className="px-4 py-3 text-right mono-label">Submissions</th>
                <th className="px-4 py-3 text-right mono-label">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => { setEditing(c); setView('edit'); }} className="text-sm font-semibold text-ink hover:text-[#2563EB]">{c.name}</button>
                    <div className="text-xs text-ink-muted">{c.entityType}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="status-pill status-blue inline-flex items-center gap-1">
                      {c.channel === 'whatsapp' ? <MessageSquare className="w-3 h-3" /> : c.channel === 'web_form' ? <FormIcon className="w-3 h-3" /> : <Mail className="w-3 h-3" />}{c.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3"><Badge status={c.status} /></td>
                  <td className="px-4 py-3 text-right text-sm tnum">{c.audienceCount || '—'}</td>
                  <td className="px-4 py-3 text-right text-sm tnum">{c.sentCount || '—'}{c.failedCount ? <span className="text-red-500"> /{c.failedCount}✗</span> : ''}</td>
                  <td className="px-4 py-3 text-right text-sm tnum text-[#047857]">{c.channel === 'web_form' ? '—' : (c.openedCount || '—')}</td>
                  <td className="px-4 py-3 text-right text-sm tnum text-[#2563EB]">{c.channel === 'web_form' ? (c.submissionCount || 0) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {c.status !== 'Sent' && <Button size="sm" icon={busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} onClick={() => send(c.id)} disabled={busy === c.id}>Send</Button>}
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setView('edit'); }}>Edit</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Builder ──────────────────────────────────────────────────────────────────
const Builder: React.FC<{
  initial: BulkCampaign; schemas: Record<string, EntityDefinition>;
  onCancel: () => void; onSaved: () => void;
}> = ({ initial, schemas, onCancel, onSaved }) => {
  const { addToast } = useToast();
  const [c, setC] = useState<BulkCampaign>(initial);
  const [preview, setPreview] = useState<{ count: number; sample: { name: string; contact: string }[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publicLink, setPublicLink] = useState('');

  const set = (patch: Partial<BulkCampaign>) => { setC(prev => ({ ...prev, ...patch })); setPreview(null); };
  const fields = useMemo(() => schemas[c.entityType]?.fields || [], [schemas, c.entityType]);

  const setFilter = (i: number, patch: Partial<CampaignFilter>) =>
    setC(prev => ({ ...prev, filters: prev.filters.map((f, idx) => idx === i ? { ...f, ...patch } : f) }));
  const addFilter = () => setC(prev => ({ ...prev, filters: [...prev.filters, { field: '', op: 'eq', value: '' }] }));
  const removeFilter = (i: number) => setC(prev => ({ ...prev, filters: prev.filters.filter((_, idx) => idx !== i) }));

  const doPreview = async () => {
    setPreviewing(true);
    try { setPreview(await api.previewCampaignAudience(c)); }
    finally { setPreviewing(false); }
  };

  const save = async (thenSend = false) => {
    if (!c.name.trim()) { addToast('Name is required', 'error'); return; }
    if (c.channel !== 'web_form' && !c.body?.trim()) { addToast('Message is required', 'error'); return; }
    if (c.channel === 'web_form' && !c.formTemplate?.fields?.length) { addToast('Add at least one field to the form', 'error'); return; }

    setSaving(true);
    try {
      const saved = await api.saveBulkCampaign(c);
      if (c.channel === 'web_form') {
        const link = `${window.location.origin}/form/campaign/${saved.id}`;
        setPublicLink(link);
        addToast('Web form created! Share the link below.', 'success');
      } else if (thenSend) {
        const r = await api.sendBulkCampaign(saved.id);
        addToast(`Sent to ${r.sentCount} · ${r.failedCount} failed`, r.failedCount ? 'warning' : 'success');
        onSaved();
      } else {
        addToast('Campaign saved', 'success');
        onSaved();
      }
    } catch (e: any) { addToast(e?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-6 lg:p-8 font-sans max-w-3xl mx-auto">
      <button onClick={onCancel} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink mb-4"><ArrowLeft className="w-4 h-4" /> Back to campaigns</button>

      <div className="glass-showcase p-6 space-y-5">
        <h1 className="font-heading text-xl font-extrabold text-ink">{c.id ? 'Edit campaign' : 'New campaign'}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mono-label block mb-1.5">Name</label>
            <input value={c.name} onChange={e => set({ name: e.target.value })} placeholder="June promo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mono-label block mb-1.5">Channel</label>
              <select value={c.channel} onChange={e => set({ channel: e.target.value as any })}>
                <option value="email">📧 Email</option>
                <option value="whatsapp">💬 WhatsApp</option>
                <option value="web_form">📋 Web Form (Capture Data)</option>
              </select>
            </div>
            <div>
              <label className="mono-label block mb-1.5">Audience</label>
              <select value={c.entityType} onChange={e => set({ entityType: e.target.value, filters: [] })}>
                <option value="lead">Leads</option>
                <option value="customer">Customers</option>
              </select>
            </div>
          </div>
        </div>

        {/* Segment filters */}
        <div>
          <label className="mono-label block mb-2">Segment filters {c.filters.length === 0 && <span className="text-ink-muted normal-case tracking-normal">(none = whole audience)</span>}</label>
          <div className="space-y-2">
            {c.filters.map((f, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <select className="col-span-5 !text-sm" value={f.field} onChange={e => setFilter(i, { field: e.target.value })}>
                  <option value="">- field -</option>
                  {fields.map(fd => <option key={fd.name} value={fd.name}>{fd.label}</option>)}
                </select>
                <select className="col-span-3 !text-sm" value={f.op} onChange={e => setFilter(i, { op: e.target.value as any })}>
                  <option value="eq">is</option>
                  <option value="neq">is not</option>
                  <option value="contains">contains</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                </select>
                <input className="col-span-3 !text-sm" value={f.value} onChange={e => setFilter(i, { value: e.target.value })} placeholder="value" />
                <button className="col-span-1 text-slate-400 hover:text-red-500 flex justify-center" onClick={() => removeFilter(i)}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <button onClick={addFilter} className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:text-[#1E40AF]"><Plus className="w-4 h-4" /> Add filter</button>
        </div>

        {/* Web Form Builder */}
        {c.channel === 'web_form' ? (
          <div>
            <FormBuilder
              template={c.formTemplate || { id: '', title: 'Lead Capture', fields: [], successMessage: 'Thank you!' }}
              onChange={(template) => set({ formTemplate: template })}
              entityFields={fields.map(f => f.name)}
            />
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                ℹ️ Web forms create a public link. When users fill it out, their data goes directly to your database.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Message */}
            {c.channel === 'email' && (
              <div>
                <label className="mono-label block mb-1.5">Subject</label>
                <input value={c.subject} onChange={e => set({ subject: e.target.value })} placeholder="A special offer for you, {firstName}" />
              </div>
            )}
            <div>
              <label className="mono-label block mb-1.5">Message <span className="text-ink-muted normal-case tracking-normal">— use {'{firstName}'}, {'{company}'}, {'{name}'}</span></label>
              <textarea value={c.body} onChange={e => set({ body: e.target.value })} rows={5} placeholder={c.channel === 'whatsapp' ? 'Hi {firstName}, ...' : 'Hi {firstName},\n\n...'} />
            </div>

            {/* Audience preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Button size="sm" variant="secondary" icon={previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} onClick={doPreview} disabled={previewing}>Preview audience</Button>
              {preview && (
                <div className="text-sm text-ink-soft">
                  <span className="font-bold text-ink">{preview.count}</span> recipients
                  {preview.sample.length > 0 && <span className="text-ink-muted"> · e.g. {preview.sample.map(s => s.name).filter(Boolean).slice(0, 3).join(', ')}</span>}
                </div>
              )}
            </div>
          </>
        )}

        {publicLink && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm font-medium text-green-900 mb-2">✅ Form link ready to share:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={publicLink}
                readOnly
                className="flex-1 px-3 py-2 bg-white border border-green-300 rounded-lg text-sm"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(publicLink);
                  addToast('Link copied!', 'success');
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          {c.channel === 'web_form' ? (
            <>
              <Button variant="secondary" onClick={() => save(false)} disabled={saving}>Save draft</Button>
              <Button
                icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                onClick={() => save(false)}
                disabled={saving}
              >
                {publicLink ? 'Update & Refresh' : 'Save &amp; Get Link'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => save(false)} disabled={saving}>Save draft</Button>
              <Button icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} onClick={() => save(true)} disabled={saving}>Save &amp; Send</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
