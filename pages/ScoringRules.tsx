import React, { useState, useEffect } from 'react';
import { useToast } from '../components/ui/Toast';
import { Star, Plus, Trash2, ToggleLeft, ToggleRight, Zap, HelpCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface ScoringRule {
  id?: string;
  name: string;
  field: string;
  operator: string;
  value: string;
  points: number;
  is_active: boolean;
}

const LEAD_FIELDS = [
  'source', 'status', 'score', 'industry', 'company', 'email', 'phone',
  'firstName', 'lastName', 'website', 'location', 'notes',
];

const OPERATORS = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
];

const BLANK_RULE: ScoringRule = { name: '', field: 'source', operator: '==', value: '', points: 10, is_active: true };

const getToken = () => {
  try { return JSON.parse(localStorage.getItem('flowcrm_session') || '{}').token || ''; } catch { return ''; }
};
const auth = () => ({ headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' } });

export const ScoringRules: React.FC = () => {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScoringRule>(BLANK_RULE);
  const { addToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scoring-rules', auth());
      setRules(await res.json());
    } catch { addToast('Failed to load scoring rules', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.name || !editing.field || !editing.operator) {
      addToast('Name, field and operator are required', 'error');
      return;
    }
    try {
      const res = await fetch('/api/scoring-rules', {
        method: 'POST',
        ...auth(),
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      addToast('Rule saved!', 'success');
      setShowForm(false);
      setEditing(BLANK_RULE);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this scoring rule?')) return;
    await fetch(`/api/scoring-rules/${id}`, { method: 'DELETE', ...auth() });
    addToast('Rule deleted', 'success');
    load();
  };

  const toggle = async (rule: ScoringRule) => {
    await fetch('/api/scoring-rules', {
      method: 'POST',
      ...auth(),
      body: JSON.stringify({ ...rule, is_active: !rule.is_active }),
    });
    load();
  };

  const needsValue = !['is_empty', 'is_not_empty'].includes(editing.operator);
  const totalMax = rules.filter(r => r.is_active && r.points > 0).reduce((s, r) => s + r.points, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-surface border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">Lead Scoring Rules</h1>
                <p className="text-sm text-slate-500">
                  {rules.filter(r => r.is_active).length} active rules · max possible score: <strong>{totalMax}</strong>
                </p>
              </div>
            </div>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(BLANK_RULE); setShowForm(true); }}>
              Add Rule
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
          <HelpCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <strong>How it works:</strong> When a lead is created or updated, all active rules are evaluated. Matching rules add/subtract points. Score is clamped to <strong>0–100</strong>. Rules fire on manual creation, CSV import, and webhook capture.
          </div>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-surface rounded-xl border border-indigo-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-800 mb-4">{editing.id ? 'Edit Rule' : 'New Scoring Rule'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Rule Name</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  placeholder="e.g. Website lead +20"
                  value={editing.name}
                  onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Points (+ or -)</label>
                <input
                  type="number"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  value={editing.points}
                  onChange={e => setEditing(p => ({ ...p, points: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Field</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  value={editing.field}
                  onChange={e => setEditing(p => ({ ...p, field: e.target.value }))}
                >
                  {LEAD_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Operator</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  value={editing.operator}
                  onChange={e => setEditing(p => ({ ...p, operator: e.target.value }))}
                >
                  {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>
              </div>
              {needsValue && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Value</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    placeholder="e.g. Website"
                    value={editing.value}
                    onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="primary" onClick={save}>Save Rule</Button>
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(BLANK_RULE); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Rules List */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading rules…</div>
        ) : rules.length === 0 ? (
          <div className="bg-surface rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <Star className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">No scoring rules yet</p>
            <p className="text-slate-400 text-sm mt-1">Add your first rule to auto-score incoming leads</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-slate-200 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400">Rule</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400">Condition</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400">Points</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400">Active</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map(rule => (
                  <tr key={rule.id} className={`hover:bg-slate-50 transition-colors ${!rule.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-800 text-sm">{rule.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{rule.field}</code>{' '}
                      <span className="text-slate-400">{OPERATORS.find(o => o.value === rule.operator)?.label}</span>{' '}
                      {rule.value && <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">"{rule.value}"</code>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold text-sm ${rule.points > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {rule.points > 0 ? '+' : ''}{rule.points}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggle(rule)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                        {rule.is_active
                          ? <ToggleRight className="w-6 h-6 text-indigo-600" />
                          : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 flex gap-2 justify-end">
                      <button
                        onClick={() => { setEditing({ ...rule }); setShowForm(true); }}
                        className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-500"
                        title="Edit"
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => del(rule.id!)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
