import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from './audit.js';

/**
 * Lead Generation Engine
 * --------------------------------------------------
 * Evaluates segment-style rules against source records (e.g. customers)
 * and auto-creates lead records for the matches.
 *
 * A rule looks like:
 * {
 *   source_entity: 'customer',
 *   target_entity: 'lead',
 *   conditions: { match: 'all', rules: [ { field, operator, value } ] },
 *   field_mapping: { firstName: 'firstName', company: 'name' },
 *   default_values: { source: 'Auto Rule', score: 20 },
 *   assign_to: '<userId>',
 *   dedupe: 1
 * }
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

function evaluateCondition(record, condition) {
    const op = OPERATORS[condition.operator];
    if (!op) return false;
    return op(record[condition.field], condition.value);
}

export function evaluateConditions(record, conditions) {
    if (!conditions || !Array.isArray(conditions.rules) || conditions.rules.length === 0) {
        return true; // No conditions = match everything
    }
    const match = conditions.match === 'any' ? 'any' : 'all';
    if (match === 'any') {
        return conditions.rules.some(rule => evaluateCondition(record, rule));
    }
    return conditions.rules.every(rule => evaluateCondition(record, rule));
}

/** Flatten a records-table row into a plain object (matching the GET /api/data convention). */
function hydrateRecord(row) {
    let data = {};
    try {
        data = JSON.parse(row.data);
    } catch (e) {
        data = {};
    }
    return { ...data, id: row.id, status: row.status, created_at: row.created_at };
}

/** Build the lead payload from a matched source record using the rule's mapping + defaults. */
function buildLeadData(sourceRecord, rule) {
    const mapping = rule.field_mapping ? JSON.parse(rule.field_mapping) : {};
    const defaults = rule.default_values ? JSON.parse(rule.default_values) : {};

    const leadData = { ...defaults };

    // Apply field mapping: leadField <- sourceField
    for (const [leadField, sourceField] of Object.entries(mapping)) {
        leadData[leadField] = sourceRecord[sourceField];
    }

    // Provenance metadata (used for dedupe + traceability)
    leadData._generated_by_rule = rule.id;
    leadData._source_entity = rule.source_entity;
    leadData._source_record_id = sourceRecord.id;
    if (rule.assign_to) leadData._assigned_to = rule.assign_to;
    if (!leadData.source) leadData.source = `Rule: ${rule.name}`;

    return leadData;
}

/**
 * Run a single lead rule.
 * @param {object} rule       Row from lead_rules
 * @param {string} tenantId
 * @param {string} actorId
 * @param {object} opts       { dryRun?: boolean }
 * @returns {Promise<{ matched: number, created: number, skipped: number, preview: object[] }>}
 */
export async function runLeadRule(rule, tenantId, actorId, opts = {}) {
    const dryRun = !!opts.dryRun;
    const conditions = rule.conditions ? JSON.parse(rule.conditions) : { match: 'all', rules: [] };
    const targetEntity = rule.target_entity || 'lead';

    // 1. Load source records
    const sourceRows = await db.all(
        'SELECT * FROM records WHERE tenant_id = ? AND entity_type = ?',
        tenantId, rule.source_entity
    );
    const sourceRecords = sourceRows.map(hydrateRecord);

    // 2. Filter by conditions
    const matches = sourceRecords.filter(r => evaluateConditions(r, conditions));

    // 3. Pre-load existing generated leads for dedupe
    let existingSourceIds = new Set();
    if (rule.dedupe) {
        const leadRows = await db.all(
            'SELECT data FROM records WHERE tenant_id = ? AND entity_type = ?',
            tenantId, targetEntity
        );
        for (const row of leadRows) {
            try {
                const d = JSON.parse(row.data);
                if (d._generated_by_rule === rule.id && d._source_record_id) {
                    existingSourceIds.add(d._source_record_id);
                }
            } catch (e) { /* ignore */ }
        }
    }

    let created = 0;
    let skipped = 0;
    const preview = [];

    for (const sourceRecord of matches) {
        if (rule.dedupe && existingSourceIds.has(sourceRecord.id)) {
            skipped++;
            continue;
        }

        const leadData = buildLeadData(sourceRecord, rule);
        const primaryDisplay =
            leadData.name || leadData.title ||
            [leadData.firstName, leadData.lastName].filter(Boolean).join(' ') ||
            sourceRecord.primary_display || sourceRecord.name || 'Auto Lead';
        const status = leadData.status || 'New';

        preview.push({ sourceId: sourceRecord.id, primaryDisplay, leadData });

        if (!dryRun) {
            const id = uuidv4();
            await db.run(
                `INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                id, tenantId, targetEntity, primaryDisplay, status, JSON.stringify(leadData)
            );
            await logAudit({
                tenantId,
                entityType: targetEntity,
                recordId: id,
                action: 'create',
                actorId,
                details: { ...leadData, _via: 'lead_rule', _rule_name: rule.name },
            });
            created++;
            existingSourceIds.add(sourceRecord.id);
        }
    }

    // 4. Record run metadata (only on real runs)
    if (!dryRun) {
        await db.run(
            'UPDATE lead_rules SET last_run_at = CURRENT_TIMESTAMP, last_run_count = ? WHERE id = ? AND tenant_id = ?',
            created, rule.id, tenantId
        );
    }

    return {
        matched: matches.length,
        created,
        skipped,
        preview: preview.slice(0, 50), // cap preview payload
    };
}

/** Run all active rules for a tenant (used by scheduler / manual "run all"). */
export async function runAllActiveRules(tenantId, actorId) {
    const rules = await db.all(
        'SELECT * FROM lead_rules WHERE tenant_id = ? AND is_active = 1',
        tenantId
    );
    const results = [];
    for (const rule of rules) {
        const result = await runLeadRule(rule, tenantId, actorId, { dryRun: false });
        results.push({ ruleId: rule.id, name: rule.name, ...result });
    }
    return results;
}

/**
 * Run a single source record against all active "realtime" rules for its entity.
 * Called from the record create path. Inserts leads directly (no recursion through the API).
 */
export async function evaluateRealtimeLeadRules({ tenantId, entityType, record, actorId }) {
    try {
        const rules = await db.all(
            `SELECT * FROM lead_rules WHERE tenant_id = ? AND source_entity = ? AND is_active = 1 AND schedule = 'realtime'`,
            tenantId, entityType
        );
        if (rules.length === 0) return;

        for (const rule of rules) {
            const conditions = rule.conditions ? JSON.parse(rule.conditions) : { match: 'all', rules: [] };
            if (!evaluateConditions(record, conditions)) continue;

            // Dedupe: skip if a lead from this rule+source already exists
            const targetEntity = rule.target_entity || 'lead';
            if (rule.dedupe) {
                const leadRows = await db.all(
                    'SELECT data FROM records WHERE tenant_id = ? AND entity_type = ?',
                    tenantId, targetEntity
                );
                const already = leadRows.some(row => {
                    try {
                        const d = JSON.parse(row.data);
                        return d._generated_by_rule === rule.id && d._source_record_id === record.id;
                    } catch (e) { return false; }
                });
                if (already) continue;
            }

            const leadData = buildLeadData(record, rule);
            const primaryDisplay =
                leadData.name || leadData.title ||
                [leadData.firstName, leadData.lastName].filter(Boolean).join(' ') ||
                record.primary_display || record.name || 'Auto Lead';
            const status = leadData.status || 'New';
            const id = uuidv4();

            await db.run(
                `INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                id, tenantId, targetEntity, primaryDisplay, status, JSON.stringify(leadData)
            );
            await logAudit({
                tenantId, entityType: targetEntity, recordId: id, action: 'create', actorId,
                details: { ...leadData, _via: 'lead_rule_realtime', _rule_name: rule.name },
            });
            console.log(`[leadgen] Realtime rule "${rule.name}" created lead ${id}`);
        }
    } catch (error) {
        console.error('Realtime lead rule evaluation failed:', error);
    }
}

/**
 * Run all interval rules that are due (next_run_at <= now or null).
 * Called by the in-process scheduler. Iterates every tenant that has interval rules.
 */
export async function runDueIntervalRules() {
    try {
        const dueRules = await db.all(
            `SELECT * FROM lead_rules
             WHERE is_active = 1 AND schedule = 'interval'
             AND (next_run_at IS NULL OR next_run_at <= CURRENT_TIMESTAMP)`
        );
        if (dueRules.length === 0) return;

        for (const rule of dueRules) {
            const result = await runLeadRule(rule, rule.tenant_id, 'system', { dryRun: false });
            const minutes = rule.interval_minutes && rule.interval_minutes > 0 ? rule.interval_minutes : 60;
            // Schedule next run
            await db.run(
                `UPDATE lead_rules SET next_run_at = datetime(CURRENT_TIMESTAMP, '+' || ? || ' minutes') WHERE id = ?`,
                minutes, rule.id
            );
            if (result.created > 0) {
                console.log(`[leadgen] Interval rule "${rule.name}" created ${result.created} lead(s); next run in ${minutes}m`);
            }
        }
    } catch (error) {
        console.error('Interval lead rule scheduler failed:', error);
    }
}

/** Start the in-process scheduler. Checks for due interval rules every minute. */
export function startLeadRuleScheduler() {
    const INTERVAL_MS = 60 * 1000; // 1 minute
    setInterval(() => { runDueIntervalRules(); }, INTERVAL_MS);
    console.log('[leadgen] Lead-rule scheduler started (checks every 60s)');
}
