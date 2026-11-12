import React, { useEffect, useState } from 'react';
import { Package, Loader2, Check, Plus, ShieldCheck, Workflow, Zap, Users, Layers, AlertTriangle, Building2 } from 'lucide-react';
import { api } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

// Configuration → Industry Packs. A pack is a ready-made set-up for a kind of business: the objects, fields, forms,
// roles, rules and journeys. It only ADDS: nothing the workspace already has is changed, so it is safe to install on
// a workspace that is already in use, and safe to run again. Journeys arrive switched off.

interface Pack { id: string; name: string; description: string; audience?: string; contents: Record<string, number>; installed: { at: string; summary: Record<string, number> | null } | null }
interface Plan {
  pack: { id: string; name: string; description: string };
  objects: { id: string; label: string; status: 'new' | 'extend' | 'exists'; fields: number; fieldNames: string[] }[];
  roles: { name: string; description?: string; status: string }[];
  triggers: { name: string; entityType: string; status: string }[];
  journeys: { name: string; entityType: string; status: string }[];
  menu: { id: string; label: string; status: string }[];
  errors: string[];
  willAdd: Record<'objects' | 'fields' | 'roles' | 'triggers' | 'journeys' | 'menu', number>;
}

const COMING = [
  { name: 'Property & real estate', blurb: 'Projects, towers, unit inventory, site visits, bookings, payment schedules and channel partners.' },
  { name: 'Education', blurb: 'Enquiries, courses, batches, admissions and fee instalments.' },
  { name: 'Clinics', blurb: 'Patients, appointments, visits, treatment plans and follow-ups.' },
];

const Badge: React.FC<{ s: string }> = ({ s }) => (
  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${s === 'new' ? 'bg-green-100 text-green-700' : s === 'extend' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
    {s === 'new' ? 'adds' : s === 'extend' ? 'adds fields' : 'already there'}
  </span>
);

export const IndustryPacks: React.FC = () => {
  const { addToast } = useToast();
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.getPacks().then(setPacks).catch(e => { addToast(e.message, 'error'); setPacks([]); });
  useEffect(() => { load(); }, []);

  const preview = async (id: string) => {
    setBusy(id);
    try { setPlan(await api.previewPack(id)); } catch (e: any) { addToast(e.message, 'error'); } finally { setBusy(null); }
  };
  const install = async () => {
    if (!plan) return;
    setBusy('install');
    try {
      const r = await api.installPack(plan.pack.id);
      addToast(`${plan.pack.name} pack installed: ${r.added.objects} object(s), ${r.added.fields} field(s), ${r.added.journeys} journey(s) (switched off)`, 'success');
      // The menu and every screen read the new objects at start-up.
      setTimeout(() => window.location.reload(), 1400);
    } catch (e: any) { addToast(e.message, 'error'); setBusy(null); }
  };

  const nothing = plan && Object.values(plan.willAdd).every(n => n === 0);

  return (
    <div className="page-shell font-sans space-y-6">
      <div>
        <h1>Industry Packs</h1>
        <p className="page-subtitle">A ready-made set-up for your kind of business. A pack only adds: nothing you have already built is changed or removed.</p>
      </div>

      {packs === null ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packs.map(p => (
            <Card key={p.id}>
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-accent" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <h3 className="font-heading text-[17px] font-semibold text-gray-900 flex items-center gap-2 flex-wrap">{p.name}{p.installed && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-semibold inline-flex items-center gap-1"><Check className="w-3 h-3" aria-hidden="true" />Installed</span>}</h3>
                  <p className="text-xs text-gray-500">{p.audience}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-600">{p.description}</p>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                <li className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />{p.contents.objects} new objects</li>
                <li className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />{p.contents.roles} roles</li>
                <li className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />{p.contents.triggers} field triggers</li>
                <li className="flex items-center gap-1.5"><Workflow className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />{p.contents.journeys} journeys</li>
              </ul>
              <div className="mt-4 flex items-center gap-2">
                <Button icon={busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} disabled={!!busy} onClick={() => preview(p.id)}>{p.installed ? 'Check for missing parts' : 'Preview and install'}</Button>
              </div>
            </Card>
          ))}
          {COMING.map(c => (
            <Card key={c.name} className="opacity-70">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center"><Package className="w-5 h-5 text-gray-400" aria-hidden="true" /></span>
                <div><h3 className="font-heading text-[17px] font-semibold text-gray-900">{c.name}</h3><p className="text-xs text-gray-500">Coming next</p></div>
              </div>
              <p className="mt-3 text-sm text-gray-600">{c.blurb}</p>
            </Card>
          ))}
        </div>
      )}

      {plan && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="pack-title">
          <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-surface shadow-[var(--elev-pop)]">
            <div className="px-6 pt-6 pb-3 border-b border-gray-100">
              <h2 id="pack-title" className="font-heading text-xl font-semibold text-gray-900">Install the {plan.pack.name} pack</h2>
              {plan.errors.length === 0 && (
                <p className="mt-1 text-sm text-gray-600">
                  {nothing ? 'Everything in this pack is already set up. Nothing to add.' : `This will add ${plan.willAdd.objects} object(s) with ${plan.willAdd.fields} field(s), ${plan.willAdd.roles} role(s), ${plan.willAdd.triggers} field trigger(s) and ${plan.willAdd.journeys} journey(s).`}
                </p>
              )}
            </div>
            <div className="px-6 py-4 overflow-y-auto space-y-5 text-sm">
              {plan.errors.length > 0 && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                  <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" aria-hidden="true" />This pack cannot be installed here yet</p>
                  <ul className="mt-1.5 list-disc pl-5 space-y-0.5 text-xs">{plan.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              <section>
                <h3 className="eyebrow mb-2">Objects and fields</h3>
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {plan.objects.map(o => (
                    <li key={o.id} className="px-3 py-2 flex items-start gap-3">
                      <span className="w-32 shrink-0 font-medium text-gray-900">{o.label}</span>
                      <span className="flex-1 min-w-0 text-xs text-gray-500">{o.status === 'exists' ? 'You already have every field of this pack.' : o.fieldNames.join(', ')}</span>
                      <Badge s={o.status} />
                    </li>
                  ))}
                </ul>
              </section>
              <section className="grid sm:grid-cols-2 gap-5">
                <div>
                  <h3 className="eyebrow mb-2 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />Roles</h3>
                  <ul className="space-y-1.5">{plan.roles.map(r => <li key={r.name} className="flex items-start justify-between gap-2"><span><b className="font-medium text-gray-900">{r.name}</b><span className="block text-xs text-gray-500">{r.description}</span></span><Badge s={r.status} /></li>)}</ul>
                </div>
                <div>
                  <h3 className="eyebrow mb-2 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" aria-hidden="true" />Field triggers</h3>
                  <ul className="space-y-1.5">{plan.triggers.map(t => <li key={t.name} className="flex items-start justify-between gap-2"><span className="text-gray-800">{t.name}</span><Badge s={t.status} /></li>)}</ul>
                </div>
              </section>
              <section>
                <h3 className="eyebrow mb-2 flex items-center gap-1.5"><Workflow className="w-3.5 h-3.5" aria-hidden="true" />Journeys (installed switched off)</h3>
                <ul className="grid sm:grid-cols-2 gap-x-5 gap-y-1.5">{plan.journeys.map(j => <li key={j.name} className="flex items-start justify-between gap-2"><span className="text-gray-800">{j.name}</span><Badge s={j.status} /></li>)}</ul>
                <p className="mt-2 text-xs text-gray-500">Turn each journey on in Configuration → Journeys once you have read what it does. Nothing is sent before that.</p>
              </section>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={busy === 'install'} onClick={() => setPlan(null)}>{nothing ? 'Close' : 'Cancel'}</Button>
              {!nothing && <Button icon={busy === 'install' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} disabled={busy === 'install' || plan.errors.length > 0} onClick={install}>Install {plan.pack.name} pack</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndustryPacks;
