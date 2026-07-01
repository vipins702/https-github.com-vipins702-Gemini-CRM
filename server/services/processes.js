import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from './audit.js';
import { sendEmail } from './email.js';

/**
 * Configurable process / stage engine (metadata-driven, DB-driven, per tenant + entity).
 *
 * A "process" is an ordered list of stages for an entity (lead pipeline, quote lifecycle,
 * case workflow…). Tenants define their own — the Pipeline board, transition validation,
 * and (Phase 2) per-stage automations all read from here instead of hardcoded statuses.
 *
 * stage = { id, name, order, color, type:'open'|'won'|'lost',
 *           requiredFields?:string[], entryActions?:[{type,...}] }
 */

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function stage(name, color, type = 'open') {
    return { id: slug(name), name, color, type, requiredFields: [], entryActions: [] };
}

// Built-in defaults — used when a tenant hasn't customised the process yet.
const DEFAULTS = {
    lead: {
        name: 'Sales Pipeline',
        stages: [
            stage('New', '#EA7317'),
            stage('Contacted', '#2563EB'),
            stage('Qualified', '#2563EB'),
            stage('Won', '#059669', 'won'),
            stage('Lost', '#DC2626', 'lost'),
        ],
    },
    quote: {
        name: 'Quote Lifecycle',
        stages: [
            stage('Draft', '#6E7490'),
            stage('Sent', '#2563EB'),
            stage('Accepted', '#059669', 'won'),
            stage('Declined', '#DC2626', 'lost'),
            stage('Expired', '#6E7490', 'lost'),
        ],
    },
    case: {
        name: 'Case Workflow',
        stages: [
            stage('New', '#EA7317'),
            stage('In Progress', '#2563EB'),
            stage('Resolved', '#059669', 'won'),
            stage('Closed', '#6E7490', 'lost'),
        ],
    },
};

function normalizeStages(stages) {
    return (Array.isArray(stages) ? stages : []).map((s, i) => ({
        id: s.id || slug(s.name) || `stage_${i}`,
        name: String(s.name || `Stage ${i + 1}`),
        order: i,
        color: s.color || '#6E7490',
        type: ['open', 'won', 'lost'].includes(s.type) ? s.type : 'open',
        requiredFields: Array.isArray(s.requiredFields) ? s.requiredFields : [],
        entryActions: Array.isArray(s.entryActions) ? s.entryActions : [],
        requireNote: Boolean(s.requireNote),
    }));
}

/** Get the process for an entity — stored definition, else built-in default. */
export async function getProcess(tenantId, entityType) {
    const row = await db.get('SELECT config FROM processes WHERE tenant_id = ? AND entity_type = ?', tenantId, entityType);
    if (row) {
        let cfg = {};
        try { cfg = JSON.parse(row.config); } catch { cfg = {}; }
        return { entityType, name: cfg.name || entityType, stages: normalizeStages(cfg.stages), source: 'custom' };
    }
    const def = DEFAULTS[entityType];
    return def
        ? { entityType, name: def.name, stages: normalizeStages(def.stages), source: 'default' }
        : { entityType, name: entityType, stages: [], source: 'none' };
}

export async function saveProcess(tenantId, entityType, config = {}) {
    const stages = normalizeStages(config.stages);
    if (!stages.length) throw new Error('A process needs at least one stage');
    const payload = JSON.stringify({ name: config.name || entityType, stages });
    const existing = await db.get('SELECT id FROM processes WHERE tenant_id = ? AND entity_type = ?', tenantId, entityType);
    if (existing) {
        await db.run('UPDATE processes SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', payload, existing.id);
    } else {
        await db.run('INSERT INTO processes (id, tenant_id, entity_type, config) VALUES (?, ?, ?, ?)', uuidv4(), tenantId, entityType, payload);
    }
    return getProcess(tenantId, entityType);
}

/** Which entities have a configurable process (for the builder's entity picker). */
export function configurableEntities() {
    return Object.keys(DEFAULTS);
}

/** Find a stage by name (or slug) within a process. */
export async function findStage(tenantId, entityType, name) {
    const p = await getProcess(tenantId, entityType);
    return p.stages.find(s => s.name === name || s.id === slug(name)) || null;
}

// Replace {field} tokens from the record data.
const interpolate = (tpl, data) =>
    String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (data && data[k] != null ? String(data[k]) : ''));

/**
 * Entry requirements: fields that must be present on the record to ENTER this stage.
 * Returns the list of missing field names (empty = OK to enter).
 */
export function missingForStage(stage, data) {
    if (!stage || !Array.isArray(stage.requiredFields)) return [];
    return stage.requiredFields.filter(f => {
        const v = data?.[f];
        return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    });
}

/**
 * Fire a stage's entry actions (create_task | email | webhook). Each action is
 * best-effort — a failure is logged but never blocks the transition.
 */
export async function runStageEntryActions(tenantId, entityType, recordId, data, stage, actorId = 'system') {
    const actions = Array.isArray(stage?.entryActions) ? stage.entryActions : [];
    const recordName = data?.name || [data?.firstName, data?.lastName].filter(Boolean).join(' ') || data?.company || recordId;

    for (const action of actions) {
        try {
            if (action.type === 'create_task') {
                const id = uuidv4();
                const subject = interpolate(action.subject || `Follow up: ${stage.name}`, data);
                const taskData = {
                    subject, name: subject, status: 'Not Started', priority: action.priority || 'Medium',
                    assigneeId: action.assigneeId || '', assignee: action.assignee || '',
                    relatedEntity: entityType, relatedId: recordId, relatedName: recordName,
                    ...(entityType === 'customer' ? { customerId: recordId } : {}),
                    _via: 'stage_action', _stage: stage.name,
                };
                await db.run('INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
                    id, tenantId, 'task', subject, 'Not Started', JSON.stringify(taskData));
                await logAudit({ tenantId, entityType: 'task', recordId: id, action: 'create', actorId, details: { ...taskData } });
            } else if (action.type === 'email') {
                await sendEmail({
                    to: interpolate(action.to || data?.email || '', data),
                    subject: interpolate(action.subject || `Update: ${stage.name}`, data),
                    html: interpolate(action.body || '', data),
                    tenantId, actorId,
                });
            } else if (action.type === 'webhook' && action.url) {
                await fetch(action.url, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'stage_entered', entityType, recordId, stage: stage.name, data }),
                }).catch(() => {});
            }
        } catch (e) {
            console.warn(`[processes] entry action (${action.type}) failed for ${entityType}/${recordId} @ ${stage.name}:`, e.message);
        }
    }
}
