import React, { useEffect, useMemo, useState } from 'react';
import { Zap, Plus, Trash2, Save, Loader2, ArrowRight, Power } from 'lucide-react';
import { api } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { EntityDefinition, FieldRule, RuleOperator } from '../types';
import { GateBuilder, emptyGate, toGate, describeGate } from '../components/GateBuilder';
import { FieldMapper } from '../components/FieldMapper';

// Configuration → Field Triggers: rules that set field values BEFORE a record is saved.
// e.g. WHEN Interested = Yes AND Budget = No AND Callback = Yes  THEN  Priority = "Nurture".
// They run on every create and edit, from forms, imports, web forms and the API alike, in list order.
// (Journeys handle what happens AFTER a save: e-mails, tasks, waits.)

const OPS: { v: RuleOperator; label: string; needsValue: boolean }[] = [
  { v: '==', label: 'is', needsValue: true },
  { v: '!=', label: 'is not', needsValue: true },
  { v: 'contains', label: 'contains', needsValue: true },
  { v: '>', label: 'greater than', needsValue: true },
  { v: '<', label: 'less than', needsValue: true },
  { v: '>=', label: 'at least', needsValue: true },
  { v: '<=', label: 'at most', needsValue: true },
  { v: 'empty', label: 'is empty', needsValue: false },
  { v: 'not_empty', label: 'has a value', needsValue: false },
  { v: 'changed', label: 'was changed (edits only)', needsValue: false },
];

const blank = (): FieldRule => ({ name: '', active: true, conditions: emptyGate(), actions: [{ field: '', value: '' }] });
const input = 'h-9 rounded-lg border border-gray-200 bg-surface px-2.5 text-sm text-gray-900 min-w-0';

export const FieldTriggers: React.FC = () => {
  const { addToast } = useToast();
  const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});
  const [entity, setEntity] = useState('lead');
  const [rules, setRules] = useState<FieldRule[]>([]);
  const [draft, setDraft] = useState<FieldRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Lookup fields: pick the label people know; the code is what gets saved and compared.
  const [lookups, setLookups] = useState<Record<string, { value: string; label: string }[]>>({});
  useEffect(() => { if (entity) api.getLookupOptions(entity).then(setLookups).catch(() => setLookups({})); }, [entity]);

  useEffect(() => { api.getSchemas().then(s => { setSchemas(s || {}); if (s && !s[entity]) setEntity(Object.keys(s)[0] || ''); }).catch(() => {}); }, []);
  const load = () => {
    if (!entity) return;
    setLoading(true);
    api.getFieldRules(entity).then(r => setRules(r.rules || [])).catch(e => addToast(e.message, 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { setDraft(null); load(); }, [entity]);

  const fields = schemas[entity]?.fields || [];
  const settable = useMemo(() => fields.filter(f => f.type !== 'formula' && !['image', 'iframe', 'attachment'].includes(f.type)), [fields]);
  const label = (n: string) => fields.find(f => f.name === n)?.label || n;
  const optionsOf = (n: string): (string | { value: string; label: string })[] | undefined => lookups[n]?.length ? lookups[n] : fields.find(f => f.name === n)?.options;

  const save = async (rule: FieldRule) => {
    setSaving(true);
    try {
      await api.saveFieldRule(entity, rule);
      addToast(rule.id ? 'Trigger saved' : 'Trigger created', 'success');
      setDraft(null); load();
    } catch (e: any) { addToast(e.message, 'error'); } finally { setSaving(false); }
  };
  const remove = async (r: FieldRule) => {
    if (!r.id || !window.confirm(`Delete the trigger "${r.name}"?`)) return;
    try { await api.deleteFieldRule(entity, r.id); addToast('Trigger deleted', 'success'); load(); } catch (e: any) { addToast(e.message, 'error'); }
  };

  const ValueInput: React.FC<{ field: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ field, value, onChange, placeholder }) => {
    const opts = optionsOf(field);
    return opts?.length
      ? <select className={`${input} w-full`} value={value} onChange={e => onChange(e.target.value)}><option value="">— choose —</option>{opts.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      : <input className={`${input} w-full`} value={value} placeholder={placeholder || 'value'} onChange={e => onChange(e.target.value)} />;
  };

  return (
    <div className="page-shell font-sans space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1>Field Triggers</h1>
          <p className="page-subtitle">Set field values automatically before a record is saved, when the conditions you choose are met.</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Record type" className={input} value={entity} onChange={e => setEntity(e.target.value)}>
            {(Object.values(schemas) as EntityDefinition[]).map(s => <option key={s.id} value={s.id}>{s.pluralLabel || s.label}</option>)}
          </select>
          <Button className="whitespace-nowrap" icon={<Plus className="w-4 h-4" />} onClick={() => setDraft(blank())}>New trigger</Button>
        </div>
      </div>

      {draft && (
        <Card title={draft.id ? 'Edit trigger' : 'New trigger'}>
          <div className="space-y-5">
            <input className={`${input} w-full`} placeholder="Name, e.g. Mark hot callbacks" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />

            <div>
              <span className="eyebrow block mb-2">When</span>
              <GateBuilder value={toGate(draft.conditions)} onChange={g => setDraft({ ...draft, conditions: g })} fields={fields.map(f => ({ name: f.name, label: f.label, options: optionsOf(f.name) }))} operators={OPS} />
            </div>

            <div>
              <span className="eyebrow block mb-2">Then set</span>
              <FieldMapper
                value={draft.actions}
                onChange={rows => setDraft({ ...draft, actions: rows })}
                targets={settable.map(f => ({ name: f.name, label: f.label, type: f.type, options: optionsOf(f.name) }))}
                sources={fields.map(f => ({ name: f.name, label: f.label, type: f.type }))}
                addLabel="Add field to set"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
              <Button icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} disabled={saving} onClick={() => save(draft)}>Save trigger</Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : rules.length === 0 && !draft ? (
        <Card>
          <div className="py-10 text-center">
            <div className="mx-auto w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center"><Zap className="w-5 h-5 text-accent" /></div>
            <p className="mt-3 font-medium text-gray-900">No triggers for {schemas[entity]?.pluralLabel || entity} yet</p>
            <p className="text-sm text-gray-500 mt-1">Example: when Interested is Yes and Budget is No, set Priority to Nurture.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((r, idx) => (
            <Card key={r.id}>
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <span className="text-xs font-semibold text-gray-400 tabular w-6">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 flex items-center gap-2">{r.name}{!r.active && <span className="status-pill bg-gray-100 text-gray-500">Off</span>}</p>
                  <p className="text-sm text-gray-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>{describeGate(toGate(r.conditions, r.match), label, o => OPS.find(x => x.v === o)?.label || o)}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                    {r.actions.map((a, i) => <span key={i} className="text-gray-700">{label(a.field)} = <q>{a.value}</q>{i < r.actions.length - 1 ? ',' : ''}</span>)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button title={r.active ? 'Turn off' : 'Turn on'} onClick={() => save({ ...r, active: !r.active })} className={`p-2 rounded-lg hover:bg-gray-100 ${r.active ? 'text-green-600' : 'text-gray-400'}`}><Power className="w-4 h-4" /></button>
                  <Button variant="secondary" size="sm" onClick={() => setDraft(JSON.parse(JSON.stringify(r)))}>Edit</Button>
                  <button aria-label={`Delete ${r.name}`} onClick={() => remove(r)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default FieldTriggers;
