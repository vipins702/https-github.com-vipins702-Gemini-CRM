// Creating record types ("objects") from code: one place used by the Object Manager's Create Object button and by
// industry packs. An object is its definition (fields), a form layout and a menu entry. Everything here ADDS:
// an object or field that already exists is left exactly as it is.
import { v4 as uuidv4 } from 'uuid';

export const RESERVED_IDS = new Set(['deal', 'quote', 'user', 'role', 'journey', 'schema', 'field_rule', 'platform', 'tenant', 'audit', 'note', 'attachment']);
export const slugOf = (label) => String(label || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const NOTES_TYPES = new Set(['textarea']);

/** Two-column "Details" section (long text goes in a full-width "Notes" section). Every field is placed. */
export function defaultLayout(def, title = 'Details') {
    const plain = (def.fields || []).filter(f => !NOTES_TYPES.has(f.type));
    const long = (def.fields || []).filter(f => NOTES_TYPES.has(f.type));
    const half = Math.ceil(plain.length / 2);
    const sections = [{ id: 's1', title, columns: [{ id: 'c1', width: 6, fields: plain.slice(0, half).map(f => f.name) }, { id: 'c2', width: 6, fields: plain.slice(half).map(f => f.name) }] }];
    if (long.length) sections.push({ id: 's2', title: 'Notes', columns: [{ id: 'c1', width: 12, fields: long.map(f => f.name) }] });
    return { entityType: def.id, sections, fieldConfigs: {} };
}

/**
 * Add one object. q is the database or a transaction. spec = { id, label, pluralLabel, fields, keyField? }.
 * Returns { created, addedFields } (created: false means it already existed and only missing fields were added).
 */
export async function addObject(q, tenantId, spec, { sectionTitle = 'Details' } = {}) {
    const row = await q.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', tenantId, spec.id);
    if (!row) {
        const def = { id: spec.id, label: spec.label, pluralLabel: spec.pluralLabel || `${spec.label}s`, fields: spec.fields.map(f => ({ ...f })), ...(spec.keyField ? { keyField: spec.keyField } : {}) };
        await q.run('INSERT INTO entity_definitions (id, tenant_id, entity_type, config) VALUES (?, ?, ?, ?)', uuidv4(), tenantId, spec.id, JSON.stringify(def));
        const lay = await q.get('SELECT id FROM layouts WHERE tenant_id = ? AND entity_type = ?', tenantId, spec.id);
        if (!lay) await q.run('INSERT INTO layouts (id, tenant_id, entity_type, config) VALUES (?, ?, ?, ?)', uuidv4(), tenantId, spec.id, JSON.stringify(defaultLayout(def, sectionTitle)));
        return { created: true, addedFields: def.fields.map(f => f.name) };
    }
    const def = parse(row.config, null);
    if (!def) return { created: false, addedFields: [] };
    const have = new Set((def.fields || []).map(f => f.name));
    const fresh = spec.fields.filter(f => !have.has(f.name)).map(f => ({ ...f }));
    if (!fresh.length) return { created: false, addedFields: [] };
    def.fields = [...def.fields, ...fresh];
    await q.run('UPDATE entity_definitions SET config = ? WHERE tenant_id = ? AND entity_type = ?', JSON.stringify(def), tenantId, spec.id);
    // New fields go in their own section of the existing layout, so nothing the workspace arranged is moved.
    const lay = await q.get('SELECT id, config FROM layouts WHERE tenant_id = ? AND entity_type = ?', tenantId, spec.id);
    const layout = lay ? parse(lay.config, null) : null;
    if (layout && Array.isArray(layout.sections)) {
        const id = `pack_${(sectionTitle || 'new').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        if (!layout.sections.some(s => s.id === id)) {
            layout.sections.push({ id, title: sectionTitle, columns: [{ id: 'c1', width: 6, fields: fresh.filter((_, i) => i % 2 === 0).map(f => f.name) }, { id: 'c2', width: 6, fields: fresh.filter((_, i) => i % 2 === 1).map(f => f.name) }] });
        } else {
            const sec = layout.sections.find(s => s.id === id);
            sec.columns[0].fields.push(...fresh.map(f => f.name));
        }
        await q.run('UPDATE layouts SET config = ? WHERE id = ?', JSON.stringify(layout), lay.id);
    }
    return { created: false, addedFields: fresh.map(f => f.name) };
}

/** Add a sidebar entry to a menu group (default: CRM Modules) unless an entry with that id exists anywhere. */
export async function addMenuItem(q, tenantId, item, groupId = 'crm_modules') {
    const row = await q.get('SELECT id, config FROM menus WHERE tenant_id = ?', tenantId);
    if (!row) return false;
    const menu = parse(row.config, null);
    if (!Array.isArray(menu)) return false;
    const has = (items) => items.some(x => x && (x.id === item.id || (Array.isArray(x.children) && has(x.children))));
    if (has(menu)) return false;
    const group = menu.find(g => g && g.id === groupId && Array.isArray(g.children));
    (group ? group.children : menu).push({ type: 'item', allowedRoles: ['*'], ...item });
    await q.run('UPDATE menus SET config = ? WHERE id = ?', JSON.stringify(menu), row.id);
    return true;
}
