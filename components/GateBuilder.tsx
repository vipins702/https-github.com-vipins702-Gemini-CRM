import React from 'react';
import { Plus, Trash2, FolderPlus } from 'lucide-react';

// AND / OR / NOT condition builder, used by Field Triggers and Journeys. Same shape the server evaluates
// (server/services/conditions.js): groups hold rules and other groups, to any depth up to MAX_DEPTH.

export interface GateRule { type: 'rule'; field: string; operator: string; value?: string }
export interface Gate { type: 'group'; op: 'and' | 'or' | 'not'; children: (GateRule | Gate)[] }
export type GateNode = GateRule | Gate;
export type GateOption = string | { value: string; label: string };
export interface GateField { name: string; label: string; options?: GateOption[] }
export interface GateOperator { v: string; label: string; needsValue: boolean }

export const MAX_DEPTH = 4;
export const emptyGate = (field = ''): Gate => ({ type: 'group', op: 'and', children: [{ type: 'rule', field, operator: '==', value: '' }] });

/** Any saved shape (list of rules + match, { match, rules }, or a gate) → a gate. */
export const toGate = (input: any, match: string = 'all'): Gate => {
  if (input && input.type === 'group') return input as Gate;
  if (input && input.type === 'rule') return { type: 'group', op: 'and', children: [input] };
  const list = Array.isArray(input) ? input : Array.isArray(input?.rules) ? input.rules : [];
  const m = Array.isArray(input) ? match : input?.match;
  return { type: 'group', op: m === 'any' ? 'or' : 'and', children: list.map((r: any) => (r.type === 'group' ? r : { type: 'rule', field: r.field, operator: r.operator, value: r.value })) };
};

export const countRules = (g: GateNode): number => (g.type === 'rule' ? (g.field ? 1 : 0) : g.children.reduce((n, c) => n + countRules(c), 0));

/** One-line summary, e.g. (Budget ≥ 5000000 AND (Source is Referral OR Source is Partner)). */
export const describeGate = (g: GateNode, label: (f: string) => string, op: (o: string) => string): string => {
  if (g.type === 'rule') return `${label(g.field)} ${op(g.operator)}${g.value ? ` "${g.value}"` : ''}`;
  const kids = g.children.map(c => describeGate(c, label, op)).filter(Boolean);
  if (g.op === 'not') return `NOT (${kids.join(' AND ')})`;
  const j = kids.join(g.op === 'or' ? ' OR ' : ' AND ');
  return kids.length > 1 ? `(${j})` : j;
};

const sel = 'h-8 rounded-md border border-gray-200 bg-surface px-1.5 text-xs text-gray-900 min-w-0';

const GROUP_STYLE: Record<Gate['op'], string> = {
  and: 'border-blue-200 bg-blue-50/40',
  or: 'border-amber-200 bg-amber-50/40',
  not: 'border-rose-200 bg-rose-50/40',
};

interface Props {
  value: Gate;
  onChange: (g: Gate) => void;
  fields: GateField[];
  operators: GateOperator[];
  /** Narrow panels: stack the field on its own line and hide the helper text. */
  compact?: boolean;
}

const GroupView: React.FC<Props & { depth: number; onRemove?: () => void }> = ({ value, onChange, fields, operators, depth, onRemove, compact }) => {
  const setChild = (i: number, c: GateNode) => onChange({ ...value, children: value.children.map((x, j) => (j === i ? c : x)) });
  const removeChild = (i: number) => onChange({ ...value, children: value.children.filter((_, j) => j !== i) });
  const addRule = () => onChange({ ...value, children: [...value.children, { type: 'rule', field: '', operator: '==', value: '' }] });
  const addGroup = () => onChange({ ...value, children: [...value.children, { type: 'group', op: 'or', children: [{ type: 'rule', field: '', operator: '==', value: '' }] }] });

  return (
    <div className={`rounded-lg border ${GROUP_STYLE[value.op]} p-2.5 space-y-2`}>
      <div className="flex items-center gap-2">
        <select className={sel} value={value.op} onChange={e => onChange({ ...value, op: e.target.value as Gate['op'] })} aria-label="How the conditions below combine">
          <option value="and">AND: all of these</option>
          <option value="or">OR: any of these</option>
          <option value="not">NOT: not all of these</option>
        </select>
        <span className={`text-[11px] text-gray-500 truncate min-w-0 ${compact ? 'hidden' : 'hidden sm:inline'}`}>
          {value.op === 'and' ? 'passes when every one is true' : value.op === 'or' ? 'passes when at least one is true' : 'passes when they are not all true'}
        </span>
        {onRemove && <button type="button" onClick={onRemove} aria-label="Remove group" className="ml-auto p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>

      {value.children.map((c, i) => c.type === 'group' ? (
        <GroupView key={i} value={c} onChange={g => setChild(i, g)} fields={fields} operators={operators} compact={compact} depth={depth + 1} onRemove={() => removeChild(i)} />
      ) : (
        <div key={i} className={compact ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5' : 'grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto] items-center gap-1.5'}>
          <select className={`${sel} w-full ${compact ? 'col-span-3' : ''}`} value={c.field} onChange={e => setChild(i, { ...c, field: e.target.value, value: '' })}>
            <option value="">— field —</option>
            {fields.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
          </select>
          <select className={`${sel} w-full`} value={c.operator} onChange={e => setChild(i, { ...c, operator: e.target.value })}>
            {operators.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          {operators.find(o => o.v === c.operator)?.needsValue ? (
            (() => {
              const opts = fields.find(f => f.name === c.field)?.options;
              return opts?.length
                ? <select className={`${sel} w-full`} value={c.value ?? ''} onChange={e => setChild(i, { ...c, value: e.target.value })}><option value="">— choose —</option>{opts.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                : <input className={`${sel} w-full`} value={c.value ?? ''} placeholder="value" onChange={e => setChild(i, { ...c, value: e.target.value })} />;
            })()
          ) : <span className={compact ? '' : 'hidden sm:block'} />}
          <button type="button" onClick={() => removeChild(i)} aria-label="Remove condition" className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-0.5">
        <button type="button" onClick={addRule} className="text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" />Condition</button>
        {depth < MAX_DEPTH && <button type="button" onClick={addGroup} className="text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1"><FolderPlus className="w-3 h-3" />Group (AND / OR / NOT)</button>}
      </div>
    </div>
  );
};

export const GateBuilder: React.FC<Props> = (p) => <GroupView {...p} depth={1} />;
