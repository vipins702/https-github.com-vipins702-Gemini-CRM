// Object keys and joins (Object Manager → Keys & joins).
//
//   Primary key   every record has an automatic id. It never changes and is what joins store.
//   Record key    the field that identifies a record to people (email for a lead, SKU for a product, an auto-number…).
//                 Marking it makes the field unique, so two records can never share it.
//   Joins         a Lookup field stores the id of a record of another object. The panel shows what each join points at,
//                 how many records use it and how many of those links are broken (point at nothing).
//
// Changing a key or re-pointing a join on an object that already has records can damage those records, so the server
// answers 409 with the numbers first and only applies the change when the admin confirms.
import db from '../database.js';
import { logAudit } from './audit.js';

export const KEY_TYPES = ['text', 'email', 'phone', 'number', 'autonumber', 'url'];
const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const empty = (v) => v === undefined || v === null || String(v).trim() === '';
const norm = (v) => String(v).trim().toLowerCase();

async function loadSchemas(tenantId) {
    const rows = await db.all('SELECT entity_type, config FROM entity_definitions WHERE tenant_id = ?', tenantId);
    const out = {};
    for (const r of rows) { const c = parse(r.config, null); if (c) out[r.entity_type] = { ...c, id: c.id || r.entity_type }; }
    return out;
}

const saveSchema = (tenantId, entityType, def) =>
    db.run('UPDATE entity_definitions SET config = ? WHERE tenant_id = ? AND entity_type = ?', JSON.stringify(def), tenantId, entityType);

/** How a key field is doing on existing records: how many are blank and how many repeat another record's value. */
export function keyStats(records, field) {
    const seen = new Map();
    let blank = 0;
    for (const r of records) {
        const v = r.data[field];
        if (empty(v)) { blank++; continue; }
        const k = norm(v);
        seen.set(k, (seen.get(k) || 0) + 1);
    }
    let duplicates = 0;
    for (const n of seen.values()) if (n > 1) duplicates += n - 1;
    return { records: records.length, blank, duplicates };
}

export function registerKeyRoutes(app, { authenticateToken, requireAdmin }) {
    const admin = [authenticateToken, requireAdmin];

    app.get('/api/metadata/keys', ...admin, async (req, res) => {
        const schemas = await loadSchemas(req.tenantId);
        const rows = await db.all('SELECT id, entity_type, data FROM records WHERE tenant_id = ?', req.tenantId);
        const typeOf = new Map();
        const byType = {};
        for (const r of rows) {
            typeOf.set(r.id, r.entity_type);
            (byType[r.entity_type] || (byType[r.entity_type] = [])).push({ id: r.id, data: parse(r.data, {}) });
        }
        const out = [];
        for (const [id, def] of Object.entries(schemas)) {
            const records = byType[id] || [];
            const joins = (def.fields || []).filter(f => f.type === 'lookup').map(f => {
                let linked = 0, broken = 0;
                for (const r of records) {
                    const v = r.data[f.name];
                    if (empty(v)) continue;
                    linked++;
                    if (typeOf.get(v) !== f.lookupTarget) broken++;
                }
                return { field: f.name, label: f.label, target: f.lookupTarget || null, targetLabel: schemas[f.lookupTarget]?.label || null, targetMissing: !!f.lookupTarget && !schemas[f.lookupTarget], linked, broken };
            });
            const joinedFrom = [];
            for (const [oid, odef] of Object.entries(schemas)) {
                for (const f of odef.fields || []) {
                    if (f.type !== 'lookup' || f.lookupTarget !== id) continue;
                    const linked = (byType[oid] || []).filter(r => !empty(r.data[f.name])).length;
                    joinedFrom.push({ entity: oid, entityLabel: odef.label, field: f.name, label: f.label, linked });
                }
            }
            out.push({
                id, label: def.label, pluralLabel: def.pluralLabel, records: records.length,
                primaryKey: 'id',
                keyField: def.keyField || null,
                keyStats: def.keyField ? keyStats(records, def.keyField) : null,
                eligible: (def.fields || []).filter(f => KEY_TYPES.includes(f.type)).map(f => ({ name: f.name, label: f.label, type: f.type })),
                joins, joinedFrom,
            });
        }
        res.json(out);
    });

    app.post('/api/metadata/keys/:entity', ...admin, async (req, res) => {
        const { entity } = req.params;
        const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
        if (b.keyField !== null && typeof b.keyField !== 'string') return res.status(400).json({ error: 'Validation Failed', details: ['keyField must be a field name, or null to remove the key'] });
        if (b.confirm !== undefined && typeof b.confirm !== 'boolean') return res.status(400).json({ error: 'Validation Failed', details: ['confirm must be true or false'] });
        const schemas = await loadSchemas(req.tenantId);
        const def = schemas[entity];
        if (!def) return res.status(404).json({ error: 'Unknown record type' });
        const before = def.keyField || null;
        if (b.keyField === before) return res.status(400).json({ error: 'Validation Failed', details: ['that is already the key'] });

        let field = null;
        if (b.keyField !== null) {
            field = (def.fields || []).find(f => f.name === b.keyField);
            if (!field) return res.status(400).json({ error: 'Validation Failed', details: ['that field does not exist'] });
            if (!KEY_TYPES.includes(field.type)) return res.status(400).json({ error: 'Validation Failed', details: [`a ${field.type} field cannot be a key; use text, e-mail, phone, number, web address or auto-number`] });
        }
        const rows = await db.all('SELECT id, data FROM records WHERE tenant_id = ? AND entity_type = ?', req.tenantId, entity);
        const records = rows.map(r => ({ id: r.id, data: parse(r.data, {}) }));
        const stats = b.keyField ? keyStats(records, b.keyField) : { records: records.length, blank: 0, duplicates: 0 };

        if (records.length > 0 && !b.confirm) {
            return res.status(409).json({
                error: 'Confirmation needed', needsConfirm: true, entity, from: before, to: b.keyField, stats,
                message: b.keyField
                    ? `${def.label} already has ${records.length} record(s). ${stats.blank} have no ${field.label}, and ${stats.duplicates} repeat another record's ${field.label}. The key rule applies from now on: a record whose ${field.label} duplicates another cannot be edited until it is made unique.`
                    : `${def.label} already has ${records.length} record(s). Removing the key stops ${before} being enforced as unique going forward; nothing stored changes.`,
            });
        }
        if (field) {
            field.unique = true;
            if (stats.blank === 0) field.required = true;       // only safe when no existing record lacks a value
        }
        if (b.keyField) def.keyField = b.keyField; else delete def.keyField;
        await saveSchema(req.tenantId, entity, def);
        await logAudit({ tenantId: req.tenantId, entityType: 'schema', recordId: entity, action: 'update', actorId: req.user.id, details: { keyField: { from: before, to: b.keyField }, records: records.length } });
        res.json({ success: true, keyField: b.keyField, stats });
    });

    app.post('/api/metadata/joins/:entity/:field', ...admin, async (req, res) => {
        const { entity, field: fname } = req.params;
        const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
        if (typeof b.target !== 'string' || !b.target) return res.status(400).json({ error: 'Validation Failed', details: ['target: choose the object this join should point at'] });
        if (b.existing !== undefined && !['keep', 'clear'].includes(b.existing)) return res.status(400).json({ error: 'Validation Failed', details: ['existing must be keep or clear'] });
        if (b.confirm !== undefined && typeof b.confirm !== 'boolean') return res.status(400).json({ error: 'Validation Failed', details: ['confirm must be true or false'] });
        const schemas = await loadSchemas(req.tenantId);
        const def = schemas[entity];
        if (!def) return res.status(404).json({ error: 'Unknown record type' });
        const field = (def.fields || []).find(f => f.name === fname && f.type === 'lookup');
        if (!field) return res.status(404).json({ error: 'That is not a join (Lookup) field of this object' });
        if (!schemas[b.target]) return res.status(400).json({ error: 'Validation Failed', details: ['target: that object does not exist'] });
        if (field.lookupTarget === b.target) return res.status(400).json({ error: 'Validation Failed', details: ['the join already points at that object'] });

        const rows = await db.all('SELECT id, data FROM records WHERE tenant_id = ? AND entity_type = ?', req.tenantId, entity);
        const withValue = rows.map(r => ({ id: r.id, data: parse(r.data, {}) })).filter(r => !empty(r.data[fname]));
        if (withValue.length > 0 && !b.confirm) {
            return res.status(409).json({
                error: 'Confirmation needed', needsConfirm: true, entity, field: fname, from: field.lookupTarget, to: b.target, linked: withValue.length,
                message: `${withValue.length} ${def.label} record(s) are already linked through "${field.label}" to ${schemas[field.lookupTarget]?.label || field.lookupTarget}. Those links hold ids of ${schemas[field.lookupTarget]?.label || field.lookupTarget} records, which are not ${schemas[b.target].label} records. Keep them and they show as broken until relinked, or clear them now.`,
            });
        }
        const before = field.lookupTarget;
        field.lookupTarget = b.target;
        await db.transaction(async (tx) => {
            await tx.run('UPDATE entity_definitions SET config = ? WHERE tenant_id = ? AND entity_type = ?', JSON.stringify(def), req.tenantId, entity);
            if (b.existing === 'clear') {
                for (const r of withValue) {
                    delete r.data[fname];
                    await tx.run('UPDATE records SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?', JSON.stringify(r.data), r.id, req.tenantId);
                }
            }
            await tx.run('UPDATE relationships SET target_entity = ? WHERE tenant_id = ? AND source_entity = ? AND source_field = ?', b.target, req.tenantId, entity, fname);
        });
        await logAudit({ tenantId: req.tenantId, entityType: 'schema', recordId: entity, action: 'update', actorId: req.user.id, details: { join: fname, from: before, to: b.target, existing: b.existing || 'keep', linked: withValue.length } });
        res.json({ success: true, cleared: b.existing === 'clear' ? withValue.length : 0 });
    });
}
