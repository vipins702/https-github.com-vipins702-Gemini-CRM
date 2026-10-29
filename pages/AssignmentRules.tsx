import React, { useState, useEffect } from 'react';
import { useToast } from '../components/ui/Toast';
import { Users, Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface AssignmentRule {
  id?: string;
  name: string;
  conditions: { match: 'all' | 'any'; rules: { field: string; operator: string; value: string }[] };
  assign_to: string;
  mode: 'specific' | 'round_robin';
  priority: number;
  is_active: boolean;
}

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const LEAD_FIELDS = ['source', 'status', 'industry', 'company', 'location', 'phone', 'email', 'score'];
const OPERATORS = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
];

const BLANK_RULE: AssignmentRule = {
  name: '',
  conditions: { match: 'all', rules: [{ field: 'source', operator: '==', value: '' }] },
  assign_to: '',
  mode: 'specific',
  priority: 0,
  is_active: true,
};

const getToken = () => {
  try { return JSON.parse(localStorage.getItem('flowcrm_session') || '{}').token || ''; } catch { return ''; }
};
const auth = () => ({ headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' } });

export const AssignmentRules: React.FC = () => {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssignmentRule>(BLANK_RULE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { addToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [rulesRes, usersRes] = await Promise.all([
        fetch('/api/assignment-rules', auth()),
        fetch('/api/users', auth()),
      ]);
      setRules(await rulesRes.json());
      setUsers(await usersRes.json());
    } catch { addToast('Failed to load data', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.name) { addToast('Rule name is required', 'error'); return; }
    if (editing.mode === 'specific' && !editing.assign_to) { addToast('Select a user to assign to', 'error'); return; }
    try {
      const res = await fetch('/api/assignment-rules', {
        method: 'POST', ...auth(),
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
    if (!confirm('Delete this rule?')) return;
    await fetch(`/api/assignment-rules/${id}`, { method: 'DELETE', ...auth() });
    addToast('Deleted', 'success');
    load();
  };

  const toggle = async (rule: AssignmentRule) => {
    await fetch('/api/assignment-rules', { method: 'POST', ...auth(), body: JSON.stringify({ ...rule, is_active: !rule.is_active }) });
    load();
  };

  const addCondition = () => setEditing(p => ({
    ...p, conditions: { ...p.conditions, rules: [...p.conditions.rules, { field: 'source', operator: '==', value: '' }] },
  }));
  const removeCondition = (i: number) => setEditing(p => ({
    ...p, conditions: { ...p.conditions, rules: p.conditions.rules.filter((_, idx) => idx !== i) },
  }));
  const updateCondition = (i: number, key: string, val: string) => setEditing(p => ({
    ...p, conditions: {
      ...p.conditions,
      rules: p.conditions.rules.map((r, idx) => idx === i ? { ...r, [key]: val } : r),
    },
  }));

  const userName = (id: string) => {
    const u = users.find(u => u.id === id);
    return u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : id;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Assignment Rules</h1>
              <p className="text-sm text-slate-500">Auto-route incoming leads to the right sales rep</p>
            </div>
          </div>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(BLANK_RULE); setShowForm(true); }}>
            New Rule
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {/* How it works */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-800">
            Rules are evaluated in <strong>priority order</strong> when a lead is created. The first matching rule wins. If no rule matches, global round-robin applies across all active users.
          </p>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-800">{editing.id ? 'Edit Rule' : 'New Assignment Rule'}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Rule Name</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  value={editing.name}
                  onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Website leads → Alice"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Priority (higher = first)</label>
                <input
                  type="number"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  value={editing.priority}
                  onChange={e => setEditing(p => ({ ...p, priority: Number(e.target.value) }))}
                />
              </div>
            </div>

            {/* Conditions */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Match</label>
                <select
                  className="border border-slate-300 rounded-lg px-2 py-1 text-sm"
                  value={editing.conditions.match}
                  onChange={e => setEditing(p => ({ ...p, conditions: { ...p.conditions, match: e.target.value as any } }))}
                >
                  <option value="all">ALL conditions</option>
                  <option value="any">ANY condition</option>
                </select>
              </div>
              <div className="space-y-2">
                {editing.conditions.rules.map((cond, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                      value={cond.field}
                      onChange={e => updateCondition(i, 'field', e.target.value)}
                    >
                      {LEAD_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <select
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                      value={cond.operator}
                      onChange={e => updateCondition(i, 'operator', e.target.value)}
                    >
                      {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                    {!['is_empty', 'is_not_empty'].includes(cond.operator) && (
                      <input
                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0"
                        placeholder="value"
                        value={cond.value}
                        onChange={e => updateCondition(i, 'value', e.target.value)}
                      />
                    )}
                    {editing.conditions.rules.length > 1 && (
                      <button onClick={() => removeCondition(i)} className="p-1 text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={addCondition} className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Condition
              </button>
            </div>

            {/* Assign to */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Assignment Mode</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={editing.mode}
                  onChange={e => setEditing(p => ({ ...p, mode: e.target.value as any }))}
                >
                  <option value="specific">Specific User</option>
                  <option value="round_robin">Round Robin (all active users)</option>
                </select>
              </div>
              {editing.mode === 'specific' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Assign To</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    value={editing.assign_to}
                    onChange={e => setEditing(p => ({ ...p, assign_to: e.target.value }))}
                  >
                    <option value="">— Select User —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="primary" onClick={save}>Save Rule</Button>
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(BLANK_RULE); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Rules List */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">No assignment rules yet</p>
            <p className="text-slate-400 text-sm mt-1">Default: round-robin across all active users</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).map(rule => (
              <div key={rule.id} className={`${!rule.is_active ? 'opacity-50' : ''}`}>
                <div
                  className="flex items-center gap-4 px-4 py-4 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id!)}
                >
                  {expandedId === rule.id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{rule.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Priority {rule.priority} ·{' '}
                      {rule.mode === 'round_robin' ? 'Round Robin' : `→ ${userName(rule.assign_to)}`}
                    </p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); toggle(rule); }} className="text-slate-400 hover:text-indigo-600">
                    {rule.is_active ? <ToggleRight className="w-6 h-6 text-indigo-600" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setEditing({ ...rule }); setShowForm(true); }}
                    className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
                  >Edit</button>
                  <button onClick={e => { e.stopPropagation(); del(rule.id!); }} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {expandedId === rule.id && (
                  <div className="px-12 pb-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Match {rule.conditions?.match?.toUpperCase()} of:
                    </p>
                    {(rule.conditions?.rules || []).map((c, i) => (
                      <div key={i} className="flex gap-2 items-center mb-1">
                        <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">{c.field}</code>
                        <span className="text-xs text-slate-400">{OPERATORS.find(o => o.value === c.operator)?.label}</span>
                        {c.value && <code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">"{c.value}"</code>}
                      </div>
                    ))}
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
