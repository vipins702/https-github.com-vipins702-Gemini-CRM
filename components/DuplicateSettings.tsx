import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, GitMerge, Loader2, Plus, ScanSearch, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { api } from '../services/api';
import { DedupeConfig, DedupeRule, DuplicateGroup, EntityDefinition } from '../types';
import { formatPhone } from '../services/countries';

const NOT_COMPARABLE = new Set(['image', 'iframe', 'attachment', 'rollup', 'autonumber', 'textarea', 'multiselect', 'checkbox', 'formula']);

const PRESETS: { label: string; rule: DedupeRule }[] = [
  { label: 'Same e-mail', rule: { label: 'Same e-mail', fields: ['email'] } },
  { label: 'Same phone', rule: { label: 'Same phone number', fields: ['phone'] } },
  { label: 'Same name and company', rule: { label: 'Same name and company', fields: ['firstName', 'lastName', 'company'] } },
];

const when = (s?: string) => { if (!s) return ''; const d = new Date(s.includes('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); };

const Choice: React.FC<{ value: string; current: string; onPick: (v: string) => void; title: string; hint: string; disabled?: boolean }> = ({ value, current, onPick, title, hint, disabled }) => (
  <button
    type="button" role="radio" aria-checked={current === value} disabled={disabled} onClick={() => onPick(value)}
    className={`text-left rounded-xl border px-4 py-3 transition-colors flex-1 min-w-[200px] disabled:opacity-50 ${current === value ? 'border-accent bg-accent/[0.06]' : 'border-slate-200 hover:border-slate-300 bg-surface'}`}
  >
    <span className={`block text-sm font-semibold ${current === value ? 'text-accent-deep' : 'text-ink'}`}>{title}</span>
    <span className="block text-xs text-ink-muted mt-0.5">{hint}</span>
  </button>
);

/** Object Manager > Duplicates: what counts as the same record, what happens when one already exists, and a tool to clean up. */
export const DuplicateSettings: React.FC = () => {
  const { addToast } = useToast();
  const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});
  const [entity, setEntity] = useState('lead');
  const [cfg, setCfg] = useState<DedupeConfig | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scan, setScan] = useState<{ groups: DuplicateGroup[]; total: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [keep, setKeep] = useState<Record<number, string>>({});
  const [merging, setMerging] = useState<number | null>(null);

  useEffect(() => { api.getSchemas().then(setSchemas).catch(() => setSchemas({})); }, []);
  useEffect(() => {
    setCfg(null); setScan(null); setDirty(false);
    api.getDedupeConfig(entity).then(r => { setCfg(r.config); setIsDefault(r.isDefault); }).catch(e => addToast(e?.message || 'Could not load the settings', 'error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const def = schemas[entity];
  const objects = useMemo(() => (Object.values(schemas) as EntityDefinition[]).sort((a, b) => a.label.localeCompare(b.label)), [schemas]);
  const fields = useMemo(() => (def?.fields || []).filter(f => !NOT_COMPARABLE.has(f.type)), [def]);
  const labelOf = (name: string) => def?.fields.find(f => f.name === name)?.label || name;
  const others = objects.filter(o => o.id !== entity);

  const change = (patch: Partial<DedupeConfig>) => { setCfg(c => (c ? { ...c, ...patch } : c)); setDirty(true); };
  const setRule = (i: number, rule: DedupeRule) => change({ rules: (cfg?.rules || []).map((r, j) => (j === i ? rule : r)) });
  const toggleField = (i: number, name: string) => {
    const r = cfg!.rules[i];
    const has = r.fields.includes(name);
    if (!has && r.fields.length >= 4) return;
    const next = has ? r.fields.filter(f => f !== name) : [...r.fields, name];
    setRule(i, { ...r, fields: next, label: r.label && !PRESETS.some(p => p.rule.label === r.label) && r.label !== r.fields.map(labelOf).join(' + ') ? r.label : next.map(labelOf).join(' + ') });
  };
  const addRule = (rule?: DedupeRule) => {
    const base = rule ? { ...rule, fields: rule.fields.filter(f => def?.fields.some(x => x.name === f)) } : { label: '', fields: [] };
    if (rule && !base.fields.length) { addToast('This object has none of those fields', 'error'); return; }
    change({ rules: [...(cfg?.rules || []), base] });
  };

  const problems: string[] = [];
  if (cfg?.enabled && !cfg.rules.length) problems.push('Add at least one rule, or switch the check off.');
  cfg?.rules.forEach((r, i) => { if (!r.fields.length) problems.push(`Rule ${i + 1}: choose at least one field.`); });

  const save = async () => {
    if (!cfg || problems.length) return;
    setSaving(true);
    try {
      const r = await api.saveDedupeConfig(entity, cfg);
      setCfg(r.config); setIsDefault(false); setDirty(false);
      addToast('Duplicate settings saved', 'success');
    } catch (e: any) { addToast(e?.message || 'Could not save', 'error'); }
    finally { setSaving(false); }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const r = await api.scanDuplicates(entity);
      setScan(r); setKeep(Object.fromEntries(r.groups.map((g, i) => [i, g.suggestedKeepId])));
    } catch (e: any) { addToast(e?.message || 'Could not scan', 'error'); }
    finally { setScanning(false); }
  };

  const merge = async (i: number) => {
    const g = scan!.groups[i];
    const keepId = keep[i] || g.suggestedKeepId;
    const rest = g.records.filter(r => r.id !== keepId);
    const kept = g.records.find(r => r.id === keepId);
    if (!window.confirm(`Merge ${rest.length} record${rest.length === 1 ? '' : 's'} into "${kept?.name}"?\n\nWhat it is missing is filled in from the others, their tasks, notes and messages move to it, and the others are deleted. This cannot be undone.`)) return;
    setMerging(i);
    try {
      const r = await api.mergeDuplicates(entity, keepId, rest.map(x => x.id));
      addToast(`Merged ${r.merged} into one${r.filledFields.length ? ` (filled in: ${r.filledFields.join(', ')})` : ''}`, 'success');
      await runScan();
    } catch (e: any) { addToast(e?.message || 'Could not merge', 'error'); }
    finally { setMerging(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-extrabold text-ink flex items-center gap-2"><Copy className="w-5 h-5 text-accent" aria-hidden="true" /> Duplicates</h2>
          <p className="text-sm text-ink-muted mt-0.5">Decide, object by object, what counts as the same record and what happens when one already exists.</p>
        </div>
        <label className="block">
          <span className="mono-label block mb-1">Object</span>
          <select value={entity} onChange={e => setEntity(e.target.value)} className="min-w-[200px]">
            {objects.map(o => <option key={o.id} value={o.id}>{o.pluralLabel || o.label}</option>)}
          </select>
        </label>
      </div>

      {!cfg ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div> : (
        <>
          <section className="bg-surface rounded-2xl border border-slate-200 p-5 space-y-5" aria-label="Duplicate rules">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 w-4 h-4" checked={cfg.enabled} onChange={e => change({ enabled: e.target.checked })} />
              <span>
                <span className="block text-sm font-semibold text-ink">Check for duplicates</span>
                <span className="block text-xs text-ink-muted">{isDefault && cfg.enabled ? 'These are the standard settings. Change them and save to make them your own.' : 'Switched off, anyone can save the same record twice.'}</span>
              </span>
            </label>

            <fieldset disabled={!cfg.enabled} className={`space-y-5 ${cfg.enabled ? '' : 'opacity-50'}`}>
              <div>
                <p className="text-sm font-semibold text-ink mb-2">What counts as the same {def?.label?.toLowerCase() || 'record'}?</p>
                <div className="space-y-2.5">
                  {cfg.rules.map((r, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 p-3.5">
                      <div className="flex items-center gap-2">
                        <input value={r.label || ''} onChange={e => setRule(i, { ...r, label: e.target.value })} placeholder="Name this rule (e.g. Same e-mail)" aria-label={`Rule ${i + 1} name`} className="flex-1" maxLength={80} />
                        <button type="button" aria-label={`Remove rule ${i + 1}`} onClick={() => change({ rules: cfg.rules.filter((_, j) => j !== i) })} className="p-2 rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <p className="text-xs text-ink-muted mt-2.5 mb-1.5">Two records match when <strong className="text-ink">all</strong> of these are the same (up to 4):</p>
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Fields of rule ${i + 1}`}>
                        {fields.map(f => {
                          const on = r.fields.includes(f.name);
                          return (
                            <button key={f.name} type="button" aria-pressed={on} onClick={() => toggleField(i, f.name)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-accent/10 border-accent/40 text-accent-deep' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{f.label}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {!cfg.rules.length && <p className="text-sm text-ink-muted py-2">No rules yet.</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-xs text-ink-muted">Add:</span>
                  {PRESETS.map(p => <button key={p.label} type="button" onClick={() => addRule(p.rule)} className="px-2.5 py-1 rounded-full text-xs font-semibold border border-slate-200 hover:border-accent hover:text-accent-deep"><Plus className="w-3 h-3 inline -mt-0.5 mr-0.5" aria-hidden="true" />{p.label}</button>)}
                  <button type="button" onClick={() => addRule()} className="px-2.5 py-1 rounded-full text-xs font-semibold border border-dashed border-slate-300 hover:border-accent text-ink-muted hover:text-accent-deep">Your own rule</button>
                </div>
                <p className="text-xs text-ink-muted mt-2.5">E-mails are compared ignoring capitals. Phone numbers by their last 10 digits, so +91 98765 43210 and 098765 43210 are the same. Other text ignores capitals, spaces and punctuation. Empty fields never match.</p>
              </div>

              {others.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-ink mb-2">Also look in</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Other objects to check">
                    {others.map(o => {
                      const on = cfg.checkAlso.includes(o.id);
                      return (
                        <button key={o.id} type="button" aria-pressed={on} onClick={() => change({ checkAlso: on ? cfg.checkAlso.filter(x => x !== o.id) : [...cfg.checkAlso, o.id].slice(0, 5) })}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-accent/10 border-accent/40 text-accent-deep' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{o.pluralLabel || o.label}</button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-ink-muted mt-1.5">A new {def?.label?.toLowerCase()} can already be one of these, for example a lead who is already a customer.</p>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-ink mb-2">When someone saves one that already exists</p>
                <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Saving by hand">
                  <Choice value="warn" current={cfg.action} onPick={v => change({ action: v as DedupeConfig['action'] })} title="Ask first" hint="Show the existing record and let them choose to save anyway." />
                  <Choice value="block" current={cfg.action} onPick={v => change({ action: v as DedupeConfig['action'] })} title="Don't allow it" hint="Show the existing record. A second one cannot be saved." />
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-ink mb-2">When it arrives on its own (web form, import, WhatsApp, webhook)</p>
                <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Arriving automatically">
                  <Choice value="update" current={cfg.automated} onPick={v => change({ automated: v as DedupeConfig['automated'] })} title="Fill in the existing one" hint="Add what the old record is missing, and write a note that they came again." />
                  <Choice value="skip" current={cfg.automated} onPick={v => change({ automated: v as DedupeConfig['automated'] })} title="Skip it" hint="Leave the old record exactly as it is." />
                  <Choice value="create" current={cfg.automated} onPick={v => change({ automated: v as DedupeConfig['automated'] })} title="Create it anyway" hint="Allow duplicates from these channels." />
                </div>
              </div>
            </fieldset>

            {problems.length > 0 && (
              <ul className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-0.5" role="alert">
                {problems.map(p => <li key={p}>{p}</li>)}
              </ul>
            )}
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={save} loading={saving} disabled={!dirty || problems.length > 0} icon={<ShieldCheck className="w-4 h-4" />}>Save</Button>
              {dirty && <span className="text-xs text-ink-muted">You have unsaved changes.</span>}
            </div>
          </section>

          <section className="bg-surface rounded-2xl border border-slate-200 p-5" aria-label="Find duplicates">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Duplicates you already have</h3>
                <p className="text-xs text-ink-muted mt-0.5">Find {def?.pluralLabel?.toLowerCase() || 'records'} that match under the rules above, and merge each group into one.{dirty ? ' Save your changes first: the scan uses the saved rules.' : ''}</p>
              </div>
              <Button variant="secondary" onClick={runScan} loading={scanning} icon={<ScanSearch className="w-4 h-4" />}>Scan now</Button>
            </div>

            {scan && scan.groups.length === 0 && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mt-4">No duplicates found.</p>}
            {scan && scan.groups.length > 0 && (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-ink-muted">{scan.total} group{scan.total === 1 ? '' : 's'} found{scan.total > scan.groups.length ? `, the biggest ${scan.groups.length} shown` : ''}. Choose the record to keep in each group.</p>
                {scan.groups.map((g, i) => (
                  <div key={g.suggestedKeepId} className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                      <p className="text-xs text-ink-muted flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />{g.records.length} records · {g.because.join(', ') || 'matching'}</p>
                      <Button size="sm" onClick={() => merge(i)} loading={merging === i} icon={<GitMerge className="w-4 h-4" />}>Merge into the kept one</Button>
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs text-ink-muted"><th className="px-4 py-2 font-medium w-16">Keep</th><th className="px-2 py-2 font-medium">Name</th><th className="px-2 py-2 font-medium">E-mail</th><th className="px-2 py-2 font-medium">Phone</th><th className="px-2 py-2 font-medium">Added</th><th className="px-2 py-2 font-medium text-right">Filled in</th></tr></thead>
                      <tbody>
                        {g.records.map(r => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="px-4 py-2"><input type="radio" name={`keep-${i}`} aria-label={`Keep ${r.name}`} checked={(keep[i] || g.suggestedKeepId) === r.id} onChange={() => setKeep(k => ({ ...k, [i]: r.id }))} /></td>
                            <td className="px-2 py-2 font-medium text-ink">{r.name}{r.status && <span className="ml-2 text-xs font-normal text-ink-muted">{r.status}</span>}{r.id === g.suggestedKeepId && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent-deep">suggested</span>}</td>
                            <td className="px-2 py-2 text-ink-muted truncate max-w-[200px]">{r.email || '—'}</td>
                            <td className="px-2 py-2 text-ink-muted tnum">{formatPhone(r.phone) || '—'}</td>
                            <td className="px-2 py-2 text-ink-muted tnum">{when(r.createdAt)}</td>
                            <td className="px-2 py-2 text-ink-muted tnum text-right">{r.fieldsFilled} fields</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
