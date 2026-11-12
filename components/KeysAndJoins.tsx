import React, { useEffect, useState } from 'react';
import { KeyRound, Link2, ArrowRight, ArrowLeft, AlertTriangle, Loader2, Lock } from 'lucide-react';
import { api } from '../services/api';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

// Object Manager → Keys & joins. For every object: the automatic primary key, the record key people recognise a
// record by (unique), the joins it makes to other objects and the joins that point at it, with live counts.
// A change on an object that already holds records is never applied silently: the server sends back the numbers
// and this screen asks first.

interface KeyInfo {
  id: string; label: string; pluralLabel?: string; records: number;
  keyField: string | null;
  keyStats: { records: number; blank: number; duplicates: number } | null;
  eligible: { name: string; label: string; type: string }[];
  joins: { field: string; label: string; target: string | null; targetLabel: string | null; targetMissing: boolean; linked: number; broken: number }[];
  joinedFrom: { entity: string; entityLabel: string; field: string; label: string; linked: number }[];
}

type Pending =
  | { kind: 'key'; entity: string; keyField: string | null; message: string }
  | { kind: 'join'; entity: string; field: string; target: string; message: string };

const sel = 'h-9 rounded-lg border border-gray-200 bg-surface px-2.5 text-sm text-gray-900 min-w-0';
const Pill: React.FC<{ tone: 'ok' | 'warn' | 'bad' | 'quiet'; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
    tone === 'ok' ? 'bg-green-100 text-green-700' : tone === 'warn' ? 'bg-amber-100 text-amber-800' : tone === 'bad' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{children}</span>
);

export const KeysAndJoins: React.FC = () => {
  const { addToast } = useToast();
  const [list, setList] = useState<KeyInfo[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.getKeys().then(setList).catch(e => { addToast(e.message, 'error'); setList([]); });
  useEffect(() => { load(); }, []);

  const send = async (p: Pending, extra: Record<string, any> = {}) => {
    setBusy(true);
    try {
      const path = p.kind === 'key' ? `keys/${encodeURIComponent(p.entity)}` : `joins/${encodeURIComponent(p.entity)}/${encodeURIComponent(p.field)}`;
      const body = p.kind === 'key' ? { keyField: p.keyField, ...extra } : { target: p.target, ...extra };
      const r = await api.changeKeyOrJoin(path, body);
      if (r.status === 409 && r.data?.needsConfirm) { setPending({ ...p, message: r.data.message }); return; }
      if (!r.ok) { addToast(r.data?.details?.[0] || r.data?.error || 'Could not save', 'error'); setPending(null); return; }
      addToast(p.kind === 'key' ? (p.keyField ? 'Record key set' : 'Record key removed') : `Join re-pointed${r.data?.cleared ? `, ${r.data.cleared} link(s) cleared` : ''}`, 'success');
      setPending(null);
      load();
    } finally { setBusy(false); }
  };

  if (list === null) return <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-surface p-4 text-sm text-gray-600 grid gap-2 md:grid-cols-3">
        <p><b className="text-gray-900">Primary key.</b> Every record has an automatic id. It never changes, and it is what a join stores.</p>
        <p><b className="text-gray-900">Record key.</b> The field people recognise a record by, such as e-mail or a number. It is kept unique.</p>
        <p><b className="text-gray-900">Joins.</b> A Lookup field links a record to a record of another object. Broken means the link points at nothing.</p>
      </div>

      {list.map(o => (
        <Card key={o.id} noPadding>
          <div className="px-5 py-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100">
            <h3 className="font-heading text-[17px] font-semibold text-gray-900">{o.label}</h3>
            <code className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{o.id}</code>
            <span className="ml-auto text-sm text-gray-500 tabular">{o.records.toLocaleString()} record{o.records === 1 ? '' : 's'}</span>
          </div>

          <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
            {/* Keys */}
            <div className="p-5 space-y-4">
              <p className="eyebrow flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" aria-hidden="true" />Keys</p>
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-gray-500">Primary key</span>
                <code className="text-sm text-gray-900">id</code>
                <Pill tone="quiet"><Lock className="w-3 h-3" aria-hidden="true" />automatic</Pill>
              </div>
              <div className="flex items-start gap-3">
                <label htmlFor={`key-${o.id}`} className="w-24 shrink-0 text-sm text-gray-500 pt-2">Record key</label>
                <div className="flex-1 min-w-0 space-y-2">
                  <select id={`key-${o.id}`} className={`${sel} w-full`} value={o.keyField || ''} disabled={busy}
                    onChange={e => send({ kind: 'key', entity: o.id, keyField: e.target.value || null, message: '' })}>
                    <option value="">None</option>
                    {o.eligible.map(f => <option key={f.name} value={f.name}>{f.label} ({f.type})</option>)}
                  </select>
                  {o.keyField && o.keyStats && (
                    <div className="flex flex-wrap gap-1.5">
                      <Pill tone="ok">unique from now on</Pill>
                      {o.keyStats.blank > 0 && <Pill tone="warn">{o.keyStats.blank} record{o.keyStats.blank === 1 ? '' : 's'} blank</Pill>}
                      {o.keyStats.duplicates > 0 && <Pill tone="bad">{o.keyStats.duplicates} duplicate{o.keyStats.duplicates === 1 ? '' : 's'}</Pill>}
                      {o.keyStats.blank === 0 && o.keyStats.duplicates === 0 && o.records > 0 && <Pill tone="ok">all {o.records} records clean</Pill>}
                    </div>
                  )}
                  {!o.keyField && <p className="text-xs text-gray-400">No record key: two records may hold the same values.</p>}
                </div>
              </div>
            </div>

            {/* Joins */}
            <div className="p-5 space-y-4">
              <p className="eyebrow flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" aria-hidden="true" />Joins</p>
              {o.joins.length === 0 && o.joinedFrom.length === 0 && <p className="text-sm text-gray-400">Not joined to any other object. Add a Lookup field in Form Designer to link it.</p>}
              {o.joins.map(j => (
                <div key={j.field} className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{j.label}</span>
                    <code className="text-[11px] text-gray-500">{j.field}</code>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                    <select aria-label={`Object that ${j.label} points at`} className={`${sel} h-8 !w-auto`} value={j.target || ''} disabled={busy}
                      onChange={e => e.target.value && send({ kind: 'join', entity: o.id, field: j.field, target: e.target.value, message: '' })}>
                      {!j.target && <option value="">a list of values</option>}
                      {list.filter(x => x.id !== o.id).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                    <span className="text-xs text-gray-400">stores its <code>id</code></span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Pill tone="quiet">{j.linked} linked</Pill>
                    {j.target && j.broken > 0 && <Pill tone="bad"><AlertTriangle className="w-3 h-3" aria-hidden="true" />{j.broken} broken</Pill>}
                    {j.targetMissing && <Pill tone="bad">object no longer exists</Pill>}
                    {!j.target && <Pill tone="quiet">values come from Lookup Manager</Pill>}
                  </div>
                </div>
              ))}
              {o.joinedFrom.length > 0 && (
                <div className="pt-1 space-y-1.5">
                  {o.joinedFrom.map(j => (
                    <p key={j.entity + j.field} className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                      <ArrowLeft className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                      <span><b className="font-medium text-gray-900">{j.entityLabel}</b> through {j.label}</span>
                      <Pill tone="quiet">{j.linked} linked</Pill>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}

      {pending?.message && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="kj-title">
          <div className="w-full max-w-lg rounded-2xl bg-surface shadow-[var(--elev-pop)] p-6">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-700" aria-hidden="true" /></span>
              <div>
                <h3 id="kj-title" className="font-heading text-lg font-semibold text-gray-900">{pending.kind === 'key' ? 'This object already has records' : 'Records are already linked through this join'}</h3>
                <p className="mt-1.5 text-sm text-gray-600">{pending.message}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
              {pending.kind === 'key' ? (
                <Button disabled={busy} onClick={() => send(pending, { confirm: true })}>{pending.keyField ? 'Set the key anyway' : 'Remove the key'}</Button>
              ) : (
                <>
                  <Button variant="secondary" disabled={busy} onClick={() => send(pending, { confirm: true, existing: 'keep' })}>Keep the old links</Button>
                  <Button variant="danger" disabled={busy} onClick={() => send(pending, { confirm: true, existing: 'clear' })}>Clear the old links</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
