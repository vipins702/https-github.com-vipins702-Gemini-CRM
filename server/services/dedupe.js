// Duplicate handling, configurable per object.
//
// The setting lives in the object definition (entity_definitions.config.dedupe):
//   {
//     enabled:   true,
//     action:    'warn' | 'block',          what a person sees when they save a record that already exists
//     automated: 'update' | 'skip' | 'create',   what web forms, imports, WhatsApp, webhooks do instead of asking
//     checkAlso: ['customer'],              other objects to search too (a new lead may already be a customer)
//     rules: [{ id, label, fields: ['email'] }, { id, label, fields: ['firstName', 'lastName', 'company'] }]
//   }
// A rule matches when ALL of its fields are equal (and not blank). A rule with one e-mail field compares e-mails
// ignoring case, a phone field compares the last 10 digits (so +91 95577 22795 equals 09557722795), anything else
// compares text ignoring case, spacing and punctuation. Lead and customer have working defaults; any other object
// is off until an admin sets it up.
//
// Matching reads the records of the object (and checkAlso) and compares keys in memory, which is fine for tens of
// thousands of records per workspace; a key table would be the next step beyond that.

import db from '../database.js';
import { logAudit } from './audit.js';

const RULE_FIELD_ALIASES = { phone: ['phone', 'mobile', 'phoneNumber', 'contact', 'tel'], email: ['email'] };
const MAX_ROWS = 50000;
const MAX_RULES = 10;
const EMPTY = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

const STD_RULES = [
    { id: 'email', label: 'Same e-mail', fields: ['email'] },
    { id: 'phone', label: 'Same phone number', fields: ['phone'] },
];
export const DEFAULTS = {
    lead: { enabled: true, action: 'warn', automated: 'update', checkAlso: ['customer'], rules: STD_RULES },
    customer: { enabled: true, action: 'warn', automated: 'update', checkAlso: [], rules: STD_RULES },
};
const OFF = { enabled: false, action: 'warn', automated: 'create', checkAlso: [], rules: [] };

/** The setting for an object: what an admin saved, else the default for lead / customer, else off. */
export function dedupeConfigOf(definition, entityType) {
    const saved = definition?.dedupe;
    const base = DEFAULTS[entityType] || OFF;
    if (!saved || typeof saved !== 'object') return { ...base, isDefault: true };
    return {
        enabled: saved.enabled !== false && (Array.isArray(saved.rules) ? saved.rules.length > 0 : base.enabled),
        action: saved.action === 'block' ? 'block' : 'warn',
        automated: ['update', 'skip', 'create'].includes(saved.automated) ? saved.automated : 'update',
        checkAlso: Array.isArray(saved.checkAlso) ? saved.checkAlso.filter(x => typeof x === 'string') : base.checkAlso,
        rules: Array.isArray(saved.rules) ? saved.rules : base.rules,
        isDefault: false,
    };
}

/** Problems with a setting an admin is saving (empty list = fine). */
export function dedupeProblems(cfg, definition, allSchemas) {
    const out = [];
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return ['the duplicate setting must be an object'];
    if (cfg.action !== undefined && !['warn', 'block'].includes(cfg.action)) out.push('action must be warn or block');
    if (cfg.automated !== undefined && !['update', 'skip', 'create'].includes(cfg.automated)) out.push('automated must be update, skip or create');
    if (cfg.checkAlso !== undefined && (!Array.isArray(cfg.checkAlso) || cfg.checkAlso.length > 5 || cfg.checkAlso.some(x => typeof x !== 'string' || !allSchemas[x] || x === definition.id))) out.push('"also check" must name up to 5 other existing objects');
    if (!Array.isArray(cfg.rules) || cfg.rules.length > MAX_RULES) { out.push(`rules must be a list of up to ${MAX_RULES}`); return out; }
    const names = new Set((definition.fields || []).map(f => f.name));
    const seen = new Set();
    cfg.rules.forEach((r, i) => {
        if (!r || typeof r !== 'object' || !Array.isArray(r.fields) || r.fields.length < 1 || r.fields.length > 4) { out.push(`rule ${i + 1}: pick 1 to 4 fields`); return; }
        for (const f of r.fields) if (typeof f !== 'string' || !names.has(f)) out.push(`rule ${i + 1}: "${f}" is not a field of ${definition.label || definition.id}`);
        if (r.label !== undefined && (typeof r.label !== 'string' || r.label.length > 80)) out.push(`rule ${i + 1}: the name is too long`);
        const sig = [...r.fields].sort().join('+');
        if (seen.has(sig)) out.push(`rule ${i + 1}: the same fields are already checked by another rule`);
        seen.add(sig);
    });
    return out.slice(0, 10);
}

// ── Keys ────────────────────────────────────────────────────────────────────

const flat = (v) => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return Object.values(v).map(flat).filter(Boolean).join(' ');
    return String(v);
};
const textKey = (v) => flat(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const emailKey = (v) => flat(v).trim().toLowerCase();
const phoneKey = (v) => {
    const d = flat(v).replace(/\D/g, '').replace(/^00/, '');
    if (d.length < 7) return '';
    return d.length > 10 ? d.slice(-10) : d;
};

/** Which comparison suits a field: by its type, with the plain names email / phone treated as such. */
function kindOf(definition, name) {
    const f = (definition?.fields || []).find(x => x.name === name);
    if (f?.type === 'email' || name === 'email') return 'email';
    if (f?.type === 'phone' || RULE_FIELD_ALIASES.phone.includes(name)) return 'phone';
    return 'text';
}
function valueOf(data, name) {
    const aliases = name === 'phone' ? RULE_FIELD_ALIASES.phone : [name];
    for (const a of aliases) if (!EMPTY(data?.[a])) return data[a];
    return '';
}

/** [{ ruleId, key }] for a record: one per rule whose fields are all filled. */
export function keysFor(data, definition, cfg) {
    const out = [];
    for (const r of cfg.rules || []) {
        const parts = [];
        let ok = true;
        for (const name of r.fields) {
            const kind = kindOf(definition, name);
            const raw = valueOf(data, name);
            const k = kind === 'email' ? emailKey(raw) : kind === 'phone' ? phoneKey(raw) : textKey(raw);
            if (!k) { ok = false; break; }
            parts.push(k);
        }
        if (ok) out.push({ ruleId: r.id || r.fields.join('+'), key: parts.join('|') });
    }
    return out;
}

const ruleLabel = (cfg, id) => cfg.rules.find(r => (r.id || r.fields.join('+')) === id)?.label || `Same ${id}`;
const parse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

async function loadDefinition(tenantId, entityType) {
    const row = await db.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', tenantId, entityType);
    return row ? parse(row.config) : null;
}

/**
 * Records that already look like this one. `data` is the record being saved; `excludeId` is itself (an edit).
 * Returns [{ id, entityType, name, status, ruleId, rule, createdAt }], same-object matches first.
 */
export async function findDuplicates(tenantId, entityType, data, { excludeId = null, definition = null, config = null, limit = 10 } = {}) {
    const def = definition || await loadDefinition(tenantId, entityType);
    const cfg = config || dedupeConfigOf(def, entityType);
    if (!cfg.enabled || !cfg.rules.length) return [];
    const mine = keysFor(data, def, cfg);
    if (!mine.length) return [];
    const wanted = new Map(mine.map(k => [k.ruleId, k.key]));
    const types = [entityType, ...cfg.checkAlso];
    const rows = await db.all(
        `SELECT id, entity_type, primary_display, status, data, created_at FROM records WHERE tenant_id = ? AND entity_type IN (${types.map(() => '?').join(',')}) LIMIT ${MAX_ROWS}`,
        tenantId, ...types);
    const hits = [];
    for (const row of rows) {
        if (row.id === excludeId) continue;
        const theirs = keysFor(parse(row.data), def, cfg);
        const m = theirs.find(k => wanted.get(k.ruleId) === k.key);
        if (m) hits.push({ id: row.id, entityType: row.entity_type, name: row.primary_display || '(no name)', status: row.status, ruleId: m.ruleId, rule: ruleLabel(cfg, m.ruleId), createdAt: row.created_at });
    }
    hits.sort((a, b) => (a.entityType === entityType ? 0 : 1) - (b.entityType === entityType ? 0 : 1) || String(a.createdAt).localeCompare(String(b.createdAt)));
    return hits.slice(0, limit);
}

/** On an edit, ask again only when a field the rules look at has changed. */
export function keysChanged(oldData, newData, definition, cfg) {
    const a = JSON.stringify(keysFor(oldData, definition, cfg));
    const b = JSON.stringify(keysFor(newData, definition, cfg));
    return a !== b;
}

// ── What automated channels do ─────────────────────────────────────────────

/** Fill what the existing record leaves blank from `data`; a note says where the repeat came from. */
export async function absorbIntoExisting(tenantId, dupe, data, { channel = 'form', actorId = 'system', sameType = true } = {}) {
    const row = await db.get('SELECT data, entity_type FROM records WHERE id = ? AND tenant_id = ?', dupe.id, tenantId);
    if (!row) return false;
    const cur = parse(row.data);
    const filled = [];
    for (const [k, v] of Object.entries(data || {})) {
        // A match in another object (a new lead that is already a customer) only gets a note: its fields are not ours to fill.
        if (!sameType) break;
        if (k.startsWith('_') || k === 'id' || k === 'status' || k === 'source') continue;
        if (EMPTY(cur[k]) && !EMPTY(v)) { cur[k] = v; filled.push(k); }
    }
    if (filled.length) await db.run('UPDATE records SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?', JSON.stringify(cur), dupe.id, tenantId);
    await logAudit({
        tenantId, entityType: row.entity_type, recordId: dupe.id, action: 'note', actorId,
        details: { note: `Came in again through ${channel}${filled.length ? `; filled in ${filled.join(', ')}` : ''}.`, _via: 'duplicate' },
    });
    return true;
}

/**
 * For channels where nobody can be asked (web form, import, webhook, WhatsApp): create, or reuse what exists.
 * Returns { action: 'create' } | { action: 'updated' | 'skipped', existing }.
 */
export async function resolveAutomated(tenantId, entityType, data, { channel = 'form', actorId = 'system', definition = null } = {}) {
    const def = definition || await loadDefinition(tenantId, entityType);
    const cfg = dedupeConfigOf(def, entityType);
    if (!cfg.enabled || cfg.automated === 'create') return { action: 'create' };
    const [first] = await findDuplicates(tenantId, entityType, data, { definition: def, config: cfg, limit: 1 });
    if (!first) return { action: 'create' };
    if (cfg.automated === 'skip') return { action: 'skipped', existing: first };
    await absorbIntoExisting(tenantId, first, data, { channel, actorId, sameType: first.entityType === entityType });
    return { action: 'updated', existing: first };
}

// ── Finding existing duplicates ─────────────────────────────────────────────

/** Groups of records of one object that match each other under any rule. */
export async function scanDuplicates(tenantId, entityType, { limitGroups = 200 } = {}) {
    const def = await loadDefinition(tenantId, entityType);
    if (!def) throw new Error('Object not found');
    const cfg = dedupeConfigOf(def, entityType);
    if (!cfg.rules.length) return { groups: [], rules: [] };
    const rows = await db.all(`SELECT id, primary_display, status, data, created_at, owner_id FROM records WHERE tenant_id = ? AND entity_type = ? LIMIT ${MAX_ROWS}`, tenantId, entityType);
    const parent = new Map(rows.map(r => [r.id, r.id]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
    const seen = new Map();   // ruleId|key -> first id
    const why = new Map();    // id -> Set(rule labels)
    const parsed = new Map();
    for (const r of rows) {
        const d = parse(r.data);
        parsed.set(r.id, d);
        for (const k of keysFor(d, def, cfg)) {
            const id = `${k.ruleId}|${k.key}`;
            if (seen.has(id)) { union(seen.get(id), r.id); (why.get(r.id) || why.set(r.id, new Set()).get(r.id)).add(ruleLabel(cfg, k.ruleId)); (why.get(seen.get(id)) || why.set(seen.get(id), new Set()).get(seen.get(id))).add(ruleLabel(cfg, k.ruleId)); }
            else seen.set(id, r.id);
        }
    }
    const byRoot = new Map();
    for (const r of rows) { const root = find(r.id); (byRoot.get(root) || byRoot.set(root, []).get(root)).push(r); }
    const groups = [];
    for (const members of byRoot.values()) {
        if (members.length < 2) continue;
        const filled = (r) => Object.entries(parsed.get(r.id)).filter(([k, v]) => !k.startsWith('_') && !EMPTY(v)).length;
        const ordered = [...members].sort((a, b) => filled(b) - filled(a) || String(a.created_at).localeCompare(String(b.created_at)));
        groups.push({
            suggestedKeepId: ordered[0].id,
            because: [...new Set(members.flatMap(m => [...(why.get(m.id) || [])]))],
            records: members.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(m => ({
                id: m.id, name: m.primary_display || '(no name)', status: m.status, createdAt: m.created_at, ownerId: m.owner_id || null, fieldsFilled: filled(m),
                email: flat(parsed.get(m.id).email), phone: flat(valueOf(parsed.get(m.id), 'phone')),
            })),
        });
    }
    groups.sort((a, b) => b.records.length - a.records.length);
    return { groups: groups.slice(0, limitGroups), total: groups.length, rules: cfg.rules.map(r => r.label || r.fields.join(' + ')) };
}

// ── Merging ─────────────────────────────────────────────────────────────────

// Where a record id is stored outside the records table.
const REFERENCES = [
    ['audit_logs', 'record_id'], ['record_notes', 'record_id'], ['attachments', 'record_id'], ['notifications', 'record_id'],
    ['form_submissions', 'record_id'], ['campaign_sends', 'record_id'], ['sequence_enrollments', 'record_id'],
    ['wa_messages', 'matched_id'], ['call_logs', 'matched_id'], ['email_messages', 'matched_id'],
];

/**
 * Merge duplicates into one record: what the kept record leaves blank is filled from the others, every record that
 * pointed at an other (tasks, cases, notes, messages, history) now points at the kept one, and the others are removed.
 */
export async function mergeRecords(tenantId, entityType, keepId, mergeIds, actorId) {
    const ids = [...new Set((mergeIds || []).filter(x => typeof x === 'string' && x && x !== keepId))];
    if (!keepId || !ids.length) throw new Error('Pick the record to keep and at least one to merge into it');
    if (ids.length > 20) throw new Error('Merge up to 20 records at a time');
    const keepRow = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', keepId, tenantId, entityType);
    if (!keepRow) throw new Error('The record to keep was not found');
    const others = [];
    for (const id of ids) {
        const r = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', id, tenantId, entityType);
        if (!r) throw new Error('One of the records to merge was not found');
        others.push(r);
    }
    others.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    const kept = parse(keepRow.data);
    const filled = [];
    for (const o of others) {
        const d = parse(o.data);
        for (const [k, v] of Object.entries(d)) {
            if (k === 'id') continue;
            if (k.startsWith('_')) { if (kept[k] === undefined && ['_converted_to_customer', '_assigned_to'].includes(k)) kept[k] = v; continue; }
            if (k === 'notes' && !EMPTY(v) && !EMPTY(kept[k]) && String(kept[k]) !== String(v)) { kept[k] = `${kept[k]}\n---\n${v}`; filled.push(k); continue; }
            if (k === 'score') { if (Number(v) > Number(kept[k] || 0)) kept[k] = v; continue; }
            if (EMPTY(kept[k]) && !EMPTY(v)) { kept[k] = v; filled.push(k); }
        }
    }
    kept._merged_from = [...(Array.isArray(kept._merged_from) ? kept._merged_from : []), ...ids];

    // Which of the tables that hold a record id exist here (looked up before the transaction starts).
    const refs = [];
    for (const [table, col] of REFERENCES) {
        try { const cols = await db.columns(table); if (cols.includes(col) && cols.includes('tenant_id')) refs.push([table, col]); } catch { /* table not in this database */ }
    }
    const moved = { records: 0, other: 0 };
    await db.transaction(async (tx) => {
        await tx.run('UPDATE records SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?', JSON.stringify(kept), keepId, tenantId);
        for (const o of others) {
            // Any record of the workspace that held this id in a field now holds the kept id.
            const pointing = await tx.all(`SELECT id, data FROM records WHERE tenant_id = ? AND id != ? AND CAST(data AS TEXT) LIKE ?`, tenantId, o.id, `%${o.id}%`);
            for (const p of pointing) {
                const d = parse(p.data);
                let changed = false;
                for (const [k, v] of Object.entries(d)) if (v === o.id) { d[k] = keepId; changed = true; }
                if (changed) { await tx.run('UPDATE records SET data = ? WHERE id = ? AND tenant_id = ?', JSON.stringify(d), p.id, tenantId); moved.records++; }
            }
            for (const [table, col] of refs) {
                await tx.run(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ? AND tenant_id = ?`, keepId, o.id, tenantId);
                moved.other++;
            }
            await tx.run('DELETE FROM records WHERE id = ? AND tenant_id = ?', o.id, tenantId);
        }
    });
    await logAudit({
        tenantId, entityType, recordId: keepId, action: 'merge', actorId,
        details: { mergedIds: ids, mergedNames: others.map(o => o.primary_display), filledFields: [...new Set(filled)], _via: 'duplicate_merge' },
    });
    return { keptId: keepId, merged: ids.length, filledFields: [...new Set(filled)], movedRecords: moved.records };
}

// ── Routes ──────────────────────────────────────────────────────────────────

export function registerDedupeRoutes(app, { authenticateToken, requireAdmin, can }) {
    const canRead = (req, entityType) => can(req, entityType, 'read');

    // The setting for an object (readable by anyone who can open the object: the form uses it).
    app.get('/api/dedupe/:entityType/config', authenticateToken, async (req, res) => {
        try {
            const { entityType } = req.params;
            if (!canRead(req, entityType)) return res.status(403).json({ error: `Insufficient permissions to read ${entityType}` });
            const def = await loadDefinition(req.tenantId, entityType);
            if (!def) return res.status(404).json({ error: 'Object not found' });
            const { isDefault, ...config } = dedupeConfigOf(def, entityType);
            res.json({ config, isDefault });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/dedupe/:entityType/config', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { entityType } = req.params;
            const def = await loadDefinition(req.tenantId, entityType);
            if (!def) return res.status(404).json({ error: 'Object not found' });
            const rows = await db.all('SELECT entity_type, config FROM entity_definitions WHERE tenant_id = ?', req.tenantId);
            const all = {}; for (const r of rows) all[r.entity_type] = parse(r.config);
            const body = req.body || {};
            const next = {
                enabled: body.enabled !== false,
                action: body.action === 'block' ? 'block' : 'warn',
                automated: ['update', 'skip', 'create'].includes(body.automated) ? body.automated : 'update',
                checkAlso: Array.isArray(body.checkAlso) ? body.checkAlso : [],
                rules: (Array.isArray(body.rules) ? body.rules : []).map(r => ({ id: r?.id, label: typeof r?.label === 'string' ? r.label.trim() : undefined, fields: r?.fields })),
            };
            const problems = dedupeProblems({ ...next, id: entityType }, { ...def, id: entityType }, all);
            if (problems.length) return res.status(400).json({ error: 'Validation Failed', details: problems });
            next.rules = next.rules.map((r, i) => ({ id: r.id || `r${i + 1}_${r.fields.join('_')}`.slice(0, 60), label: r.label || r.fields.join(' + '), fields: r.fields }));
            def.dedupe = next;
            await db.run('UPDATE entity_definitions SET config = ? WHERE tenant_id = ? AND entity_type = ?', JSON.stringify(def), req.tenantId, entityType);
            await logAudit({ tenantId: req.tenantId, entityType: 'object', recordId: entityType, action: 'update', actorId: req.user.id, details: { dedupe: next } });
            res.json({ success: true, config: next });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Would this record be a duplicate? (the form asks when you leave a field the rules look at)
    app.post('/api/dedupe/:entityType/check', authenticateToken, async (req, res) => {
        try {
            const { entityType } = req.params;
            if (!canRead(req, entityType)) return res.status(403).json({ error: `Insufficient permissions to read ${entityType}` });
            const record = req.body?.record;
            if (!record || typeof record !== 'object' || Array.isArray(record)) return res.status(400).json({ error: 'record is required' });
            const def = await loadDefinition(req.tenantId, entityType);
            if (!def) return res.status(404).json({ error: 'Object not found' });
            const cfg = dedupeConfigOf(def, entityType);
            const duplicates = await findDuplicates(req.tenantId, entityType, record, { excludeId: typeof record.id === 'string' ? record.id : null, definition: def, config: cfg });
            res.json({ duplicates, action: cfg.action });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/dedupe/:entityType/scan', authenticateToken, requireAdmin, async (req, res) => {
        try { res.json(await scanDuplicates(req.tenantId, req.params.entityType)); }
        catch (e) { res.status(400).json({ error: e.message }); }
    });

    app.post('/api/dedupe/:entityType/merge', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { keepId, mergeIds } = req.body || {};
            const out = await mergeRecords(req.tenantId, req.params.entityType, keepId, mergeIds, req.user.id);
            res.json(out);
        } catch (e) { res.status(400).json({ error: e.message }); }
    });
}
