// Industry packs: a one-click bundle of objects, fields, form layouts, menu entries, roles, field triggers and journeys
// for a kind of business (server/packs/*.js).
//
//   preview   works out what WOULD be added and checks all of it (fields, roll-ups, journeys) before anything is written
//   install   adds what is missing. It never changes or removes anything the workspace already has, so installing
//             twice is harmless and a second run only fills gaps. Journeys arrive switched off.
import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';
import AGENCY from '../packs/agency.js';
import { addObject, addMenuItem, slugOf, RESERVED_IDS } from './objects.js';
import { definitionProblems } from './fieldTypes.js';
import { checkRule, toRow } from './fieldRules.js';
import { checkJourney } from './journeys.js';
import { saveJourney, loadSchemas } from './journeysApi.js';
import { logAudit } from './audit.js';

const PACKS = { [AGENCY.id]: AGENCY };
const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const lower = (s) => String(s || '').trim().toLowerCase();
const MAX_OBJECTS = 80;

export async function ensurePackTables(d) {
    await d.exec(`CREATE TABLE IF NOT EXISTS installed_packs (
        tenant_id TEXT NOT NULL, pack_id TEXT NOT NULL, version INTEGER, installed_at DATETIME DEFAULT CURRENT_TIMESTAMP, summary TEXT,
        PRIMARY KEY (tenant_id, pack_id))`);
}

const flatMenuIds = (items, out = new Set()) => { for (const x of items || []) { if (!x) continue; out.add(x.id); flatMenuIds(x.children, out); } return out; };

export async function listPacks(tenantId) {
    const rows = await db.all('SELECT pack_id, version, installed_at, summary FROM installed_packs WHERE tenant_id = ?', tenantId);
    return Object.values(PACKS).map(p => {
        const done = rows.find(r => r.pack_id === p.id);
        return {
            id: p.id, name: p.name, description: p.description, audience: p.audience,
            contents: { objects: p.objects.length, extendedObjects: p.extend.length, roles: p.roles.length, triggers: p.triggers.length, journeys: p.journeys.length },
            installed: done ? { at: done.installed_at, version: done.version, summary: parse(done.summary, null) } : null,
        };
    });
}

/** What installing would add, and anything that would stop it. Writes nothing. */
export async function planPack(tenantId, packId) {
    const pack = PACKS[packId];
    if (!pack) return null;
    const schemas = await loadSchemas(tenantId);
    const projected = JSON.parse(JSON.stringify(schemas));
    const errors = [];
    const objects = [];
    const touched = new Set();
    const total = Object.keys(schemas).length;
    if (total + pack.objects.filter(o => !schemas[o.id]).length > MAX_OBJECTS) errors.push(`a workspace can have up to ${MAX_OBJECTS} objects`);

    for (const spec of [...pack.objects, ...pack.extend]) {
        const have = projected[spec.id];
        if (!have) {
            if (RESERVED_IDS.has(spec.id)) errors.push(`"${spec.id}" is a reserved name`);
            projected[spec.id] = { id: spec.id, label: spec.label, pluralLabel: spec.pluralLabel, fields: spec.fields.map(f => ({ ...f })), ...(spec.keyField ? { keyField: spec.keyField } : {}) };
            objects.push({ id: spec.id, label: spec.label, status: 'new', fields: spec.fields.length, fieldNames: spec.fields.map(f => f.label) });
            touched.add(spec.id);
        } else {
            const names = new Set((have.fields || []).map(x => x.name));
            const fresh = spec.fields.filter(x => !names.has(x.name));
            have.fields = [...have.fields, ...fresh.map(x => ({ ...x }))];
            objects.push({ id: spec.id, label: have.label, status: fresh.length ? 'extend' : 'exists', fields: fresh.length, fieldNames: fresh.map(x => x.label) });
            if (fresh.length) touched.add(spec.id);
        }
    }
    for (const id of touched) for (const m of definitionProblems(projected[id], projected)) errors.push(`${projected[id].label}: ${m}`);

    const roleRows = await db.all('SELECT name FROM roles WHERE tenant_id = ?', tenantId);
    const roles = pack.roles.map(r => ({ name: r.name, description: r.description, status: roleRows.some(x => lower(x.name) === lower(r.name)) ? 'exists' : 'new' }));

    const ruleRows = await db.all('SELECT entity_type, name FROM field_rules WHERE tenant_id = ?', tenantId);
    const triggers = pack.triggers.map(t => {
        const e = checkRule({ name: t.name, conditions: t.conditions, actions: t.actions }, projected[t.entityType]?.fields || []);
        for (const m of e) errors.push(`Field Trigger "${t.name}": ${m}`);
        return { name: t.name, entityType: t.entityType, status: ruleRows.some(r => r.entity_type === t.entityType && lower(r.name) === lower(t.name)) ? 'exists' : 'new' };
    });

    const jRows = await db.all('SELECT name FROM journeys WHERE tenant_id = ?', tenantId);
    const journeys = pack.journeys.map(j => {
        for (const m of checkJourney({ nodes: j.nodes, edges: j.edges }, projected)) errors.push(`Journey "${j.name}": ${m}`);
        const trig = j.nodes.find(n => n.type === 'trigger')?.data?.config || {};
        return { name: j.name, entityType: trig.entityType, status: jRows.some(r => lower(r.name) === lower(j.name)) ? 'exists' : 'new' };
    });

    const menuRow = await db.get('SELECT config FROM menus WHERE tenant_id = ?', tenantId);
    const menuIds = flatMenuIds(parse(menuRow?.config, []));
    const menu = pack.objects.map(o => ({ id: o.id, label: o.pluralLabel, status: menuIds.has(o.id) ? 'exists' : 'new' }));

    return {
        pack: { id: pack.id, name: pack.name, description: pack.description },
        objects, roles, triggers, journeys, menu, errors: [...new Set(errors)].slice(0, 20),
        willAdd: {
            objects: objects.filter(o => o.status !== 'exists').length,
            fields: objects.reduce((n, o) => n + (o.status === 'exists' ? 0 : o.fields), 0),
            roles: roles.filter(r => r.status === 'new').length,
            triggers: triggers.filter(t => t.status === 'new').length,
            journeys: journeys.filter(j => j.status === 'new').length,
            menu: menu.filter(m => m.status === 'new').length,
        },
    };
}

export async function installPack(tenantId, userId, packId) {
    const pack = PACKS[packId];
    if (!pack) return { status: 404, errors: ['Unknown pack'] };
    const plan = await planPack(tenantId, packId);
    if (plan.errors.length) return { status: 400, errors: plan.errors };

    await db.transaction(async (tx) => {
        for (const spec of [...pack.objects, ...pack.extend]) await addObject(tx, tenantId, spec, { sectionTitle: spec.sectionTitle || 'Details' });
        for (const o of pack.objects) await addMenuItem(tx, tenantId, { id: o.id, label: o.pluralLabel, icon: o.icon || 'FolderOpen', view: o.id });
        for (const r of pack.roles) {
            const have = await tx.all('SELECT name FROM roles WHERE tenant_id = ?', tenantId);
            if (have.some(x => lower(x.name) === lower(r.name))) continue;
            await tx.run('INSERT INTO roles (id, tenant_id, name, description, permissions) VALUES (?, ?, ?, ?, ?)', uuidv4(), tenantId, r.name, r.description || '', JSON.stringify(r.permissions));
        }
        for (const t of pack.triggers) {
            const have = await tx.all('SELECT name FROM field_rules WHERE tenant_id = ? AND entity_type = ?', tenantId, t.entityType);
            if (have.some(x => lower(x.name) === lower(t.name))) continue;
            const r = toRow(tenantId, t.entityType, { name: t.name, conditions: t.conditions, actions: t.actions });
            await tx.run('INSERT INTO field_rules (id, tenant_id, entity_type, name, active, match, conditions, actions, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                r.id, r.tenant_id, r.entity_type, r.name, r.active, r.match, r.conditions, r.actions, r.sort_order);
        }
    });

    // Journeys arrive switched OFF; nobody gets a message until an admin has read them and turned them on.
    const existing = await db.all('SELECT name FROM journeys WHERE tenant_id = ?', tenantId);
    for (const j of pack.journeys) {
        if (existing.some(x => lower(x.name) === lower(j.name))) continue;
        const out = await saveJourney(tenantId, userId, { name: j.name, nodes: j.nodes, edges: j.edges, isActive: false });
        if (out.errors) return { status: 500, errors: [`Journey "${j.name}": ${out.errors[0]}`], partial: true };
    }

    const summary = plan.willAdd;
    await db.run(`INSERT INTO installed_packs (tenant_id, pack_id, version, summary) VALUES (?, ?, ?, ?)
                  ON CONFLICT (tenant_id, pack_id) DO UPDATE SET version = excluded.version, summary = excluded.summary, installed_at = CURRENT_TIMESTAMP`,
        tenantId, pack.id, pack.version, JSON.stringify(summary));
    await logAudit({ tenantId, entityType: 'pack', recordId: pack.id, action: 'create', actorId: userId, details: { pack: pack.id, ...summary } });
    return { status: 200, added: summary };
}

export function registerPackRoutes(app, { authenticateToken, requireAdmin }) {
    const admin = [authenticateToken, requireAdmin];

    app.get('/api/packs', ...admin, async (req, res) => res.json(await listPacks(req.tenantId)));

    app.get('/api/packs/:id/preview', ...admin, async (req, res) => {
        const plan = await planPack(req.tenantId, req.params.id);
        if (!plan) return res.status(404).json({ error: 'Unknown pack' });
        res.json(plan);
    });

    app.post('/api/packs/:id/install', ...admin, async (req, res) => {
        try {
            const out = await installPack(req.tenantId, req.user.id, req.params.id);
            if (out.errors) return res.status(out.status).json({ error: out.status === 404 ? out.errors[0] : 'Validation Failed', details: out.errors, partial: !!out.partial });
            res.json({ success: true, added: out.added });
        } catch (e) {
            console.error('Install pack error:', e);
            res.status(500).json({ error: 'The pack could not be installed. Nothing was half-applied except journeys; run it again to finish.' });
        }
    });

    // Object Manager → Create Object
    app.post('/api/metadata/entities', ...admin, async (req, res) => {
        const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
        const label = typeof b.label === 'string' ? b.label.trim() : '';
        const plural = typeof b.pluralLabel === 'string' && b.pluralLabel.trim() ? b.pluralLabel.trim() : `${label}s`;
        if (!label || label.length > 60 || plural.length > 60) return res.status(400).json({ error: 'Validation Failed', details: ['label: enter a name of up to 60 characters'] });
        const id = slugOf(label);
        if (!/^[a-z][a-z0-9_]{1,39}$/.test(id)) return res.status(400).json({ error: 'Validation Failed', details: ['label: use letters and numbers, starting with a letter'] });
        if (RESERVED_IDS.has(id)) return res.status(400).json({ error: 'Validation Failed', details: ['label: that name is reserved, choose another'] });
        const n = await db.get('SELECT COUNT(*) AS n FROM entity_definitions WHERE tenant_id = ?', req.tenantId);
        if ((n?.n || 0) >= MAX_OBJECTS) return res.status(400).json({ error: 'Validation Failed', details: [`a workspace can have up to ${MAX_OBJECTS} objects`] });
        if (await db.get('SELECT id FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', req.tenantId, id)) return res.status(409).json({ error: 'An object with that name already exists' });
        await db.transaction(async (tx) => {
            await addObject(tx, req.tenantId, { id, label, pluralLabel: plural, fields: [{ name: 'name', label: 'Name', type: 'text', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }] });
            await addMenuItem(tx, req.tenantId, { id, label: plural, icon: 'FolderOpen', view: id });
        });
        await logAudit({ tenantId: req.tenantId, entityType: 'schema', recordId: id, action: 'create', actorId: req.user.id, details: { label } });
        res.json({ success: true, id });
    });
}
