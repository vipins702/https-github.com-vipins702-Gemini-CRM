import React, { useEffect, useState } from 'react';
import { Workflow, Plus, Trash2, ArrowUp, ArrowDown, Save, Loader2, GripVertical, Check, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { ProcessDefinition, ProcessStage } from '../types';

const SWATCHES = ['#2563EB', '#059669', '#EA7317', '#DC2626', '#7C3AED', '#0891B2', '#6E7490', '#1E40AF'];
const TYPE_OPTS: ProcessStage['type'][] = ['open', 'won', 'lost'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const ProcessBuilder: React.FC = () => {
  const { addToast } = useToast();
  const [entities, setEntities] = useState<string[]>([]);
  const [entity, setEntity] = useState<string>('lead');
  const [proc, setProc] = useState<ProcessDefinition | null>(null);
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openStage, setOpenStage] = useState<number>(-1);

  useEffect(() => { api.getProcessEntities().then(r => setEntities(r.entities)).catch(() => setEntities(['lead', 'quote', 'case'])); }, []);

  const load = async (et: string) => {
    setLoading(true);
    try {
      const p = await api.getProcess(et);
      setProc(p); setStages(p.stages); setName(p.name);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(entity); }, [entity]);

  const setStage = (i: number, patch: Partial<ProcessStage>) =>
    setStages(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const addStage = () =>
    setStages(prev => [...prev, { id: `stage_${Date.now()}`, name: 'New Stage', order: prev.length, color: '#6E7490', type: 'open', requiredFields: [], entryActions: [] }]);
  const removeStage = (i: number) => setStages(prev => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => setStages(prev => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const arr = [...prev];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return arr;
  });

  const setRequired = (i: number, csv: string) =>
    setStage(i, { requiredFields: csv.split(',').map(s => s.trim()).filter(Boolean) });
  const addAction = (i: number, type: 'create_task' | 'email' | 'webhook') =>
    setStages(prev => prev.map((s, idx) => idx === i ? { ...s, entryActions: [...(s.entryActions || []), { type }] } : s));
  const setAction = (i: number, ai: number, patch: any) =>
    setStages(prev => prev.map((s, idx) => idx === i ? { ...s, entryActions: s.entryActions.map((a, j) => j === ai ? { ...a, ...patch } : a) } : s));
  const removeAction = (i: number, ai: number) =>
    setStages(prev => prev.map((s, idx) => idx === i ? { ...s, entryActions: s.entryActions.filter((_, j) => j !== ai) } : s));

  const save = async () => {
    if (!stages.length) { addToast('Add at least one stage', 'error'); return; }
    setSaving(true);
    try {
      const payload = { name, stages: stages.map((s, i) => ({ ...s, id: s.id || slug(s.name), order: i })) };
      const updated = await api.saveProcess(entity, payload);
      setProc(updated); setStages(updated.stages); setName(updated.name);
      addToast('Process saved — Pipeline now uses these stages', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 lg:p-8 font-sans max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><Workflow className="w-[18px] h-[18px] text-[#2563EB]" /></span></span>
            Process Builder
          </h1>
          <p className="text-ink-muted text-sm mt-1">Define the stages each record moves through. Drives the Pipeline board and reporting.</p>
        </div>
        <Button icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} onClick={save} disabled={saving || loading}>Save process</Button>
      </div>

      {/* Entity picker */}
      <div className="flex items-center gap-2 mb-5">
        <span className="mono-label">Process for</span>
        <div className="flex rounded-full bg-slate-100 p-0.5 text-sm">
          {entities.map(et => (
            <button key={et} onClick={() => setEntity(et)} className={`px-3.5 py-1.5 rounded-full font-medium capitalize transition-colors ${entity === et ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}>{et}</button>
          ))}
        </div>
        {proc?.source === 'default' && <span className="status-pill status-orange">using defaults</span>}
        {proc?.source === 'custom' && <span className="status-pill status-green">customised</span>}
      </div>

      {loading ? (
        <div className="glass-showcase p-5 space-y-3"><Skeleton variant="text" /><Skeleton variant="text" /><Skeleton variant="text" /></div>
      ) : (
        <div className="glass-showcase p-6 space-y-5">
          <div>
            <label className="mono-label block mb-1.5">Process name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Loan Onboarding" className="max-w-sm" />
          </div>

          <div>
            <label className="mono-label block mb-2">Stages (in order)</label>
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-12 gap-2 px-1">
                <span className="col-span-1 mono-label" />
                <span className="col-span-5 mono-label">Stage name</span>
                <span className="col-span-3 mono-label">Color</span>
                <span className="col-span-2 mono-label">Type</span>
                <span className="col-span-1 mono-label" />
              </div>
              {stages.map((s, i) => {
                const ruleCount = (s.requiredFields?.length || 0) + (s.entryActions?.length || 0);
                const open = openStage === i;
                return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl">
                  <div className="grid grid-cols-12 gap-2 items-center p-2">
                    <div className="col-span-1 flex flex-col items-center text-slate-300">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="hover:text-[#2563EB] disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => move(i, 1)} disabled={i === stages.length - 1} className="hover:text-[#2563EB] disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <input className="col-span-11 sm:col-span-4" value={s.name} onChange={e => setStage(i, { name: e.target.value })} placeholder="Stage name" />
                    <div className="col-span-7 sm:col-span-3 flex items-center gap-1">
                      {SWATCHES.map(c => (
                        <button key={c} onClick={() => setStage(i, { color: c })} className="w-5 h-5 rounded-full border border-white shadow-sm flex items-center justify-center" style={{ backgroundColor: c }}>
                          {s.color === c && <Check className="w-3 h-3 text-white" />}
                        </button>
                      ))}
                    </div>
                    <select className="col-span-4 sm:col-span-2 !text-sm" value={s.type} onChange={e => setStage(i, { type: e.target.value as ProcessStage['type'] })}>
                      {TYPE_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className="col-span-1 flex justify-center text-slate-400 hover:text-[#2563EB]" onClick={() => setOpenStage(open ? -1 : i)} title="Rules & automations">
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {ruleCount > 0 && !open && <span className="text-[10px] font-bold text-[#2563EB]">{ruleCount}</span>}
                    </button>
                    <button className="col-span-1 text-slate-400 hover:text-red-500 flex justify-center" onClick={() => removeStage(i)} disabled={stages.length === 1}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {open && (
                    <div className="border-t border-slate-100 p-3 space-y-4 bg-slate-50/50 rounded-b-xl">
                      {/* Required fields */}
                      <div>
                        <label className="mono-label block mb-1.5">Required to enter this stage</label>
                        <input
                          value={(s.requiredFields || []).join(', ')}
                          onChange={e => setRequired(i, e.target.value)}
                          placeholder="comma-separated field names, e.g. value, docUrl"
                        />
                        <p className="text-[11px] text-ink-muted mt-1">A record can't move here until these fields are filled.</p>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer select-none">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#2563EB]"
                          checked={!!s.requireNote} onChange={e => setStage(i, { requireNote: e.target.checked })} />
                        Require a note/reason when moving into this stage
                        <span className="text-[11px] text-ink-muted">(e.g. "Lost reason")</span>
                      </label>

                      {/* Entry actions */}
                      <div>
                        <label className="mono-label block mb-1.5 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Automations on entering</label>
                        <div className="space-y-2">
                          {(s.entryActions || []).map((a: any, ai: number) => (
                            <div key={ai} className="bg-white border border-slate-200 rounded-lg p-2.5">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="status-pill status-blue">{a.type.replace('_', ' ')}</span>
                                <button onClick={() => removeAction(i, ai)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                              {a.type === 'create_task' && (
                                <input value={a.subject || ''} onChange={e => setAction(i, ai, { subject: e.target.value })} placeholder="Task subject (use {firstName}, {company}…)" className="!text-sm" />
                              )}
                              {a.type === 'email' && (
                                <div className="space-y-1.5">
                                  <input value={a.to || ''} onChange={e => setAction(i, ai, { to: e.target.value })} placeholder="To (e.g. {email})" className="!text-sm" />
                                  <input value={a.subject || ''} onChange={e => setAction(i, ai, { subject: e.target.value })} placeholder="Subject" className="!text-sm" />
                                  <textarea value={a.body || ''} onChange={e => setAction(i, ai, { body: e.target.value })} rows={2} placeholder="Body (use {firstName}…)" className="!text-sm" />
                                </div>
                              )}
                              {a.type === 'webhook' && (
                                <input value={a.url || ''} onChange={e => setAction(i, ai, { url: e.target.value })} placeholder="https://your-endpoint.com/hook" className="!text-sm" />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          <button onClick={() => addAction(i, 'create_task')} className="text-xs font-semibold text-[#2563EB] hover:text-[#1E40AF] flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Task</button>
                          <button onClick={() => addAction(i, 'email')} className="text-xs font-semibold text-[#2563EB] hover:text-[#1E40AF] flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Email</button>
                          <button onClick={() => addAction(i, 'webhook')} className="text-xs font-semibold text-[#2563EB] hover:text-[#1E40AF] flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Webhook</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            <button onClick={addStage} className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:text-[#1E40AF]">
              <Plus className="w-4 h-4" /> Add stage
            </button>
          </div>

          <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-[#2563EB]/8 border border-[#2563EB]/20 text-[#1E40AF] text-xs">
            <GripVertical className="w-4 h-4 shrink-0 mt-0.5" />
            <span><strong>Type</strong> drives semantics: <em>won</em> stages count as closed-won in reporting, <em>lost</em> as closed-lost, <em>open</em> as in-progress. Per-stage required fields & automations are coming next.</span>
          </div>
        </div>
      )}
    </div>
  );
};
