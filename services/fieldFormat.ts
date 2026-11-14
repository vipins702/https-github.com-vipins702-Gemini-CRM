import { FieldDefinition } from '../types';
import { formatAddress, formatPhone } from './countries';

/** One place that turns a stored value into text, for lists, detail pages and CSV export. */
/** labels: the record's _labels from the server, the words people read for lookup codes (10001 → Credit Card). */
export interface FormatCtx { users?: Record<string, string>; labels?: Record<string, string> }

export const ratingMax = (f: Pick<FieldDefinition, 'max'>) => (Number.isInteger(f.max) && (f.max as number) > 0 ? (f.max as number) : 5);

export function formatFieldValue(field: FieldDefinition, value: any, ctx: FormatCtx = {}): string {
  const empty = value === undefined || value === null || value === '';
  switch (field.type) {
    case 'checkbox': return value === true || value === 'true' ? 'Yes' : 'No';
    case 'multiselect': return Array.isArray(value) ? value.join(', ') : empty ? '' : String(value);
    case 'datetime': {
      if (empty) return '';
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    }
    case 'percent': return empty ? '' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    case 'rating': {
      if (empty) return '';
      const max = ratingMax(field), n = Math.max(0, Math.min(max, Math.round(Number(value))));
      return '★'.repeat(n) + '☆'.repeat(max - n);
    }
    case 'user': return empty ? '' : ctx.users?.[String(value)] || String(value);
    case 'lookup': return empty ? '' : ctx.labels?.[field.name] || String(value);
    case 'address': return formatAddress(value);
    case 'phone': return empty ? '' : formatPhone(value);
    case 'rollup': return empty ? '' : typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value);
    default: return empty ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
