import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  LeadRule, LeadRuleCondition, LeadRuleOperator, LeadRuleRunResult,
  EntityDefinition, FieldDefinition,
} from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import {
  Plus, Zap, Play, Eye, Trash2, ArrowLeft, Loader2, Filter,
  Wand2, CheckCircle2, AlertCircle, Clock,
} from 'lucide-react';

const OPERATORS: { value: LeadRuleOperator; label: string; noValue?: boolean }[] = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: '>=', label: 'greater or equal' },
  { value: '<=', label: 'less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'is_empty', label: 'is empty', noValue: true },
  { value: 'is_not_empty', label: 'is not empty', noValue: true },
];

const emptyRule = (): Partial<LeadRule> => ({
  name: '',
  description: '',
  sourceEntity: '',
  targetEntity: 'lead',
  conditions: { match: 'all', rules: [] },
  fieldMapping: {},
  defaultValues: { source: 'Auto Rule' },
  dedupe: true,
  isActive: true,
  schedule: 'manual',
  intervalMinutes: 60,
});

export const LeadRules: React.FC = () => {
  const { addToast } = useToast();
  const [rules, setRules] = useState<LeadRule[]>([]);
  const [schemas, setSchemas] = useState<Record<string, EntityDefinition>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [draft, setDraft] = useState<Partial<LeadRule>>(emptyRule());
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [preview, setPreview] = useState<LeadRuleRunResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [loadedRules, loadedSchemas] = await Promise.all([api.getLeadRules(), api.getSchemas()]);
        setRules(loadedRules);
        setSchemas(loadedSchemas);
      } catch (e: any) {
        addToast(e.message || 'Failed to load lead rules', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sourceFields: FieldDefinition[] = draft.sourceEntity ? (schemas[draft.sourceEntity]?.fields || []) : [];
  const targetFields: FieldDefinition[] = (schemas[draft.targetEntity || 'lead']?.fields || []);

  const refreshRules = async () => setRules(await api.getLeadRules());

  const startNew = () => { setDraft(emptyRule()); setPreview(null); setView('edit'); };
  const startEdit = (rule: LeadRule) => { setDraft(JSON.parse(JSON.stringify(rule))); setPreview(null); setView('edit'); };

  const updateDraft = (patch: Partial<LeadRule>) => setDraft(prev => ({ ...prev, ...patch }));

  const addCondition = () => {
    const rules = [...(draft.conditions?.rules || []), { field: sourceFields[0]?.name || '', operator: '==' as LeadRuleOperator, value: '' }];
    updateDraft({ conditions: { match: draft.conditions?.match || 'all', rules } });
  };
  const updateCondition = (i: number, patch: Partial<LeadRuleCondition>) => {
    const rules = [...(draft.conditions?.rules || [])];
    rules[i] = { ...rules[i], ...patch };
    updateDraft({ conditions: { match: draft.conditions?.match || 'all', rules } });
  };
  const removeCondition = (i: number) => {
    const rules = (draft.conditions?.rules || []).filter((_, idx) => idx !== i);
    updateDraft({ conditions: { match: draft.conditions?.match || 'all', rules } });
  };

  const setMapping = (leadField: string, sourceField: string) => {
    const fieldMapping = { ...(draft.fieldMapping || {}) };
    if (sourceField) fieldMapping[leadField] = sourceField;
    else delete fieldMapping[leadField];
    updateDraft({ fieldMapping });
  };

  const handleSave = async (): Promise<string | null> => {
    if (!draft.name?.trim()) { addToast('Rule name is required', 'error'); return null; }
    if (!draft.sourceEntity) { addToast('Select a source entity', 'error'); return null; }
    setSaving(true);
    try {
      const saved = await api.saveLeadRule(draft);
      addToast('Lead rule saved', 'success');
      await refreshRules();
      setDraft(prev => ({ ...prev, id: saved.id }));
      return saved.id;
    } catch (e: any) {
      addToast(e.message || 'Failed to save', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    let id = draft.id;
    if (!id) { id = (await handleSave()) || undefined; }
    if (!id) return;
    setRunning('preview');
    try {
      setPreview(await api.previewLeadRule(id));
    } catch (e: any) {
      addToast(e.message || 'Preview failed', 'error');
    } finally {
      setRunning(null);
    }
  };

  const handleRun = async (id: string) => {
    setRunning(id);
    try {
      const result = await api.runLeadRule(id);
      addToast(`${result.created} lead(s) created, ${result.skipped} skipped`, 'success');
      await refreshRules();
    } catch (e: any) {
      addToast(e.message || 'Run failed', 'error');
    } finally {
      setRunning(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this lead rule?')) return;
    try {
      await api.deleteLeadRule(id);
      addToast('Rule deleted', 'success');
      await refreshRules();
    } catch (e: any) {
      addToast(e.message || 'Delete failed', 'error');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  // ---------- EDIT VIEW ----------
  if (view === 'edit') {
    const conditions = draft.conditions || { match: 'all', rules: [] };
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/30"><Wand2 className="w-5 h-5 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{draft.id ? 'Edit Lead Rule' : 'New Lead Rule'}</h1>
              <p className="text-sm text-slate-500">Auto-generate leads from records that match your criteria</p>
            </div>
          </div>
        </div>

        {/* Basics */}
        <Card title="Rule Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Rule Name</label>
              <input value={draft.name || ''} onChange={e => updateDraft({ name: e.target.value })} placeholder="e.g. High-value customers without insurance" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Source Records</label>
              <select value={draft.sourceEntity || ''} onChange={e => updateDraft({ sourceEntity: e.target.value, conditions: { match: 'all', rules: [] }, fieldMapping: {} })}>
                <option value="">Select source entity…</option>
                {Object.values(schemas).map((s: EntityDefinition) => <option key={s.id} value={s.id}>{s.pluralLabel}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
              <input value={draft.description || ''} onChange={e => updateDraft({ description: e.target.value })} placeholder="What does this rule do?" />
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-slate-100">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Automation</label>
            <div className="flex flex-wrap items-center gap-3">
              <select className="!w-auto" value={draft.schedule || 'manual'} onChange={e => updateDraft({ schedule: e.target.value as LeadRule['schedule'] })}>
                <option value="manual">Manual — only when I click Run</option>
                <option value="realtime">Realtime — when a matching record is created</option>
                <option value="interval">Scheduled — every N minutes</option>
              </select>
              {draft.schedule === 'interval' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">every</span>
                  <input type="number" min={1} className="!w-24" value={draft.intervalMinutes ?? 60} onChange={e => updateDraft({ intervalMinutes: Number(e.target.value) })} />
                  <span className="text-sm text-slate-500">minutes</span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {draft.schedule === 'realtime' && 'Leads are created automatically the moment a matching record is added.'}
              {draft.schedule === 'interval' && 'The scheduler runs this rule automatically on the interval above.'}
              {(!draft.schedule || draft.schedule === 'manual') && 'Run on demand from the rule list.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-6 mt-5 pt-5 border-t border-slate-100">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input type="checkbox" className="!w-4 !h-4" checked={!!draft.dedupe} onChange={e => updateDraft({ dedupe: e.target.checked })} />
              Skip records that already generated a lead (dedupe)
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input type="checkbox" className="!w-4 !h-4" checked={!!draft.isActive} onChange={e => updateDraft({ isActive: e.target.checked })} />
              Active
            </label>
          </div>
        </Card>

        {/* Conditions */}
        <Card title="Match Conditions" action={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Match</span>
            <select className="!w-auto !py-1 !text-sm" value={conditions.match} onChange={e => updateDraft({ conditions: { ...conditions, match: e.target.value as 'all' | 'any' } })}>
              <option value="all">ALL</option>
              <option value="any">ANY</option>
            </select>
            <span className="text-slate-500">of the following</span>
          </div>
        }>
          {!draft.sourceEntity ? (
            <p className="text-sm text-slate-400 py-4 text-center">Select a source entity first.</p>
          ) : (
            <div className="space-y-3">
              {conditions.rules.length === 0 && (
                <p className="text-sm text-slate-400 py-2">No conditions — the rule will match <strong>all</strong> {schemas[draft.sourceEntity]?.pluralLabel?.toLowerCase()}.</p>
              )}
              {conditions.rules.map((cond, i) => {
                const opMeta = OPERATORS.find(o => o.value === cond.operator);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-xl ring-1 ring-inset ring-slate-100">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select className="!w-auto !py-1.5 !text-sm flex-1 min-w-[140px]" value={cond.field} onChange={e => updateCondition(i, { field: e.target.value })}>
                      {sourceFields.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
                    </select>
                    <select className="!w-auto !py-1.5 !text-sm" value={cond.operator} onChange={e => updateCondition(i, { operator: e.target.value as LeadRuleOperator })}>
                      {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {!opMeta?.noValue && (
                      <input className="!w-auto !py-1.5 !text-sm flex-1 min-w-[120px]" value={cond.value ?? ''} onChange={e => updateCondition(i, { value: e.target.value })} placeholder="value" />
                    )}
                    <button onClick={() => removeCondition(i)} className="p-1.5 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4 text-rose-500" /></button>
                  </div>
                );
              })}
              <Button variant="secondary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={addCondition}>Add Condition</Button>
            </div>
          )}
        </Card>

        {/* Field mapping */}
        {draft.sourceEntity && (
          <Card title={`Map to ${schemas[draft.targetEntity || 'lead']?.label || 'Lead'} Fields`}>
            <p className="text-xs text-slate-500 mb-4">Choose which source value fills each lead field. Unmapped fields use defaults.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {targetFields.filter(f => !f.system).map(tf => (
                <div key={tf.name} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700 w-1/3 truncate" title={tf.label}>{tf.label}</span>
                  <span className="text-slate-300">←</span>
                  <select className="!py-1.5 !text-sm flex-1" value={(draft.fieldMapping || {})[tf.name] || ''} onChange={e => setMapping(tf.name, e.target.value)}>
                    <option value="">— default —</option>
                    {sourceFields.map(sf => <option key={sf.name} value={sf.name}>{sf.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Actions + preview */}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} loading={saving}>Save Rule</Button>
          <Button variant="secondary" icon={<Eye className="w-4 h-4" />} loading={running === 'preview'} onClick={handlePreview}>Preview Matches</Button>
        </div>

        {preview && (
          <Card title="Preview" action={<Badge status={`${preview.matched} matched`} />}>
            <div className="flex gap-4 mb-4 text-sm">
              <span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="w-4 h-4" />{preview.preview.length} would be created</span>
              <span className="flex items-center gap-1.5 text-amber-600"><AlertCircle className="w-4 h-4" />{preview.skipped} skipped (dedupe)</span>
            </div>
            {preview.preview.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No new leads would be created.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {preview.preview.map((p, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{p.primaryDisplay}</span>
                    <span className="text-xs text-slate-400 font-mono">{p.sourceId.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    );
  }

  // ---------- LIST VIEW ----------
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/30"><Zap className="w-6 h-6 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Lead Generation Rules</h1>
            <p className="text-sm text-slate-500">Automatically create leads from records that match your criteria</p>
          </div>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={startNew}>New Rule</Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <div className="py-16 text-center">
            <div className="inline-flex p-4 bg-indigo-50 rounded-2xl mb-4"><Wand2 className="w-8 h-8 text-indigo-500" /></div>
            <h3 className="text-lg font-semibold text-slate-800">No lead rules yet</h3>
            <p className="text-sm text-slate-500 mt-1 mb-5">Create a rule to auto-generate qualified leads from your existing data.</p>
            <Button icon={<Plus className="w-4 h-4" />} onClick={startNew}>Create your first rule</Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rules.map(rule => (
            <Card key={rule.id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 truncate">{rule.name}</h3>
                    <Badge status={rule.isActive ? 'Active' : 'Inactive'} />
                  </div>
                  {rule.description && <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{rule.description}</p>}
                  <div className="flex items-center flex-wrap gap-3 mt-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Filter className="w-3 h-3" />
                      {schemas[rule.sourceEntity]?.pluralLabel || rule.sourceEntity} → {schemas[rule.targetEntity]?.label || rule.targetEntity}
                    </span>
                    <span>{rule.conditions.rules.length} condition(s)</span>
                    <span className="inline-flex items-center gap-1 font-medium text-indigo-600">
                      {rule.schedule === 'realtime' && <><Zap className="w-3 h-3" />Realtime</>}
                      {rule.schedule === 'interval' && <><Clock className="w-3 h-3" />Every {rule.intervalMinutes || 60}m</>}
                      {(!rule.schedule || rule.schedule === 'manual') && <><Play className="w-3 h-3" />Manual</>}
                    </span>
                  </div>
                  {rule.lastRunAt && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                      <Clock className="w-3 h-3" /> Last run created {rule.lastRunCount || 0} lead(s)
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                <Button size="sm" icon={<Play className="w-4 h-4" />} loading={running === rule.id} onClick={() => handleRun(rule.id)}>Run Now</Button>
                <Button size="sm" variant="secondary" onClick={() => startEdit(rule)}>Edit</Button>
                <button onClick={() => handleDelete(rule.id)} className="ml-auto p-2 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4 text-rose-500" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
