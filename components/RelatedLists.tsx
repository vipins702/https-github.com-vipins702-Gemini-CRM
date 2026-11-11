import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from './ui/Card';
import { api } from '../services/api';
import { can, fieldAccess } from '../services/permissions';
import { formatFieldValue } from '../services/fieldFormat';
import { Badge } from './ui/Badge';
import { CRMRecord, EntityDefinition, FieldDefinition } from '../types';

/**
 * "Related" lists on a record's page: every record type that links back through a Lookup field is listed
 * (a Project page lists its Units and Deliverables, a Client page lists its Projects). Nothing to configure:
 * add a Lookup field to the child type and the list appears. Each user sees only the child records their
 * role and record scope allow.
 */
interface Props {
  entityType: string;
  recordId: string;
  onNavigate?: (view: string, params?: any) => void;
  /** Types already shown elsewhere on the page. */
  skip?: string[];
}

const MAX_ROWS = 8;

export const RelatedLists: React.FC<Props> = ({ entityType, recordId, onNavigate, skip = [] }) => {
  const [groups, setGroups] = useState<{ schema: EntityDefinition; via: FieldDefinition; rows: CRMRecord[] }[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const schemas = await api.getSchemas();
        const kids = (Object.values(schemas || {}) as EntityDefinition[]).filter(e => e.id !== entityType && !skip.includes(e.id) && can(e.id, 'read'));
        const out: { schema: EntityDefinition; via: FieldDefinition; rows: CRMRecord[] }[] = [];
        await Promise.all(kids.map(async (schema) => {
          const links = schema.fields.filter(f => f.type === 'lookup' && f.lookupTarget === entityType);
          if (!links.length) return;
          const all = await api.getRecords(schema.id).catch(() => [] as CRMRecord[]);
          for (const via of links) {
            const rows = all.filter(r => r[via.name] === recordId);
            if (rows.length) out.push({ schema, via, rows });
          }
        }));
        out.sort((a, b) => a.schema.label.localeCompare(b.schema.label));
        if (live) setGroups(out);
      } catch { if (live) setGroups([]); }
    })();
    return () => { live = false; };
  }, [entityType, recordId]);

  if (!groups.length) return null;
  return (
    <>
      {groups.map(({ schema, via, rows }) => {
        const shown = schema.fields
          .filter(f => f.name !== via.name && f.type !== 'lookup' && !['image', 'iframe', 'attachment', 'textarea', 'multiselect'].includes(f.type) && fieldAccess(schema.id, f.name).read)
          .slice(0, 4);
        return (
          <Card key={`${schema.id}:${via.name}`} title={`${schema.pluralLabel || schema.label} · ${rows.length}`} subtitle={groups.filter(g => g.schema.id === schema.id).length > 1 ? `via ${via.label}` : undefined} noPadding>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {shown.map(f => <th key={f.name} className="px-4 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{f.label}</th>)}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.slice(0, MAX_ROWS).map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onNavigate?.(schema.id, { editId: r.id })}>
                      {shown.map((f, i) => (
                        <td key={f.name} className={`px-4 py-2.5 whitespace-nowrap ${i === 0 ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                          {f.type === 'status' ? <Badge status={r[f.name]} variant="dot" /> : (formatFieldValue(f, r[f.name]) || <span className="text-gray-300">—</span>)}
                        </td>
                      ))}
                      <td className="pr-3 text-gray-300"><ChevronRight className="w-4 h-4" aria-hidden="true" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > MAX_ROWS && (
              <button className="w-full py-2.5 text-xs font-semibold text-accent hover:bg-gray-50 border-t border-gray-100" onClick={() => onNavigate?.(schema.id)}>
                See all {rows.length} in {schema.pluralLabel || schema.label}
              </button>
            )}
          </Card>
        );
      })}
    </>
  );
};
