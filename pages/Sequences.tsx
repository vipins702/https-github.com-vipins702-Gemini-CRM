import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../components/ui/Toast';
import { Mail, Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, CheckCircle, Clock, AlignLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface Step {
  id: string;
  delay_days: number;
  type: 'email' | 'task';
  subject?: string;
  body?: string;
  task_subject?: string;
  task_priority?: string;
}

interface Sequence {
  id?: string;
  name: string;
  entity_type: string;
  steps: Step[];
  is_active: boolean;
}

const BLANK_SEQ: Sequence = { name: '', entity_type: 'lead', steps: [], is_active: true };
const BLANK_STEP: Step = { id: crypto.randomUUID?.() ?? String(Date.now()), delay_days: 1, type: 'email', subject: '', body: '' };

const getToken = () => {
  try { return JSON.parse(localStorage.getItem('flowcrm_session') || '{}').token || ''; } catch { return ''; }
};
const auth = () => ({ headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' } });

export const Sequences: React.FC = () => {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Sequence | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { addToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sequences', auth());
      setSequences(await res.json());
    } catch { addToast('Failed to load sequences', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.name) { addToast('Sequence name required', 'error'); return; }
    if (editing.steps.length === 0) { addToast('Add at least one step', 'error'); return; }
    try {
      const res = await fetch('/api/sequences', { method: 'POST', ...auth(), body: JSON.stringify(editing) });
      if (!res.ok) throw new Error((await res.json()).error);
      addToast('Sequence saved!', 'success');
      setEditing(null);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this sequence? All active enrollments will be cancelled.')) return;
    await fetch(`/api/sequences/${id}`, { method: 'DELETE', ...auth() });
    addToast('Deleted', 'success');
    load();
  };

  const addStep = () => {
    if (!editing) return;
    const prevDelay = editing.steps.length ? editing.steps[editing.steps.length - 1].delay_days : 0;
    setEditing(p => ({
      ...p!,
      steps: [...p!.steps, { ...BLANK_STEP, id: String(Date.now()), delay_days: prevDelay + 1 }],
    }));
  };

  const updateStep = (idx: number, key: string, val: any) => {
    setEditing(p => ({
      ...p!,
      steps: p!.steps.map((s, i) => i === idx ? { ...s, [key]: val } : s),
    }));
  };

  const removeStep = (idx: number) => {
    setEditing(p => ({ ...p!, steps: p!.steps.filter((_, i) => i !== idx) }));
  };

  if (editing) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-surface border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-slate-900">
              {editing.id ? 'Edit Sequence' : 'New Drip Sequence'}
            </h1>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" onClick={save}>Save Sequence</Button>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
          {/* Meta */}
          <div className="bg-surface rounded-xl border border-slate-200 p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Sequence Name</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                placeholder="e.g. 7-Day Lead Nurture"
                value={editing.name}
                onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">For Entity Type</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={editing.entity_type}
                onChange={e => setEditing(p => ({ ...p!, entity_type: e.target.value }))}
              >
                <option value="lead">Lead</option>
                <option value="customer">Customer</option>
              </select>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {editing.steps.length === 0 && (
              <div className="bg-surface rounded-xl border border-dashed border-slate-300 p-10 text-center">
                <Mail className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500 font-medium">No steps yet</p>
                <p className="text-slate-400 text-sm">Add your first email or task step below</p>
              </div>
            )}

            {editing.steps.map((step, idx) => (
              <div key={step.id} className="bg-surface rounded-xl border border-slate-200 p-6 relative">
                {/* Step header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${step.type === 'email' ? 'bg-indigo-500' : 'bg-amber-500'}`}>
                    {idx + 1}
                  </div>
                  <select
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    value={step.type}
                    onChange={e => updateStep(idx, 'type', e.target.value)}
                  >
                    <option value="email">📧 Email</option>
                    <option value="task">✅ Task</option>
                  </select>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-500">Send on Day</span>
                    <input
                      type="number"
                      min={0}
                      className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-sm text-center"
                      value={step.delay_days}
                      onChange={e => updateStep(idx, 'delay_days', Number(e.target.value))}
                    />
                  </div>
                  <button onClick={() => removeStep(idx)} className="ml-auto p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {step.type === 'email' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Email Subject</label>
                      <input
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        placeholder="e.g. Quick follow-up, {firstName}"
                        value={step.subject || ''}
                        onChange={e => updateStep(idx, 'subject', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Body <span className="text-slate-400 normal-case font-normal">(use {'{firstName}'}, {'{company}'}, etc.)</span>
                      </label>
                      <textarea
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 resize-none"
                        rows={4}
                        placeholder="Hi {firstName},&#10;&#10;Just following up on your enquiry..."
                        value={step.body || ''}
                        onChange={e => updateStep(idx, 'body', e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Task Subject</label>
                      <input
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        placeholder="e.g. Call {firstName} for follow-up"
                        value={step.task_subject || ''}
                        onChange={e => updateStep(idx, 'task_subject', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Priority</label>
                      <select
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        value={step.task_priority || 'Medium'}
                        onChange={e => updateStep(idx, 'task_priority', e.target.value)}
                      >
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={addStep}
              className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all font-medium text-sm"
            >
              <Plus className="w-4 h-4" /> Add Step
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-surface border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Drip Sequences</h1>
              <p className="text-sm text-slate-500">Automated email & task follow-up journeys</p>
            </div>
          </div>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing({ ...BLANK_SEQ })}>
            New Sequence
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading sequences…</div>
        ) : sequences.length === 0 ? (
          <div className="bg-surface rounded-xl border border-dashed border-slate-300 p-16 text-center">
            <Mail className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-600 font-semibold text-lg">No drip sequences yet</p>
            <p className="text-slate-400 text-sm mt-1 mb-6">Create a sequence to automatically follow up with leads over multiple days</p>
            <Button variant="primary" onClick={() => setEditing({ ...BLANK_SEQ })}>Create First Sequence</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sequences.map(seq => (
              <div key={seq.id} className="bg-surface rounded-xl border border-slate-200 overflow-hidden">
                <div
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === seq.id ? null : seq.id!)}
                >
                  {expandedId === seq.id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{seq.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {seq.steps.length} steps · {seq.entity_type} ·{' '}
                      {seq.steps.length > 0 ? `up to day ${Math.max(...seq.steps.map(s => s.delay_days))}` : 'no steps'}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setEditing({ ...seq }); }}
                    className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
                  >Edit</button>
                  <button onClick={e => { e.stopPropagation(); del(seq.id!); }} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {expandedId === seq.id && (
                  <div className="border-t border-slate-100 px-12 py-4">
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {seq.steps.map((step, idx) => (
                        <div key={step.id} className="shrink-0 bg-slate-50 rounded-xl border border-slate-200 p-4 w-52">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${step.type === 'email' ? 'bg-indigo-500' : 'bg-amber-500'}`}>
                              {idx + 1}
                            </div>
                            <span className="text-xs font-semibold text-slate-600 capitalize">{step.type}</span>
                            <span className="ml-auto text-xs text-slate-400">Day {step.delay_days}</span>
                          </div>
                          <p className="text-xs text-slate-700 font-medium truncate">
                            {step.type === 'email' ? step.subject : step.task_subject}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
