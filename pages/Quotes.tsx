import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText, Plus, Trash2, ArrowLeft, Loader2, Send, Mail, Check, X, DollarSign, ArrowRight,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { Quote, QuoteLineItem, CRMRecord, ViewState, ProcessStage } from '../types';
import { CURRENCIES, formatCurrency, getCurrencySymbol } from '../services/currency';

interface Props { onNavigate?: (view: ViewState, params?: any) => void; }

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const blankItem = (): QuoteLineItem => ({ description: '', qty: 1, unitPrice: 0 });

export const Quotes: React.FC<Props> = () => {
  const { addToast } = useToast();
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<CRMRecord[]>([]);
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');

  // Quote lifecycle stages come from the configurable process (not hardcoded)
  const isWon = (statusName: string) => stages.find(s => s.name === statusName)?.type === 'won';

  const load = async () => {
    setLoading(true);
    try {
      const [q, c, proc] = await Promise.all([
        api.getQuotes(),
        api.getRecords('customer').catch(() => []),
        api.getProcess('quote').catch(() => null),
      ]);
      setQuotes(q);
      setCustomers(c);
      if (proc) setStages(proc.stages);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const newQuote = (): Quote => ({
    id: '', quoteNumber: '', title: '', customerId: '', customerName: '', customerEmail: '',
    status: 'Draft', currency: 'USD', items: [blankItem()], taxRate: 0,
    subtotal: 0, taxAmount: 0, total: 0, validUntil: '', notes: '',
  });

  const openNew = () => { setEditing(newQuote()); setView('edit'); };
  const openEdit = async (id: string) => {
    setBusy(id);
    try { setEditing(await api.getQuote(id)); setView('edit'); }
    finally { setBusy(''); }
  };

  const save = async (q: Quote) => {
    setSaving(true);
    try {
      await api.saveQuote(q);
      await load();
      setView('list');
    } finally { setSaving(false); }
  };

  const changeStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      // Generic status endpoint applies the quote process's gates + entry actions
      await api.setRecordStatus('quote', id, status);
      await load();
    } catch (e: any) {
      addToast(e?.message || 'Could not change stage', 'error');
    } finally { setBusy(''); }
  };

  const convert = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.convertQuote(id);
      await load();
      alert(r.alreadyConverted
        ? 'This quote was already converted.'
        : `Converted ✓\nCustomer: ${r.customerName}\nWon deal: ${formatCurrency(r.dealValue)} (in Pipeline)`);
    } finally { setBusy(''); }
  };

  if (view === 'edit' && editing) {
    return <QuoteBuilder
      initial={editing} customers={customers} saving={saving}
      onCancel={() => setView('list')} onSave={save}
    />;
  }

  return (
    <div className="p-6 lg:p-8 font-sans">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><FileText className="w-[18px] h-[18px] text-[#2563EB]" /></span></span>
            Quotes
          </h1>
          <p className="text-ink-muted text-sm mt-1">Build, send and track quotes — in any currency.</p>
        </div>
        <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={openNew}>New Quote</Button>
      </div>

      {loading ? (
        <div className="glass-showcase p-5"><div className="space-y-3"><Skeleton variant="text" /><Skeleton variant="text" /><Skeleton variant="text" /></div></div>
      ) : quotes.length === 0 ? (
        <div className="glass-showcase p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3"><FileText className="w-7 h-7 text-slate-300" /></div>
          <p className="font-heading font-bold text-lg text-ink">No quotes yet</p>
          <p className="text-ink-muted text-sm mt-1 mb-5">Create your first quote to send to a customer.</p>
          <Button icon={<Plus className="w-4 h-4" />} onClick={openNew}>New Quote</Button>
        </div>
      ) : (
        <div className="glass-showcase overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left mono-label">Quote #</th>
                  <th className="px-4 py-3 text-left mono-label">Customer</th>
                  <th className="px-4 py-3 text-left mono-label">Status</th>
                  <th className="px-4 py-3 text-right mono-label">Total</th>
                  <th className="px-4 py-3 text-right mono-label">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map(q => (
                  <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(q.id)} className="text-sm font-semibold text-ink hover:text-[#2563EB] transition-colors">
                        {q.quoteNumber}{busy === q.id && <Loader2 className="inline w-3 h-3 ml-1.5 animate-spin" />}
                      </button>
                      {q.title && <div className="text-xs text-ink-muted">{q.title}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{q.customerName || '—'}</td>
                    <td className="px-4 py-3"><Badge status={q.status} /></td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-[#047857] tnum">{formatCurrency(q.total, q.currency)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Stage transition — options come from the configurable quote process */}
                        <select
                          value={q.status}
                          onChange={e => changeStatus(q.id, e.target.value)}
                          disabled={busy === q.id}
                          className="!h-8 !text-xs !py-0 !w-32"
                          title="Move stage"
                        >
                          {(stages.length ? stages.map(s => s.name) : [q.status]).map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        {isWon(q.status) && (q.convertedDealId
                          ? <span className="status-pill status-green">Converted</span>
                          : <Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => convert(q.id)} disabled={busy === q.id}>Convert</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEdit(q.id)}>Edit</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Quote builder ────────────────────────────────────────────────────────────
interface ProductOpt { id: string; name: string; price: number; sku: string; }

const QuoteBuilder: React.FC<{
  initial: Quote; customers: CRMRecord[]; saving: boolean;
  onCancel: () => void; onSave: (q: Quote) => void;
}> = ({ initial, customers, saving, onCancel, onSave }) => {
  const [q, setQ] = useState<Quote>(initial);
  const [emailing, setEmailing] = useState(false);
  const [products, setProducts] = useState<ProductOpt[]>([]);

  // Load product catalogue for the line-item picker (records are flattened: fields top-level)
  useEffect(() => {
    api.getRecords('product').then((rows: any[]) => {
      setProducts(rows.map(r => ({ id: r.id, name: r.name || r.primary_display || 'Product', price: Number(r.price || 0), sku: r.sku || '' })));
    }).catch(() => setProducts([]));
  }, []);

  const set = (patch: Partial<Quote>) => setQ(prev => ({ ...prev, ...patch }));

  const setItem = (i: number, patch: Partial<QuoteLineItem>) =>
    setQ(prev => ({ ...prev, items: prev.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));

  const pickProduct = (i: number, productId: string) => {
    const p = products.find(x => x.id === productId);
    if (!p) { setItem(i, { productId: '', sku: '' }); return; }
    setItem(i, { productId: p.id, sku: p.sku, description: p.name, unitPrice: p.price });
  };
  const addItem = () => setQ(prev => ({ ...prev, items: [...prev.items, blankItem()] }));
  const removeItem = (i: number) => setQ(prev => ({ ...prev, items: prev.items.filter((_, idx) => idx !== i) }));

  // Live totals (mirror server math)
  const { subtotal, taxAmount, total } = useMemo(() => {
    const sub = round2(q.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0));
    const tax = round2(sub * (Number(q.taxRate) || 0) / 100);
    return { subtotal: sub, taxAmount: tax, total: round2(sub + tax) };
  }, [q.items, q.taxRate]);

  const pickCustomer = (id: string) => {
    const c = customers.find(x => x.id === id);
    let data: any = {};
    try { data = typeof (c as any)?.data === 'string' ? JSON.parse((c as any).data) : (c || {}); } catch { data = c || {}; }
    set({
      customerId: id,
      customerName: data.name || (c as any)?.primary_display || '',
      customerEmail: data.email || '',
    });
  };

  const sym = getCurrencySymbol(q.currency);
  const canSave = q.items.some(it => it.description.trim());

  const emailQuote = async () => {
    if (!q.id) return;
    setEmailing(true);
    try { await api.emailQuote(q.id); setQ(prev => ({ ...prev, status: prev.status === 'Draft' ? 'Sent' : prev.status })); }
    finally { setEmailing(false); }
  };

  return (
    <div className="p-6 lg:p-8 font-sans max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onCancel} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to quotes
        </button>
        <div className="flex items-center gap-2">
          {q.quoteNumber && <span className="status-pill status-blue">{q.quoteNumber}</span>}
          <Badge status={q.status} />
        </div>
      </div>

      <div className="glass-showcase p-6 space-y-5">
        <h1 className="font-heading text-xl font-extrabold text-ink">{q.id ? 'Edit quote' : 'New quote'}</h1>

        {/* Customer + meta */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mono-label block mb-1.5">Customer</label>
            <select value={q.customerId} onChange={e => pickCustomer(e.target.value)}>
              <option value="">— Select customer —</option>
              {customers.map(c => {
                let data: any = {};
                try { data = typeof (c as any)?.data === 'string' ? JSON.parse((c as any).data) : c; } catch { data = c; }
                return <option key={c.id} value={c.id}>{data.name || (c as any).primary_display || c.id}</option>;
              })}
            </select>
          </div>
          <div>
            <label className="mono-label block mb-1.5">Customer email</label>
            <input value={q.customerEmail} onChange={e => set({ customerEmail: e.target.value })} placeholder="customer@company.com" />
          </div>
          <div>
            <label className="mono-label block mb-1.5">Title / reference</label>
            <input value={q.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Website redesign" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mono-label block mb-1.5">Currency</label>
              <select value={q.currency} onChange={e => set({ currency: e.target.value })}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.symbol}</option>)}
              </select>
            </div>
            <div>
              <label className="mono-label block mb-1.5">Valid until</label>
              <input type="date" value={q.validUntil} onChange={e => set({ validUntil: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div>
          <label className="mono-label block mb-2">Line items</label>
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1">
              <span className="col-span-3 mono-label">Product</span>
              <span className="col-span-3 mono-label">Description</span>
              <span className="col-span-2 mono-label text-right">Qty</span>
              <span className="col-span-2 mono-label text-right">Unit ({sym})</span>
              <span className="col-span-2 mono-label text-right">Total</span>
            </div>
            {q.items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <select className="col-span-12 sm:col-span-3 !text-sm" value={it.productId || ''} onChange={e => pickProduct(i, e.target.value)}>
                  <option value="">Custom item…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
                </select>
                <input className="col-span-12 sm:col-span-3" value={it.description} onChange={e => setItem(i, { description: e.target.value })} placeholder="Item description" />
                <input className="col-span-4 sm:col-span-2 !text-right" type="number" min={0} value={it.qty} onChange={e => setItem(i, { qty: Number(e.target.value) })} />
                <input className="col-span-4 sm:col-span-2 !text-right" type="number" min={0} step="0.01" value={it.unitPrice} onChange={e => setItem(i, { unitPrice: Number(e.target.value) })} />
                <div className="col-span-3 sm:col-span-1 text-right text-sm font-semibold text-ink tnum">
                  {formatCurrency(round2((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), q.currency)}
                </div>
                <button className="col-span-1 text-slate-400 hover:text-red-500 transition-colors flex justify-center" onClick={() => removeItem(i)} disabled={q.items.length === 1}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:text-[#1E40AF] transition-colors">
            <Plus className="w-4 h-4" /> Add line
          </button>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full sm:w-72 space-y-1.5">
            <div className="flex justify-between text-sm text-ink-soft"><span>Subtotal</span><span className="tnum font-medium">{formatCurrency(subtotal, q.currency)}</span></div>
            <div className="flex justify-between text-sm text-ink-soft items-center">
              <span className="flex items-center gap-1.5">Tax
                <input type="number" min={0} step="0.1" value={q.taxRate} onChange={e => set({ taxRate: Number(e.target.value) })} className="!h-7 !w-16 !text-right !px-2" />%
              </span>
              <span className="tnum font-medium">{formatCurrency(taxAmount, q.currency)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200">
              <span className="font-heading font-extrabold text-ink">Total</span>
              <span className="font-heading font-extrabold text-[#047857] tnum text-lg">{formatCurrency(total, q.currency)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="mono-label block mb-1.5">Notes</label>
          <textarea value={q.notes} onChange={e => set({ notes: e.target.value })} rows={2} placeholder="Terms, payment details, thank-you note…" />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
          <div>
            {q.id && q.customerEmail && (
              <Button variant="secondary" icon={emailing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} onClick={emailQuote} disabled={emailing}>
                Email to customer
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              onClick={() => onSave({ ...q, subtotal, taxAmount, total })} disabled={saving || !canSave}>
              {q.id ? 'Save quote' : 'Create quote'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
