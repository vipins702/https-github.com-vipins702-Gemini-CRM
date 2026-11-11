import React, { useEffect, useState } from 'react';
import { Card } from './ui/Card';
import { api } from '../services/api';
import { fieldAccess } from '../services/permissions';
import { formatCurrency } from '../services/currency';
import { EntityDefinition, FieldDefinition, LayoutDefinition, LayoutFieldConfig, VisibilityRule } from '../types';

/**
 * The record's detail view, drawn from the SAME layout as the edit form (Form Designer), so a field
 * added there shows up here too. A field is left out when the layout hides it, marks it "form only",
 * its visibility rule does not match, or this user's role may not read it.
 */

export const isVisible = (rule: VisibilityRule | undefined, record: Record<string, any>): boolean => {
  if (!rule || !rule.field) return true;
  const v = record[rule.field];
  const t = rule.value;
  switch (rule.operator) {
    case '==': return String(v ?? '') === String(t ?? '');
    case '!=': return String(v ?? '') !== String(t ?? '');
    case '>': return Number(v) > Number(t);
    case '<': return Number(v) < Number(t);
    case 'contains': return String(v ?? '').toLowerCase().includes(String(t ?? '').toLowerCase());
    default: return true;
  }
};

/** Should this field appear on the given surface? */
export const showsOn = (cfg: LayoutFieldConfig | undefined, where: 'form' | 'detail', record: Record<string, any>) =>
  !cfg?.hidden && (cfg?.showOn || 'both') !== (where === 'form' ? 'detail' : 'form') && isVisible(cfg?.visibilityRule, record);

const Value: React.FC<{ field: FieldDefinition; value: any; record: Record<string, any> }> = ({ field, value, record }) => {
  if (value === undefined || value === null || value === '') return <span className="text-gray-400">—</span>;
  switch (field.type) {
    case 'currency': return <span className="tabular">{formatCurrency(value, record.currency)}</span>;
    case 'number': case 'formula': return <span className="tabular">{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>;
    case 'email': return <a className="text-accent hover:underline" href={`mailto:${value}`}>{String(value)}</a>;
    case 'phone': return <a className="text-accent hover:underline" href={`tel:${value}`}>{String(value)}</a>;
    case 'url': {
      const href = /^https?:\/\//i.test(String(value)) ? String(value) : `https://${value}`;
      return <a className="text-accent hover:underline break-all" href={href} target="_blank" rel="noopener noreferrer">{String(value)}</a>;
    }
    case 'date': {
      const d = new Date(value);
      return <>{Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()}</>;
    }
    case 'image': return <img src={String(value)} alt="" className="w-16 h-16 rounded-lg object-cover" />;
    case 'cascade': return <>{[value, record.subcategory].filter(Boolean).join(' › ')}</>;
    case 'textarea': return <span className="whitespace-pre-wrap">{String(value)}</span>;
    default: return <>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</>;
  }
};

interface Props {
  entityType: string;
  record: Record<string, any>;
  /** Fields already shown elsewhere on the page (header, contact card) — skipped here. */
  skip?: string[];
}

export const LayoutDetails: React.FC<Props> = ({ entityType, record, skip = [] }) => {
  const [schema, setSchema] = useState<EntityDefinition | null>(null);
  const [layout, setLayout] = useState<LayoutDefinition | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.getSchemas(), api.getLayout(entityType).catch(() => null)])
      .then(([schemas, lay]) => { if (live) { setSchema(schemas?.[entityType] || null); setLayout(lay); } })
      .catch(() => {});
    return () => { live = false; };
  }, [entityType]);

  if (!schema) return null;
  const byName = new Map(schema.fields.map(f => [f.name, f]));
  const skipSet = new Set(skip);
  // No usable layout (none saved, or no fields placed yet): one section with every field, in schema order.
  const sections = layout?.sections?.some(s => s.columns?.some(c => c.fields?.length))
    ? layout.sections
    : [{ id: 'all', title: 'Details', columns: [{ id: 'c', width: 12, fields: schema.fields.map(f => f.name) }] }];

  const drawn = sections.map(section => {
    const rows = section.columns.flatMap(col => col.fields)
      .map(name => byName.get(name))
      .filter((f): f is FieldDefinition => !!f && !skipSet.has(f.name) && f.type !== 'iframe' && f.type !== 'attachment')
      .filter(f => showsOn(layout?.fieldConfigs?.[f.name], 'detail', record) && fieldAccess(entityType, f.name).read);
    return { section, rows };
  }).filter(x => x.rows.length);

  if (!drawn.length) return null;
  return (
    <>
      {drawn.map(({ section, rows }) => (
        <Card key={section.id} title={section.title || 'Details'}>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {rows.map(f => (
              <div key={f.name} className={`min-w-0 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                <dt className="text-xs font-medium text-gray-500">{layout?.fieldConfigs?.[f.name]?.labelOverride || f.label}</dt>
                <dd className="mt-0.5 text-sm text-gray-900 break-words"><Value field={f} value={record[f.name]} record={record} /></dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </>
  );
};
