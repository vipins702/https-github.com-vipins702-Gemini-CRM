import db from '../database.js';
import { sendEmail } from './email.js';
import { logAudit } from './audit.js';
import { v4 as uuidv4 } from 'uuid';
import { calculateLeadScore } from './scoring.js';
import { assignLead } from './assignment.js';
import { evaluateRealtimeLeadRules } from './leadgen.js';

/**
 * Workflow / Journey execution engine.
 *
 * Conditions support two formats:
 *   - new:    { match: 'all'|'any', rules: [{ field, operator, value }] }
 *   - legacy: { status: 'Won', source: 'Web' }  (flat key=value, matched as ALL)
 *
 * Actions (action.type):
 *   - email          { to, subject, body }            -> sends email (templated)
 *   - update_record  { fields: { status, score } }    -> updates the triggering record
 *   - create_task    { subject, dueInDays, status }   -> creates a linked task record
 *   - create_lead    { fields }                        -> creates a lead record
 *   - create_record  { entityType, fields }            -> creates any entity record
 *   - wait           { seconds }                        -> logged only (see note below)
 *
 * Templating: any string value may contain {fieldName} which is replaced from the
 * triggering record (e.g. subject: "Welcome {firstName}").
 *
 * NOTE: actions write directly to the records table (not via the API), so they do
 * NOT recursively re-trigger workflow evaluation. Timed `wait` delays are not
 * executed inline (that needs a scheduler/job-queue) — they are logged and skipped.
 */

const OPERATORS = {
    '==': (a, b) => String(a) === String(b),
    '!=': (a, b) => String(a) !== String(b),
    '>': (a, b) => Number(a) > Number(b),
    '<': (a, b) => Number(a) < Number(b),
    '>=': (a, b) => Number(a) >= Number(b),
    '<=': (a, b) => Number(a) <= Number(b),
    'contains': (a, b) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
    'not_contains': (a, b) => !String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
    'is_empty': (a) => a === undefined || a === null || String(a).trim() === '',
    'is_not_empty': (a) => !(a === undefined || a === null || String(a).trim() === ''),
};

function evaluateCondition(record, cond) {
    const op = OPERATORS[cond.operator];
    if (!op) return false;
    return op(record[cond.field], cond.value);
}

function checkConditions(record, conditions) {
    if (!conditions) return true;
    // New structured format
    if (Array.isArray(conditions.rules)) {
        if (conditions.rules.length === 0) return true;
        const match = conditions.match === 'any' ? 'some' : 'every';
        return conditions.rules[match](r => evaluateCondition(record, r));
    }
    // Legacy flat key=value format (matched as ALL)
    if (typeof conditions === 'object') {
        return Object.entries(conditions).every(([k, v]) => String(record[k]) === String(v));
    }
    return true;
}

function interpolate(text, record) {
    if (text === undefined || text === null) return '';
    return String(text).replace(/\{(\w+)\}/g, (_, key) => (record[key] !== undefined ? record[key] : ''));
}

function interpolateFields(fields, record) {
    const out = {};
    for (const [k, v] of Object.entries(fields || {})) {
        out[k] = typeof v === 'string' ? interpolate(v, record) : v;
    }
    return out;
}

export async function evaluateWorkflows({ tenantId, entityType, triggerType, record, actorId, depth = 0 }) {
    if (depth > 5) {
        console.warn(`[workflow] Recursion guard triggered at depth ${depth}`);
        return;
    }
    try {
        const workflows = await db.all(
            `SELECT * FROM workflows
             WHERE tenant_id = ? AND entity_type = ? AND trigger_type = ? AND is_active = 1`,
            tenantId, entityType, triggerType
        );
        if (!workflows.length) return;

        for (const wf of workflows) {
            const conditions = wf.conditions ? JSON.parse(wf.conditions) : {};
            const actions = wf.actions ? JSON.parse(wf.actions) : [];
            if (!checkConditions(record, conditions)) continue;

            console.log(`[workflow] Executing "${wf.name}" (${actions.length} action(s))`);
            for (const action of actions) {
                try {
                    await runAction(action, { tenantId, entityType, record, actorId: actorId || 'system', workflowName: wf.name, depth });
                } catch (err) {
                    console.error(`[workflow] Action "${action.type}" failed:`, err.message);
                }
            }
        }
    } catch (error) {
        console.error('Workflow evaluation failed:', error);
    }
}

async function runAction(action, ctx) {
    switch (action.type) {
        case 'email':
            return runEmail(action, ctx);
        case 'update_record':
            return runUpdateRecord(action, ctx);
        case 'create_task':
            return runCreateRecord('task', action, ctx);
        case 'create_lead':
            return runCreateRecord('lead', action, ctx);
        case 'create_record':
            return runCreateRecord(action.entityType || 'task', action, ctx);
        case 'wait':
            console.log(`[workflow] "wait" action skipped (timed delays require the scheduler): ${action.seconds || 0}s`);
            return;
        default:
            console.warn(`[workflow] Unknown action type: ${action.type}`);
    }
}

async function runEmail(action, ctx) {
    await sendEmail({
        to: interpolate(action.to, ctx.record),
        subject: interpolate(action.subject, ctx.record),
        html: interpolate(action.body, ctx.record),
        tenantId: ctx.tenantId,
        actorId: ctx.actorId || 'workflow',
    });
}

async function runUpdateRecord(action, ctx) {
    const { tenantId, entityType, record, actorId } = ctx;
    if (!record?.id) return;

    const row = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ?', record.id, tenantId);
    if (!row) return;

    let data = {};
    try { data = JSON.parse(row.data); } catch (e) { data = {}; }

    const fields = action.fields || action.set || {};
    const applied = interpolateFields(fields, { ...data, ...record });
    const merged = { ...data, ...applied };

    const primaryDisplay = merged.name || merged.title || merged.subject || row.primary_display;
    const status = applied.status || row.status;

    await db.run(
        'UPDATE records SET data = ?, primary_display = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
        JSON.stringify(merged), primaryDisplay, status, record.id, tenantId
    );
    await logAudit({
        tenantId, entityType, recordId: record.id, action: 'update', actorId,
        details: { ...applied, _via: 'workflow', _rule: ctx.workflowName },
    });
    console.log(`[workflow] update_record applied to ${entityType}:${record.id}`);

    // Cascade update triggers
    const cascadedRecord = { ...merged, id: record.id };
    await evaluateWorkflows({
        tenantId, entityType, triggerType: 'update', record: cascadedRecord,
        actorId, depth: (ctx.depth || 0) + 1
    });
}

async function runCreateRecord(targetEntity, action, ctx) {
    const { tenantId, entityType, record, actorId, workflowName } = ctx;

    const fields = interpolateFields(action.fields || {}, record || {});

    // Provenance + linkage to the triggering record
    fields._via = 'workflow';
    fields._rule = workflowName;
    fields._source_entity = entityType;
    fields._source_record_id = record?.id;

    // Sensible defaults per entity
    if (targetEntity === 'task') {
        if (!fields.subject) fields.subject = interpolate(action.subject || `Follow up (${workflowName})`, record || {});
        fields.customerId = entityType === 'customer' ? record?.id : (record?.customerId || record?.relatedCustomer);
        if (action.dueInDays) {
            const d = new Date();
            d.setDate(d.getDate() + Number(action.dueInDays));
            fields.dueDate = d.toISOString().slice(0, 10);
        }
    }
    if (targetEntity === 'lead') {
        fields.relatedCustomer = entityType === 'customer' ? record?.id : record?.relatedCustomer;
        if (!fields.source) fields.source = `Workflow: ${workflowName}`;
    }

    const id = uuidv4();
    const primaryDisplay = fields.name || fields.title || fields.subject ||
        [fields.firstName, fields.lastName].filter(Boolean).join(' ') || `${targetEntity} (auto)`;
    const status = fields.status || 'New';

    await db.run(
        'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
        id, tenantId, targetEntity, primaryDisplay, status, JSON.stringify(fields)
    );
    await logAudit({
        tenantId, entityType: targetEntity, recordId: id, action: 'create', actorId,
        details: { ...fields },
    });
    console.log(`[workflow] create ${targetEntity}:${id} ("${primaryDisplay}")`);

    // Cascade creation triggers
    try {
        if (targetEntity === 'lead') {
            const computedScore = await calculateLeadScore(fields, tenantId);
            if (computedScore > 0) {
                fields.score = computedScore;
                await db.run('UPDATE records SET data = ? WHERE id = ? AND tenant_id = ?', JSON.stringify(fields), id, tenantId);
            }
            await assignLead(tenantId, id, fields);
        }
        await evaluateWorkflows({
            tenantId, entityType: targetEntity, triggerType: 'create',
            record: { ...fields, id }, actorId, depth: (ctx.depth || 0) + 1
        });
        await evaluateRealtimeLeadRules({
            tenantId, entityType: targetEntity, record: { ...fields, id },
            actorId, depth: (ctx.depth || 0) + 1
        });
    } catch (err) {
        console.error(`[workflow] Cascade failed after record creation:`, err.message);
    }
}
