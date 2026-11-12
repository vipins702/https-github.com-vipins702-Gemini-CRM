// Lookup fields store a CODE, never the words people read:
//   a list of values (Lookup Manager)  →  the code, e.g. 10001  (shown as "Credit Card")
//   a link to another record           →  that record's id      (shown as its name)
// This file is the one place that turns codes back into labels, so lists, detail pages, reports, exports,
// messages and imports all say the same thing. The code stays what is saved: renaming a label changes it
// everywhere at once, and conditions keep working because they compare codes.
import db from '../database.js';
import { runTenantQuery } from './sqlSandbox.js';

/** The choices of one lookup: [{ value_id (the code), value (the label), ... }]. Live sources are read fresh. */
export async function lookupOptions(tenantId, lookupId) {
    const live = await db.get('SELECT * FROM lookup_sources WHERE tenant_id = ? AND lookup_id = ? AND is_active = 1', tenantId, lookupId);
    if (live) {
        let rows = [];
        if (live.source_type === 'users') {
            rows = await db.all('SELECT id as value_id, COALESCE(first_name || \' \' || last_name, email) as value FROM users WHERE tenant_id = ?', tenantId);
        } else if (live.source_type === 'records') {
            rows = await db.all('SELECT id as value_id, COALESCE(primary_display, id) as value FROM records WHERE tenant_id = ? AND entity_type = ?', tenantId, live.source_entity);
        } else if (live.source_type === 'sql' && live.sql_query) {
            const sqlRows = await runTenantQuery(tenantId, live.sql_query);
            rows = sqlRows.map(r => ({ value_id: String(r[live.value_field] || r.id || r.value_id), value: String(r[live.label_field] || r.name || r.value || 'Unnamed') }));
        }
        return rows.map((r, i) => ({ id: `live_${i}`, lookup_id: lookupId, value_id: r.value_id, value: r.value, sort_order: i, is_live: true }));
    }
    const own = await db.all('SELECT * FROM lookup_values WHERE tenant_id = ? AND lookup_id = ? AND is_active = 1 ORDER BY sort_order', tenantId, lookupId);
    if (own.length) return own;
    // No list of values and no live source: a Lookup field that links to another record type offers those records.
    const target = await joinTargetOf(tenantId, lookupId);
    if (!target) return own;
    const rows = await db.all('SELECT id, COALESCE(primary_display, id) AS label FROM records WHERE tenant_id = ? AND entity_type = ? ORDER BY primary_display LIMIT 1000', tenantId, target);
    return rows.map((r, i) => ({ id: `live_${i}`, lookup_id: lookupId, value_id: r.id, value: r.label, sort_order: i, is_live: true }));
}

/** "lead_customerId" → "customer": the record type that Lookup field links to (longest matching object name wins). */
async function joinTargetOf(tenantId, lookupId) {
    const rows = await db.all('SELECT entity_type, config FROM entity_definitions WHERE tenant_id = ?', tenantId);
    let best = null;
    for (const r of rows) {
        if (!lookupId.startsWith(r.entity_type + '_') || (best && best.entity_type.length >= r.entity_type.length)) continue;
        let def; try { def = JSON.parse(r.config); } catch { continue; }
        const f = (def.fields || []).find(x => x.type === 'lookup' && x.lookupTarget && x.name === lookupId.slice(r.entity_type.length + 1));
        if (f) best = { entity_type: r.entity_type, target: f.lookupTarget };
    }
    return best?.target || null;
}

/**
 * Code → label for every Lookup field of a record type: { fieldName: Map(code → label) }.
 * A field with no list of its own but a linked record type falls back to the names of that type's records.
 */
export async function labelMapsFor(tenantId, entityType, definition) {
    const out = {};
    for (const f of definition?.fields || []) {
        if (f.type !== 'lookup') continue;
        let opts = [];
        try { opts = await lookupOptions(tenantId, `${entityType}_${f.name}`); } catch { opts = []; }
        let map = new Map(opts.map(o => [String(o.value_id), String(o.value)]));
        if (!map.size && f.lookupTarget) {
            const rows = await db.all('SELECT id, primary_display FROM records WHERE tenant_id = ? AND entity_type = ?', tenantId, f.lookupTarget);
            map = new Map(rows.map(r => [String(r.id), String(r.primary_display || r.id)]));
        }
        out[f.name] = map;
    }
    return out;
}

/** Add `_labels: { field: "Credit Card" }` to each record for the lookup values that have a label. Codes stay as they are. */
export function attachLabels(records, maps) {
    const names = Object.keys(maps || {});
    if (!names.length) return records;
    for (const r of records) {
        let labels = null;
        for (const n of names) {
            const code = r[n];
            if (code === undefined || code === null || code === '') continue;
            const label = maps[n].get(String(code));
            if (label !== undefined && label !== String(code)) (labels || (labels = {}))[n] = label;
        }
        if (labels) r._labels = labels;
    }
    return records;
}

/** For text a person reads (e-mail, WhatsApp, notifications): the record with labels in place of codes. */
export const withLabels = (record) => (record?._labels ? { ...record, ...record._labels } : record);

/** A label someone typed (an import file, a filter) → its code; anything that is already a code or unknown stays as typed. */
export function codeFor(map, typed) {
    if (typed === undefined || typed === null || String(typed).trim() === '' || !map) return typed;
    const t = String(typed).trim();
    if (map.has(t)) return t;
    const lower = t.toLowerCase();
    for (const [code, label] of map) if (label.trim().toLowerCase() === lower) return code;
    return typed;
}
