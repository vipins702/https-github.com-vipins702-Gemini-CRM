import React from 'react';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';

// Field mapping: "set THIS field to THAT". Used by journey steps (update a record, create a record) and by
// Field Triggers. Each row picks a target field and where its value comes from:
//   a value        typed, or chosen from the field's choices (a lookup saves its code, you pick the label)
//   another field  copied from the record that started it            → stored as {fieldName}
//   a date         today, or today plus / minus a number of days     → stored as {today}, {today+3}, {today-7}
// The stored form is plain text with {tokens}, the same text the server fills in (server/services/tokens.js).

export type MapOption = string | { value: string; label: string };
export interface MapField { name: string; label: string; type?: string; options?: MapOption[] }
export interface Mapping { field: string; value: string }

type Mode = 'value' | 'field' | 'date';
const FIELD_RE = /^\{([A-Za-z_]\w*)\}$/;
const DATE_RE = /^\{today(?:([+-])(\d{1,5}))?\}$/;

const modeOf = (v: string, sources: MapField[]): Mode => {
  if (DATE_RE.test(v)) return 'date';
  const m = FIELD_RE.exec(v);
  return m && m[1] !== 'now' && sources.some(s => s.name === m[1]) ? 'field' : 'value';
};

const sel = 'h-9 rounded-lg border border-gray-200 bg-surface px-2 text-sm text-gray-900 min-w-0 w-full';

interface Props {
  value: Mapping[];
  onChange: (rows: Mapping[]) => void;
  /** Fields that can be set. */
  targets: MapField[];
  /** Fields of the record that started it, offered for "copy from". */
  sources: MapField[];
  /** Narrow panels stack each row. */
  compact?: boolean;
  addLabel?: string;
}

export const FieldMapper: React.FC<Props> = ({ value, onChange, targets, sources, compact, addLabel = 'Add field' }) => {
  const set = (i: number, patch: Partial<Mapping>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const used = new Set(value.map(r => r.field));

  return (
    <div className="space-y-2">
      {value.map((row, i) => {
        const target = targets.find(t => t.name === row.field);
        const mode = modeOf(row.value, sources);
        const dm = DATE_RE.exec(row.value);
        const days = dm?.[2] ? Number(dm[2]) * (dm[1] === '-' ? -1 : 1) : 0;
        const isDate = target?.type === 'date' || target?.type === 'datetime';
        return (
          <div key={i} className={`rounded-lg border border-gray-200 bg-gray-50/60 p-2 grid gap-1.5 items-center ${compact ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_8.5rem_minmax(0,1fr)_auto]'}`}>
            <select aria-label="Field to set" className={sel} value={row.field} onChange={e => set(i, { field: e.target.value, value: '' })}>
              <option value="">Field to set…</option>
              {targets.map(t => <option key={t.name} value={t.name} disabled={used.has(t.name) && t.name !== row.field}>{t.label}</option>)}
            </select>
            {!compact && <ArrowLeft className="hidden md:block w-4 h-4 text-gray-400" aria-hidden="true" />}
            <button type="button" aria-label="Remove this field" onClick={() => onChange(value.filter((_, j) => j !== i))} className={`p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 ${compact ? '' : 'md:order-last'}`}><Trash2 className="w-4 h-4" /></button>
            <select aria-label="Where the value comes from" className={`${sel} ${compact ? 'col-span-2' : 'col-span-2 md:col-span-1'}`} value={mode}
              onChange={e => set(i, { value: e.target.value === 'field' ? (sources[0] ? `{${sources[0].name}}` : '') : e.target.value === 'date' ? '{today}' : '' })}>
              <option value="value">a value</option>
              <option value="field" disabled={!sources.length}>copy a field</option>
              <option value="date">a date</option>
            </select>
            <div className={compact ? 'col-span-2' : 'col-span-2 md:col-span-1'}>
              {mode === 'field' ? (
                <select aria-label="Field to copy" className={sel} value={FIELD_RE.exec(row.value)?.[1] || ''} onChange={e => set(i, { value: `{${e.target.value}}` })}>
                  {sources.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
                </select>
              ) : mode === 'date' ? (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <span className="shrink-0">today</span>
                  <select aria-label="Before or after today" className={`${sel} !w-20`} value={days < 0 ? '-' : '+'} onChange={e => { const n = Math.abs(days); set(i, { value: n ? `{today${e.target.value}${n}}` : '{today}' }); }}>
                    <option value="+">plus</option>
                    <option value="-">minus</option>
                  </select>
                  <input aria-label="Days" type="number" min={0} max={9999} className={`${sel} !w-20`} value={Math.abs(days)} onChange={e => { const n = Math.max(0, Math.min(9999, Number(e.target.value) || 0)); set(i, { value: n ? `{today${days < 0 ? '-' : '+'}${n}}` : '{today}' }); }} />
                  <span className="shrink-0">days</span>
                </div>
              ) : target?.options?.length ? (
                <select aria-label="Value" className={sel} value={row.value} onChange={e => set(i, { value: e.target.value })}>
                  <option value="">Choose…</option>
                  {target.options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input aria-label="Value" className={sel} type={isDate ? 'date' : target?.type === 'number' || target?.type === 'currency' || target?.type === 'percent' ? 'number' : 'text'} value={row.value} placeholder="Value (text may include {field})" onChange={e => set(i, { value: e.target.value })} />
              )}
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...value, { field: '', value: '' }])} className="text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" />{addLabel}</button>
    </div>
  );
};

/** { status: 'Won' } ⇄ [{ field: 'status', value: 'Won' }] (journeys store the object form). */
export const toRows = (fields: Record<string, any> | undefined): Mapping[] => Object.entries(fields || {}).map(([field, value]) => ({ field, value: String(value ?? '') }));
export const toObject = (rows: Mapping[]): Record<string, string> => Object.fromEntries(rows.map(r => [r.field, r.value]));
