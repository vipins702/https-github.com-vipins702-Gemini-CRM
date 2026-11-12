// Journeys: automations that run AFTER a record is saved (field triggers run before; see fieldRules.js).
//
//   A journey is a graph drawn in the builder:  trigger → steps → ...
//     trigger    when it starts: created, updated, deleted, status changes, a field changes,
//                a date arrives (n days before / after a date field), a record has had no activity for n days.
//                Optional conditions (AND / OR / NOT gates) and an optional "stop when" gate.
//     action     e-mail, WhatsApp, update record, create task / lead / record, notify a user, assign owner, webhook
//     condition  If / Else: one path for YES, one for NO (an AND / OR / NOT gate on the record)
//     wait       really waits: minutes, hours or days. The wait is stored (journey_runs) and picked up by the
//                scheduler, so it survives a restart.
//
//   Every start of a journey on a record is a RUN with a step-by-step log. A run keeps a copy of the journey it
//   started with, so editing a journey never changes runs already in progress. A failed step ends the run, marks
//   it failed and notifies whoever built the journey.

import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { normalizeGate, evaluateGate, checkGate } from './conditions.js';
import { runAction, evaluateCondition, interpolate } from './workflow.js';
import { tokensIn } from './tokens.js';
import { labelMapsFor, attachLabels } from './lookups.js';

export const TRIGGERS = ['create', 'update', 'delete', 'status_change', 'field_change', 'date_arrives', 'inactive'];
export const ACTIONS = ['email', 'update_record', 'create_task', 'create_lead', 'create_record', 'notify', 'assign_owner', 'webhook', 'whatsapp'];
export const WAIT_UNITS = { minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000 };
export const NODE_TYPES = ['trigger', 'action', 'condition', 'wait'];
export const RULE_OPS = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'not_contains', 'is_empty', 'is_not_empty'];
const MAX_NODES = 100, MAX_STEPS = 100;

// ── Storage ─────────────────────────────────────────────────────────────────
export async function ensureJourneyTables(d) {
    await d.exec(`CREATE TABLE IF NOT EXISTS journeys (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, entity_type TEXT NOT NULL,
        trigger_type TEXT NOT NULL, trigger_config TEXT, graph TEXT NOT NULL, is_active INTEGER DEFAULT 1,
        source_id TEXT, created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await d.exec('CREATE INDEX IF NOT EXISTS idx_journeys_tenant ON journeys (tenant_id, entity_type, is_active)');
    await d.exec(`CREATE TABLE IF NOT EXISTS journey_runs (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, journey_id TEXT NOT NULL, journey_name TEXT, entity_type TEXT NOT NULL,
        record_id TEXT NOT NULL, status TEXT NOT NULL, current_node TEXT, due_at TEXT, graph TEXT NOT NULL, snapshot TEXT,
        steps TEXT, error TEXT, trigger_key TEXT, created_at TEXT, updated_at TEXT)`);
    await d.exec('CREATE INDEX IF NOT EXISTS idx_runs_due ON journey_runs (status, due_at)');
    await d.exec('CREATE INDEX IF NOT EXISTS idx_runs_record ON journey_runs (tenant_id, record_id)');
    await d.exec('CREATE INDEX IF NOT EXISTS idx_runs_journey ON journey_runs (tenant_id, journey_id, status)');
    await d.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_once ON journey_runs (journey_id, record_id, trigger_key) WHERE trigger_key IS NOT NULL');
}

const nodeType = (n) => n?.type || n?.data?.type;
const cfgOf = (n) => n?.data?.config || {};
const norm = (v) => (v === undefined || v === null ? '' : String(v).trim().toLowerCase());
const nowIso = (d = new Date()) => d.toISOString();
const parseDb = (s) => (s ? new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z') : null);
const ymd = (d) => d.toISOString().slice(0, 10);
const safeJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

export function rowToJourney(r) {
    const graph = safeJson(r.graph, { nodes: [], edges: [] });
    return {
        id: r.id, name: r.name, entityType: r.entity_type, triggerType: r.trigger_type, triggerConfig: safeJson(r.trigger_config, {}),
        isActive: !!r.is_active, nodes: graph.nodes || [], edges: graph.edges || [], createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    };
}

// ── Validation (what the API checks before saving a journey) ────────────────
export function checkJourney(graph, schemas) {
    const errs = [];
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : null;
    const edges = Array.isArray(graph?.edges) ? graph.edges : [];
    if (!nodes) return ['the journey needs a list of steps'];
    if (nodes.length > MAX_NODES) return [`a journey can have up to ${MAX_NODES} steps`];
    if (edges.length > MAX_NODES * 2) return ['too many connections'];
    const ids = new Set();
    for (const n of nodes) {
        if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 100) { errs.push('every step needs an id'); continue; }
        if (ids.has(n.id)) errs.push(`step id "${n.id}" is used twice`);
        ids.add(n.id);
        if (!NODE_TYPES.includes(nodeType(n))) errs.push(`step "${n.data?.label || n.id}" has an unknown type`);
    }
    const triggers = nodes.filter(n => nodeType(n) === 'trigger');
    if (triggers.length !== 1) return [...errs, 'a journey needs exactly one Start Trigger'];
    const t = cfgOf(triggers[0]);
    const schema = schemas?.[t.entityType];
    if (!schema) errs.push('trigger: choose the record type');
    const tt = t.triggerType || 'create';
    if (!TRIGGERS.includes(tt)) errs.push('trigger: unknown event');
    if (tt === 'field_change' && !schema?.fields?.some(f => f.name === t.field)) errs.push('trigger: choose the field to watch');
    if (tt === 'date_arrives') {
        if (!schema?.fields?.some(f => f.name === t.field && ['date', 'datetime'].includes(f.type))) errs.push('trigger: choose a date field');
        if (!Number.isInteger(Number(t.offsetDays)) || Math.abs(Number(t.offsetDays)) > 3650) errs.push('trigger: days must be a whole number (negative = before the date)');
    }
    if (tt === 'inactive' && !(Number.isInteger(Number(t.days)) && Number(t.days) >= 1 && Number(t.days) <= 3650)) errs.push('trigger: days without activity must be 1 or more');
    const fieldNames = new Set((schema?.fields || []).map(f => f.name).concat(['status', 'id']));
    const ruleCheck = (r) => {
        if (!r || !fieldNames.has(r.field)) return 'pick a field of this record type';
        if (!RULE_OPS.includes(r.operator)) return 'unknown operator';
        return null;
    };
    for (const [label, g] of [['trigger conditions', t.conditions], ['stop condition', t.exitConditions]]) {
        const gate = normalizeGate(g);
        if (gate && gate.children?.length) errs.push(...checkGate(gate, ruleCheck).map(m => `${label}: ${m}`));
    }
    for (const n of nodes) {
        const ty = nodeType(n), c = cfgOf(n), label = n.data?.label || n.id;
        if (ty === 'action') {
            if (!ACTIONS.includes(c.type)) { errs.push(`"${label}": choose what this step does`); continue; }
            if (c.type === 'email' && !String(c.subject || '').trim()) errs.push(`"${label}": the e-mail needs a subject`);
            if (c.type === 'whatsapp' && !String(c.body || '').trim()) errs.push(`"${label}": the message is empty`);
            if (c.type === 'notify' && !String(c.message || '').trim()) errs.push(`"${label}": the notification needs a message`);
            if (c.type === 'assign_owner' && !c.userId && c.mode !== 'rules') errs.push(`"${label}": choose who to assign to`);
            if (c.type === 'create_record' && !schemas?.[c.entityType]) errs.push(`"${label}": choose the record type to create`);
            // Field mapping: every field being set must exist on the record type that is changed or created,
            // and every {field} copied into a value must exist on the record type that started the journey.
            const targetType = c.type === 'update_record' ? t.entityType : c.type === 'create_task' ? 'task' : c.type === 'create_lead' ? 'lead' : c.type === 'create_record' ? c.entityType : null;
            if (targetType && c.fields && typeof c.fields === 'object' && !Array.isArray(c.fields)) {
                const targetNames = new Set((schemas?.[targetType]?.fields || []).map(f => f.name).concat(['status']));
                for (const [k, v] of Object.entries(c.fields)) {
                    if (schemas?.[targetType] && !targetNames.has(k)) errs.push(`"${label}": "${k}" is not a field of ${schemas[targetType].label}`);
                    for (const used of tokensIn(v)) if (!fieldNames.has(used)) errs.push(`"${label}": {${used}} is not a field of ${schema?.label || 'the trigger record'}`);
                }
            } else if (c.fields !== undefined && targetType) errs.push(`"${label}": the fields to set must be a list of field = value`);
            if (c.type === 'webhook') {
                let u; try { u = new URL(String(c.url || '')); } catch { u = null; }
                if (!u || !['http:', 'https:'].includes(u.protocol)) errs.push(`"${label}": the webhook needs a full http(s) address`);
            }
        }
        if (ty === 'wait') {
            if (!WAIT_UNITS[c.unit]) errs.push(`"${label}": choose minutes, hours or days`);
            if (!(Number.isFinite(Number(c.amount)) && Number(c.amount) >= 1 && Number(c.amount) <= 3650)) errs.push(`"${label}": wait time must be 1 or more`);
        }
        if (ty === 'condition') {
            const gate = normalizeGate(c.conditions);
            if (!gate || !gate.children?.length) errs.push(`"${label}": add the condition to check`);
            else errs.push(...checkGate(gate, ruleCheck).map(m => `"${label}": ${m}`));
        }
    }
    // connections: known ends, one way out per step (two for If / Else), no loops
    const out = new Map();
    for (const e of edges) {
        if (!e || !ids.has(e.source) || !ids.has(e.target)) { errs.push('a connection points at a step that does not exist'); continue; }
        (out.get(e.source) || out.set(e.source, []).get(e.source)).push(e);
    }
    for (const n of nodes) {
        const es = out.get(n.id) || [], label = n.data?.label || n.id;
        if (nodeType(n) === 'condition') {
            const handles = es.map(e => e.sourceHandle);
            if (es.length > 2 || new Set(handles).size !== handles.length || handles.some(h => h !== 'true' && h !== 'false')) errs.push(`"${label}": connect at most one step to YES and one to NO`);
        } else if (es.length > 1) errs.push(`"${label}": a step can lead to only one next step (use If / Else to split the path)`);
    }
    const state = new Map();
    const cyc = (id) => {
        if (state.get(id) === 1) return true;
        if (state.get(id) === 2) return false;
        state.set(id, 1);
        for (const e of out.get(id) || []) if (cyc(e.target)) return true;
        state.set(id, 2);
        return false;
    };
    if (nodes.some(n => cyc(n.id))) errs.push('the steps loop back on themselves');
    return [...new Set(errs)].slice(0, 12);
}

/** Pull the searchable summary out of the trigger step. */
export function triggerOf(graph) {
    const t = (graph.nodes || []).find(n => nodeType(n) === 'trigger');
    const c = cfgOf(t);
    return { entityType: c.entityType, triggerType: c.triggerType || 'create', config: { field: c.field, to: c.to, offsetDays: c.offsetDays === undefined ? undefined : Number(c.offsetDays), days: c.days === undefined ? undefined : Number(c.days), conditions: c.conditions, exitConditions: c.exitConditions }, name: c.name || t?.data?.label };
}

export function summarizeTrigger(j, schemas = {}) {
    const ent = schemas[j.entityType]?.label || j.entityType;
    const c = j.triggerConfig || {};
    const f = (n) => schemas[j.entityType]?.fields?.find(x => x.name === n)?.label || n;
    switch (j.triggerType) {
        case 'create': return `${ent} is created`;
        case 'update': return `${ent} is updated`;
        case 'delete': return `${ent} is deleted`;
        case 'status_change': return `${ent} status changes${c.to ? ` to ${c.to}` : ''}`;
        case 'field_change': return `${f(c.field)} changes${c.to ? ` to ${c.to}` : ''} on a ${ent}`;
        case 'date_arrives': return `${Math.abs(c.offsetDays || 0) === 0 ? 'On' : `${Math.abs(c.offsetDays)} day(s) ${c.offsetDays < 0 ? 'before' : 'after'}`} ${f(c.field)} (${ent})`;
        case 'inactive': return `${ent} has no activity for ${c.days} day(s)`;
        default: return ent;
    }
}

// ── Running ─────────────────────────────────────────────────────────────────
const nextOf = (graph, id, handle) => {
    const es = (graph.edges || []).filter(e => e.source === id && (handle === undefined || e.sourceHandle === handle));
    return es[0]?.target || null;
};

export async function recordWithLabels(tenantId, entityType, rec) {
    try {
        const d = await db.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', tenantId, entityType);
        const def = d ? safeJson(d.config, null) : null;
        if (def?.fields?.some(f => f.type === 'lookup')) attachLabels([rec], await labelMapsFor(tenantId, entityType, def));
    } catch (e) { console.warn('[journeys] labels skipped:', e.message); }
    return rec;
}

async function loadRecord(tenantId, id) {
    const r = await db.get('SELECT id, entity_type, status, data, owner_id, updated_at FROM records WHERE id = ? AND tenant_id = ?', id, tenantId);
    if (!r) return null;
    const data = safeJson(r.data, {});
    // _labels: the words people read for lookup codes. Messages use them; conditions and field mapping use the codes.
    return recordWithLabels(tenantId, r.entity_type, { ...data, id: r.id, status: data.status ?? r.status, owner_id: r.owner_id, _updated_at: r.updated_at });
}

export function describeAction(c, record = {}) {
    const say = (t) => interpolate(t, record);
    switch (c.type) {
        case 'email': return `Send e-mail "${say(c.subject)}" to ${say(c.to ?? '{email}')}`;
        case 'whatsapp': return `Send WhatsApp to ${say(c.to ?? '{phone}')}`;
        case 'update_record': return `Set ${Object.keys(c.fields || {}).join(', ') || 'fields'} on the record`;
        case 'create_task': return `Create task "${say(c.subject)}"`;
        case 'create_lead': return 'Create a lead';
        case 'create_record': return `Create a ${c.entityType}`;
        case 'notify': return `Notify ${c.userId ? 'a user' : 'the owner'}: ${say(c.message)}`;
        case 'assign_owner': return c.userId ? 'Assign the record to a user' : 'Assign by assignment rules';
        case 'webhook': return `Call ${c.url}`;
        default: return c.type;
    }
}

const gateResult = (cond, record) => {
    const gate = normalizeGate(cond);
    if (!gate || !gate.children?.length) return true;
    return evaluateGate(gate, (r) => evaluateCondition(record, r));
};

async function notifyBuilder(run, journey, message) {
    try {
        const to = journey?.created_by;
        if (!to) return;
        await db.run('INSERT INTO notifications (id, tenant_id, user_id, title, body, kind, record_id, entity_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            uuidv4(), run.tenant_id, to, `Journey failed: ${run.journey_name}`, String(message).slice(0, 500), 'alert', run.record_id, run.entity_type);
    } catch (e) { console.warn('[journeys] could not notify the builder:', e.message); }
}

async function saveRun(id, patch) {
    const cols = Object.keys(patch);
    await db.run(`UPDATE journey_runs SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map(c => patch[c]), nowIso(), id);
}

// A journey step that changes a record can start other journeys (a cascade). To stop endless loops, a journey is never
// started on a record it is already running on, and cascades stop after MAX_CASCADE levels.
const inFlight = new Set();
const MAX_CASCADE = 3;

/** Run (or continue) one run until it waits, ends or fails. */
export async function executeRun(runId, opts = {}) {
    const run = await db.get('SELECT * FROM journey_runs WHERE id = ?', runId);
    if (!run) return null;
    const key = `${run.journey_id}:${run.record_id}`;
    inFlight.add(key);
    try { return await executeRunInner(run, opts); } finally { inFlight.delete(key); }
}

async function executeRunInner(run, { now = new Date(), depth = 0 } = {}) {
    const runId = run.id;
    const graph = safeJson(run.graph, { nodes: [], edges: [] });
    const steps = safeJson(run.steps, []);
    const byId = new Map((graph.nodes || []).map(n => [n.id, n]));
    let nodeId = run.current_node;
    let record = await loadRecord(run.tenant_id, run.record_id);
    const deleted = !record;
    if (deleted) record = { ...safeJson(run.snapshot, {}), id: run.record_id };
    const add = (n, result, note) => steps.push({ at: nowIso(), node: n.id, label: n.data?.label || nodeType(n), type: nodeType(n), result, note: note || undefined });
    let count = 0;
    try {
        while (nodeId) {
            if (++count > MAX_STEPS) throw new Error('too many steps in one run');
            const node = byId.get(nodeId);
            if (!node) break;
            const ty = nodeType(node), c = cfgOf(node);
            if (ty === 'trigger') { add(node, 'ok', 'started'); nodeId = nextOf(graph, nodeId); continue; }
            if (ty === 'action') {
                await runAction(c, { tenantId: run.tenant_id, entityType: run.entity_type, record, actorId: 'journey', workflowName: run.journey_name, depth: depth + 1 });
                add(node, 'ok', describeAction(c, record));
                if (!deleted) record = (await loadRecord(run.tenant_id, run.record_id)) || record;
                nodeId = nextOf(graph, nodeId);
                continue;
            }
            if (ty === 'condition') {
                const yes = gateResult(c.conditions, record);
                add(node, 'ok', yes ? 'YES' : 'NO');
                nodeId = nextOf(graph, nodeId, yes ? 'true' : 'false');
                continue;
            }
            if (ty === 'wait') {
                const ms = Number(c.amount) * WAIT_UNITS[c.unit];
                const due = new Date(now.getTime() + ms);
                add(node, 'waiting', `until ${due.toISOString()}`);
                const next = nextOf(graph, nodeId);
                if (!next) { await saveRun(runId, { status: 'done', current_node: null, due_at: null, steps: JSON.stringify(steps) }); return 'done'; }
                await saveRun(runId, { status: 'waiting', current_node: next, due_at: due.toISOString(), steps: JSON.stringify(steps) });
                return 'waiting';
            }
            break;
        }
        await saveRun(runId, { status: 'done', current_node: null, due_at: null, steps: JSON.stringify(steps) });
        return 'done';
    } catch (e) {
        const node = byId.get(nodeId);
        if (node) add(node, 'failed', e.message);
        await saveRun(runId, { status: 'failed', error: String(e.message).slice(0, 500), current_node: nodeId, due_at: null, steps: JSON.stringify(steps) });
        const j = await db.get('SELECT created_by FROM journeys WHERE id = ?', run.journey_id);
        await notifyBuilder(run, j, `${node?.data?.label || 'A step'} failed: ${e.message}`);
        console.error(`[journeys] "${run.journey_name}" failed on ${run.record_id}:`, e.message);
        return 'failed';
    }
}

async function startRun(j, record, { key = null, depth = 0 } = {}) {
    const trig = (j.graph.nodes || []).find(n => nodeType(n) === 'trigger');
    const id = uuidv4();
    try {
        await db.run(`INSERT INTO journey_runs (id, tenant_id, journey_id, journey_name, entity_type, record_id, status, current_node, graph, snapshot, steps, trigger_key, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, '[]', ?, ?, ?)`,
            id, j.tenant_id, j.id, j.name, j.entity_type, record.id, trig.id, JSON.stringify(j.graph), JSON.stringify(record), key, nowIso(), nowIso());
    } catch (e) {
        if (/UNIQUE|duplicate key/i.test(e.message)) return null;      // this record already ran for this date / inactivity
        throw e;
    }
    await executeRun(id, { depth });
    return id;
}

const loadActive = async (tenantId, entityType) => (await db.all('SELECT * FROM journeys WHERE tenant_id = ? AND entity_type = ? AND is_active = 1', tenantId, entityType))
    .map(r => ({ ...r, graph: safeJson(r.graph, { nodes: [], edges: [] }), cfg: safeJson(r.trigger_config, {}) }));

/** Called after a record is created, updated or deleted. */
export async function triggerJourneys({ tenantId, entityType, triggerType, record, oldRecord = null, depth = 0 }) {
    if (depth > MAX_CASCADE) return;
    const list = await loadActive(tenantId, entityType);
    for (const j of list) {
        try {
            if (inFlight.has(`${j.id}:${record?.id}`)) continue;      // never re-start a journey on the record it is already working on
            const c = j.cfg || {};
            let hit = false;
            switch (j.trigger_type) {
                case 'create': case 'update': case 'delete': hit = triggerType === j.trigger_type; break;
                case 'status_change': hit = triggerType === 'update' && !!oldRecord && norm(record.status) !== norm(oldRecord.status) && (!c.to || norm(record.status) === norm(c.to)); break;
                case 'field_change': hit = triggerType === 'update' && !!oldRecord && !!c.field && norm(record[c.field]) !== norm(oldRecord[c.field]) && (!c.to || norm(record[c.field]) === norm(c.to)); break;
                default: hit = false;
            }
            if (!hit || !record?.id || !gateResult(c.conditions, record)) continue;
            await startRun(j, record, { depth });
        } catch (e) { console.error(`[journeys] could not start "${j.name}":`, e.message); }
    }
}

/** Start journeys whose trigger is a date arriving or a record going quiet. asOf lets tests move the clock. */
export async function scanTimeTriggers(asOf = new Date()) {
    const list = (await db.all("SELECT * FROM journeys WHERE is_active = 1 AND trigger_type IN ('date_arrives', 'inactive')"))
        .map(r => ({ ...r, graph: safeJson(r.graph, { nodes: [], edges: [] }), cfg: safeJson(r.trigger_config, {}) }));
    let started = 0;
    for (const j of list) {
        try {
            const rows = await db.all('SELECT id, status, data, owner_id, updated_at FROM records WHERE tenant_id = ? AND entity_type = ?', j.tenant_id, j.entity_type);
            for (const r of rows) {
                const data = safeJson(r.data, {});
                const rec = { ...data, id: r.id, status: data.status ?? r.status, owner_id: r.owner_id };
                let key = null;
                if (j.trigger_type === 'date_arrives') {
                    const raw = data[j.cfg.field];
                    if (!raw) continue;
                    const d = new Date(String(raw).slice(0, 10) + 'T00:00:00Z');
                    if (Number.isNaN(d.getTime())) continue;
                    d.setUTCDate(d.getUTCDate() + Number(j.cfg.offsetDays || 0));
                    if (ymd(d) !== ymd(asOf)) continue;
                    key = `date:${j.cfg.field}:${String(raw).slice(0, 10)}:${j.cfg.offsetDays || 0}`;
                } else {
                    const upd = parseDb(r.updated_at);
                    if (!upd || asOf.getTime() - upd.getTime() < Number(j.cfg.days) * WAIT_UNITS.days) continue;
                    key = `inactive:${r.updated_at}`;
                }
                if (!gateResult(j.cfg.conditions, rec)) continue;
                if (await startRun(j, rec, { key })) started++;
            }
        } catch (e) { console.error(`[journeys] scan failed for "${j.name}":`, e.message); }
    }
    return started;
}

/** Continue every wait that is due. Returns how many runs moved. */
export async function processDue(asOf = new Date()) {
    // A run left "running" by a crash or restart is ended rather than repeated (its steps may already have happened).
    const stale = new Date(asOf.getTime() - 10 * 60 * 1000).toISOString();
    await db.run("UPDATE journey_runs SET status = 'failed', error = 'Interrupted by a restart', updated_at = ? WHERE status = 'running' AND updated_at < ?", nowIso(), stale);
    const due = await db.all("SELECT id FROM journey_runs WHERE status = 'waiting' AND due_at <= ? ORDER BY due_at LIMIT 100", asOf.toISOString());
    let moved = 0;
    for (const { id } of due) {
        const claim = await db.run("UPDATE journey_runs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'waiting'", nowIso(), id);
        if (!(claim?.changes ?? claim?.rowCount)) continue;
        const run = await db.get('SELECT * FROM journey_runs WHERE id = ?', id);
        const graph = safeJson(run.graph, { nodes: [] });
        const steps = safeJson(run.steps, []);
        const record = await loadRecord(run.tenant_id, run.record_id);
        const cancel = async (why) => { steps.push({ at: nowIso(), node: run.current_node, label: 'Stopped', type: 'wait', result: 'cancelled', note: why }); await saveRun(id, { status: 'cancelled', due_at: null, steps: JSON.stringify(steps) }); };
        if (!record) { await cancel('the record was deleted'); moved++; continue; }
        const stopWhen = cfgOf((graph.nodes || []).find(n => nodeType(n) === 'trigger')).exitConditions;
        const gate = normalizeGate(stopWhen);
        if (gate?.children?.length && gateResult(stopWhen, record)) { await cancel('the stop condition is now true'); moved++; continue; }
        await executeRun(id, { now: asOf });
        moved++;
    }
    return moved;
}

/** Dry run on one record: the path the journey would take, with nothing sent or changed. */
export function testJourney(graph, record, { entityType } = {}) {
    const byId = new Map((graph.nodes || []).map(n => [n.id, n]));
    const trig = (graph.nodes || []).find(n => nodeType(n) === 'trigger');
    const steps = [];
    const tc = cfgOf(trig);
    const startsHere = gateResult(tc.conditions, record);
    steps.push({ label: trig?.data?.label || 'Start', type: 'trigger', result: startsHere ? 'ok' : 'blocked', note: startsHere ? 'the start conditions match this record' : 'the start conditions do NOT match this record, so the journey would not start' });
    let nodeId = startsHere ? nextOf(graph, trig?.id) : null, count = 0;
    while (nodeId && ++count <= MAX_STEPS) {
        const node = byId.get(nodeId);
        if (!node) break;
        const ty = nodeType(node), c = cfgOf(node), label = node.data?.label || ty;
        if (ty === 'action') { steps.push({ label, type: ty, result: 'would run', note: describeAction(c, record) }); nodeId = nextOf(graph, nodeId); }
        else if (ty === 'condition') { const yes = gateResult(c.conditions, record); steps.push({ label, type: ty, result: yes ? 'YES' : 'NO', note: `this record takes the ${yes ? 'YES' : 'NO'} path` }); nodeId = nextOf(graph, nodeId, yes ? 'true' : 'false'); }
        else if (ty === 'wait') { steps.push({ label, type: ty, result: 'would wait', note: `${c.amount} ${c.unit}` }); nodeId = nextOf(graph, nodeId); }
        else break;
    }
    return { startsHere, steps, ended: !nodeId };
}

// ── Scheduler ───────────────────────────────────────────────────────────────
let started = false;
export function startJourneyScheduler() {
    if (started) return;
    started = true;
    let tick = 0;
    const run = async () => {
        try {
            await processDue();
            if (tick++ % 5 === 0) await scanTimeTriggers();       // dates and inactivity: every 5th minute
        } catch (e) { console.error('[journeys] scheduler tick failed:', e.message); }
    };
    setInterval(run, 60 * 1000).unref();
    setTimeout(run, 5000).unref();
    console.log('[journeys] Scheduler started (waits are checked every minute)');
}

// ── One-time move of the old single "workflow" per workspace into journeys ──
export async function migrateLegacyWorkflows(d) {
    const rows = await d.all('SELECT * FROM workflows WHERE is_active = 1');
    for (const w of rows) {
        const seen = await d.get('SELECT id FROM journeys WHERE source_id = ? AND tenant_id = ?', w.id, w.tenant_id);
        if (!seen) {
            let graph = safeJson(w.flow_data, null);
            if (!graph?.nodes?.length) {
                const actions = safeJson(w.actions, []);
                const nodes = [{ id: 't', type: 'trigger', data: { type: 'trigger', label: w.name, config: { entityType: w.entity_type, triggerType: w.trigger_type, conditions: safeJson(w.conditions, {}) } } }];
                const edges = [];
                let prev = 't';
                actions.forEach((a, i) => { const id = `a${i}`; nodes.push({ id, type: 'action', data: { type: 'action', label: a.type, config: a } }); edges.push({ id: `e${i}`, source: prev, target: id }); prev = id; });
                graph = { nodes, edges };
            }
            // Old wait nodes stored seconds; turn them into the new minutes / hours / days form.
            for (const n of graph.nodes) if (nodeType(n) === 'wait') {
                const c = n.data.config = n.data.config || {};
                if (c.seconds !== undefined && c.amount === undefined) { const s = Number(c.seconds) || 0; c.unit = s >= 86400 ? 'days' : s >= 3600 ? 'hours' : 'minutes'; c.amount = Math.max(1, Math.round(s / (WAIT_UNITS[c.unit] / 1000))); }
            }
            const t = triggerOf(graph);
            await d.run('INSERT INTO journeys (id, tenant_id, name, entity_type, trigger_type, trigger_config, graph, is_active, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
                uuidv4(), w.tenant_id, t.name || w.name || 'Journey', t.entityType || w.entity_type, TRIGGERS.includes(t.triggerType) ? t.triggerType : 'create', JSON.stringify(t.config), JSON.stringify(graph), w.id);
        }
        await d.run('UPDATE workflows SET is_active = 0 WHERE id = ?', w.id);
    }
}
