// Field types beyond text / number / select, handled by the server so every way of creating a record
// (forms, imports, journeys) behaves the same.
//
//   multiselect  list of chosen options                      stored as an array
//   checkbox     yes / no                                    stored as true / false
//   datetime     date and time                               stored as text
//   percent      a number shown with %                       stored as a number
//   rating       whole number 0..max (default 5)             stored as a number
//   user         a person of this workspace                  stored as the user id
//   autonumber   UNIT-0001, BKG-2026-0001 ... given once     { prefix, padding } on the field
//   rollup       count / sum / avg / min / max of child records, worked out when read, never stored
//                { rollup: { entity, field, fn, target?, where?: [{ field, value }] } }
//   formula      see fieldRules.js
//
// Any field may also be marked unique: no two records of the type may hold the same value.

export const NEW_TYPES = ['multiselect', 'checkbox', 'datetime', 'percent', 'rating', 'user', 'autonumber', 'rollup'];
export const COMPUTED_TYPES = ['rollup', 'formula'];
const FNS = ['count', 'sum', 'avg', 'min', 'max'];

export async function ensureAutonumberTable(db) {
    await db.exec(`CREATE TABLE IF NOT EXISTS autonumbers (
        tenant_id TEXT NOT NULL, entity_type TEXT NOT NULL, field TEXT NOT NULL, next_value INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (tenant_id, entity_type, field))`);
}

const pad = (n, width) => String(n).padStart(Math.min(Math.max(parseInt(width, 10) || 0, 0), 12), '0');
const cleanPrefix = (p) => String(p ?? '').replace(/[^\w\-/.#]/g, '').slice(0, 20);

/** Give each autonumber field of a NEW record its next number, e.g. UNIT-0042. Numbers are never reused. */
export async function applyAutoNumbers(db, tenantId, entityType, definition, data) {
    for (const f of definition?.fields || []) {
        if (f.type !== 'autonumber') continue;
        const n = await db.transaction(async (tx) => {
            await tx.run('INSERT INTO autonumbers (tenant_id, entity_type, field, next_value) VALUES (?, ?, ?, 1) ON CONFLICT (tenant_id, entity_type, field) DO UPDATE SET next_value = autonumbers.next_value + 1', tenantId, entityType, f.name);
            const row = await tx.get('SELECT next_value FROM autonumbers WHERE tenant_id = ? AND entity_type = ? AND field = ?', tenantId, entityType, f.name);
            return row.next_value;
        });
        const start = Number.isInteger(f.start) && f.start > 0 ? f.start - 1 : 0;
        const year = f.includeYear ? `${new Date().getFullYear()}-` : '';
        data[f.name] = `${cleanPrefix(f.prefix)}${year}${pad(n + start, f.padding ?? 4)}`;
    }
    return data;
}

/** Auto numbers are given once: an edit keeps what the record already has. Computed fields are never stored. */
export function keepAutoNumbers(definition, data, old) {
    for (const f of definition?.fields || []) {
        if (f.type === 'autonumber') { if (old && old[f.name] !== undefined) data[f.name] = old[f.name]; else delete data[f.name]; }
        if (f.type === 'rollup') delete data[f.name];
    }
    return data;
}
export function stripComputed(definition, data) {
    for (const f of definition?.fields || []) if (f.type === 'rollup') delete data[f.name];
    return data;
}

/** Messages for unique fields whose value is already used by another record of this type. */
export async function uniqueProblems(db, tenantId, entityType, definition, data, selfId) {
    const out = [];
    for (const f of definition?.fields || []) {
        if (!f.unique || f.type === 'rollup') continue;
        const v = data[f.name];
        if (v === undefined || v === null || String(v).trim() === '') continue;
        const hit = await db.get(
            `SELECT id FROM records WHERE tenant_id = ? AND entity_type = ? AND LOWER(CAST(${db.json('data', f.name)} AS TEXT)) = LOWER(?) AND id != ? LIMIT 1`,
            tenantId, entityType, String(v).trim(), selfId || ''
        );
        if (hit) out.push(`${f.label || f.name}: "${String(v).trim()}" is already used by another ${definition.label || entityType} record`);
    }
    return out;
}

/** A user field must name a person of this workspace. */
export async function userFieldProblems(db, tenantId, definition, data) {
    const out = [];
    for (const f of definition?.fields || []) {
        if (f.type !== 'user') continue;
        const v = data[f.name];
        if (typeof v !== 'string' || !v) continue;
        const u = await db.get('SELECT id FROM users WHERE id = ? AND tenant_id = ?', v, tenantId);
        if (!u) out.push(`${f.label || f.name}: that user is not in this workspace`);
    }
    return out;
}

// ── Roll-ups ────────────────────────────────────────────────────────────────
export function rollupProblems(f, schemas) {
    const r = f.rollup;
    if (!r || typeof r !== 'object') return ['roll-up needs its settings'];
    const child = schemas[r.entity];
    if (!child) return ['roll-up: pick the record type to count or total'];
    const link = child.fields?.find(x => x.name === r.field);
    if (!link || link.type !== 'lookup') return ['roll-up: pick the field of that type that links back to this record'];
    if (!FNS.includes(r.fn)) return ['roll-up: function must be count, sum, avg, min or max'];
    if (r.fn !== 'count' && !child.fields?.some(x => x.name === r.target && ['number', 'currency', 'percent', 'rating', 'formula'].includes(x.type))) return ['roll-up: pick a number field to add up'];
    if (r.where !== undefined && (!Array.isArray(r.where) || r.where.length > 5 || r.where.some(w => !w || typeof w.field !== 'string' || !child.fields?.some(x => x.name === w.field)))) return ['roll-up: the filter must name fields of that record type (up to 5)'];
    return [];
}

/** Fill rollup fields on records of `definition` (mutates). Counts all records of the workspace, whoever may see them. */
export async function computeRollups(db, tenantId, definition, records) {
    const fields = (definition?.fields || []).filter(f => f.type === 'rollup' && f.rollup);
    if (!fields.length || !records.length) return records;
    const childCache = new Map();
    const childRows = async (entity) => {
        if (!childCache.has(entity)) {
            const rows = await db.all('SELECT data FROM records WHERE tenant_id = ? AND entity_type = ?', tenantId, entity);
            childCache.set(entity, rows.map(r => { try { return JSON.parse(r.data || '{}'); } catch { return {}; } }));
        }
        return childCache.get(entity);
    };
    const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
    for (const f of fields) {
        const r = f.rollup;
        const kids = (await childRows(r.entity)).filter(k => (r.where || []).every(w => same(k[w.field], w.value)));
        const byParent = new Map();
        for (const k of kids) { const p = k[r.field]; if (p) (byParent.get(p) || byParent.set(p, []).get(p)).push(k); }
        for (const rec of records) {
            const rows = byParent.get(rec.id) || [];
            if (r.fn === 'count') { rec[f.name] = rows.length; continue; }
            const nums = rows.map(k => Number(k[r.target])).filter(Number.isFinite);
            if (!nums.length) { rec[f.name] = r.fn === 'sum' ? 0 : null; continue; }
            rec[f.name] = r.fn === 'sum' ? nums.reduce((a, b) => a + b, 0)
                : r.fn === 'avg' ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
                : r.fn === 'min' ? Math.min(...nums) : Math.max(...nums);
        }
    }
    return records;
}

/** Field-definition problems found on a schema save (new types need their settings). */
export function definitionProblems(config, allSchemas) {
    const out = [];
    const fields = Array.isArray(config?.fields) ? config.fields : [];
    const seen = new Set();
    for (const f of fields) {
        if (!f || typeof f.name !== 'string') continue;
        if (seen.has(f.name)) out.push(`${f.name}: field name used twice`);
        seen.add(f.name);
        if ((f.type === 'multiselect') && (!Array.isArray(f.options) || !f.options.length)) out.push(`${f.label || f.name}: add the choices to pick from`);
        if (f.type === 'rating' && f.max !== undefined && (!Number.isInteger(f.max) || f.max < 1 || f.max > 10)) out.push(`${f.label || f.name}: rating scale must be 1 to 10`);
        if (f.type === 'autonumber' && f.prefix !== undefined && cleanPrefix(f.prefix) !== String(f.prefix)) out.push(`${f.label || f.name}: prefix may only use letters, numbers and - / . #`);
        if (f.type === 'rollup') out.push(...rollupProblems(f, { ...allSchemas, [config.id]: config }).map(m => `${f.label || f.name}: ${m}`));
        if (f.unique && ['textarea', 'multiselect', 'checkbox', 'rollup', 'formula', 'image', 'iframe', 'attachment'].includes(f.type)) out.push(`${f.label || f.name}: this type cannot be unique`);
    }
    return out;
}
