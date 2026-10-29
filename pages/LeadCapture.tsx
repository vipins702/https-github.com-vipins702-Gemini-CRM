import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { CRMRecord } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { Webhook, Copy, Check, Send, Loader2, Sparkles, RefreshCw, Inbox, Globe } from 'lucide-react';

export const LeadCapture: React.FC = () => {
  const { addToast } = useToast();
  const [source, setSource] = useState('website-form');
  const [dedupe, setDedupe] = useState(true);
  const [useAI, setUseAI] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [test, setTest] = useState({ name: '', email: '', phone: '', company: '' });
  const [sending, setSending] = useState(false);
  const [captured, setCaptured] = useState<CRMRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingestKey, setIngestKey] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  const safeSource = encodeURIComponent(source.trim() || 'website-form');
  const params = [`key=${ingestKey || 'YOUR_INGEST_KEY'}`, !dedupe ? 'dedupe=0' : '', useAI ? 'ai=1' : ''].filter(Boolean).join('&');
  const url = `${window.location.origin}/api/ingest/${safeSource}${params ? `?${params}` : ''}`;
  const curl = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Jane Doe","email":"jane@acme.com","phone":"555-1234","company":"Acme Inc"}'`;

  const loadCaptured = async () => {
    try {
      const leads = await api.getRecords('lead');
      setCaptured(leads.filter((l: any) => l._via === 'ingest').sort((a: any, b: any) =>
        new Date(b._captured_at || b.created_at || 0).getTime() - new Date(a._captured_at || a.created_at || 0).getTime()
      ));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      try { setAiAvailable((await api.getAIStatus()).enabled); } catch { /* ignore */ }
      try { setIngestKey((await api.getIngestKey()).key); } catch { /* non-admins can't see the key */ }
      await loadCaptured();
      setLoading(false);
    })();
  }, []);

  const copyUrl = () => {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const rotateKey = async () => {
    if (!confirm('Generate a new key? Every form or webhook using the current URL will stop working until you update it.')) return;
    setRotating(true);
    try {
      setIngestKey((await api.rotateIngestKey()).key);
      addToast('New ingest key generated — update your forms and webhooks', 'success');
    } catch (e: any) {
      addToast(e.message || 'Could not rotate key', 'error');
    } finally {
      setRotating(false);
    }
  };

  const sendTest = async () => {
    if (!test.name && !test.email) { addToast('Enter at least a name or email', 'error'); return; }
    setSending(true);
    try {
      const res = await api.ingestLead(source.trim() || 'website-form', test, { dedupe, ai: useAI });
      if (res.deduped) addToast('Duplicate — skipped by dedupe', 'info');
      else addToast(`Lead captured: ${res.primaryDisplay}${res.aiUsed ? ' (AI-normalized)' : ''}`, 'success');
      setTest({ name: '', email: '', phone: '', company: '' });
      await loadCaptured();
    } catch (e: any) {
      addToast(e.message || 'Capture failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/30"><Inbox className="w-6 h-6 text-white" /></div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Lead Capture</h1>
          <p className="text-sm text-slate-500">Capture leads from web forms & webhooks into your Leads table — with dedupe and optional AI cleanup.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config + endpoint */}
        <Card title="Capture Endpoint">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Source name</label>
              <input className={inputCls} value={source} onChange={(e) => setSource(e.target.value)} placeholder="website-form" />
              <p className="text-xs text-slate-400 mt-1">A label to identify where leads came from (used in the URL).</p>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} /> Dedupe by email
              </label>
              <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${aiAvailable ? 'text-slate-700' : 'text-slate-300 cursor-not-allowed'}`}>
                <input type="checkbox" disabled={!aiAvailable} checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
                <Sparkles className="w-3.5 h-3.5" /> AI normalize {!aiAvailable && '(add Gemini key)'}
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5"><Webhook className="w-3.5 h-3.5" /> POST URL</label>
              <div className="flex gap-2">
                <input readOnly value={url} className={`${inputCls} font-mono text-xs bg-slate-50`} />
                <Button variant="secondary" size="sm" icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} onClick={copyUrl}>{copied ? 'Copied' : 'Copy'}</Button>
              </div>
              <p className="text-xs text-amber-600 mt-1.5">For external systems, replace the origin with your deployed backend URL.</p>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                {ingestKey
                  ? <>The <code>key</code> routes leads to this workspace — keep it secret.
                      <button type="button" className="text-indigo-600 hover:underline font-semibold disabled:opacity-50" onClick={rotateKey} disabled={rotating}>{rotating ? 'Generating…' : 'Generate new key'}</button></>
                  : <>Ask an admin for this workspace's ingest key.</>}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Example (cURL)</label>
              <pre className="bg-[#1d1d1f] text-[#f5f5f7] text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{curl}</pre>
              <p className="text-xs text-slate-400 mt-1.5">Accepts common aliases (name/first_name, email, phone/mobile, company/org, website, location…). Extra fields are kept on the lead.</p>
            </div>
          </div>
        </Card>

        {/* Test capture */}
        <Card title="Send a Test Lead">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="Name" value={test.name} onChange={(e) => setTest({ ...test, name: e.target.value })} />
              <input className={inputCls} placeholder="Email" value={test.email} onChange={(e) => setTest({ ...test, email: e.target.value })} />
              <input className={inputCls} placeholder="Phone" value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} />
              <input className={inputCls} placeholder="Company" value={test.company} onChange={(e) => setTest({ ...test, company: e.target.value })} />
            </div>
            <Button className="w-full justify-center" icon={sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} onClick={sendTest} disabled={sending}>
              {sending ? 'Capturing…' : 'Capture Lead'}
            </Button>
            <p className="text-xs text-slate-400 flex items-center gap-1.5"><Globe className="w-3 h-3" /> Posts to the endpoint above as you, so the lead lands in this workspace.</p>
          </div>
        </Card>
      </div>

      {/* Captured leads */}
      <Card title={`Recently Captured (${captured.length})`} action={<Button size="sm" variant="ghost" icon={<RefreshCw className="w-4 h-4" />} onClick={loadCaptured}>Refresh</Button>}>
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        ) : captured.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No captured leads yet. Send a test lead above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Name</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Email</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Company</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {captured.slice(0, 25).map((l: any) => (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{l.name || [l.firstName, l.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.email || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.company || '—'}</td>
                    <td className="px-4 py-2.5"><Badge status={l._capture_source || 'capture'} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
