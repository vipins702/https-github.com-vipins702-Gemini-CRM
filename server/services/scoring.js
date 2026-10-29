import db from '../database.js';

/**
 * Lead Scoring Engine
 * Evaluates scoring_rules against a lead record and returns an integer score.
 * Rules: { field, operator, value, points }
 * Operators: ==, !=, contains, is_empty, is_not_empty, >, <, >=, <=
 */

const OPERATORS = {
    '==':          (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase(),
    '!=':          (a, b) => String(a ?? '').toLowerCase() !== String(b ?? '').toLowerCase(),
    '>':           (a, b) => Number(a) > Number(b),
    '<':           (a, b) => Number(a) < Number(b),
    '>=':          (a, b) => Number(a) >= Number(b),
    '<=':          (a, b) => Number(a) <= Number(b),
    'contains':    (a, b) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
    'not_contains':(a, b) => !String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
    'is_empty':    (a)    => a === undefined || a === null || String(a).trim() === '',
    'is_not_empty':(a)    => !(a === undefined || a === null || String(a).trim() === ''),
};

/**
 * Evaluate a single scoring rule against a lead record.
 */
function evaluateRule(record, rule) {
    const op = OPERATORS[rule.operator];
    if (!op) return false;
    return op(record[rule.field], rule.value);
}

/**
 * Calculate total score for a lead record based on active scoring rules.
 * @param {object} leadData  - Plain lead data object (parsed from records.data)
 * @param {string} tenantId
 * @returns {Promise<number>} - Total computed score (min 0)
 */
export async function calculateLeadScore(leadData, tenantId) {
    try {
        const rules = await db.all(
            'SELECT * FROM scoring_rules WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at ASC',
            tenantId
        );
        if (rules.length === 0) return Number(leadData.score) || 0;

        let score = 0;
        for (const rule of rules) {
            if (evaluateRule(leadData, rule)) {
                score += Number(rule.points) || 0;
            }
        }
        // Clamp to [0, 100]
        return Math.max(0, Math.min(100, score));
    } catch (err) {
        console.error('[scoring] Failed to calculate score:', err.message);
        return Number(leadData.score) || 0;
    }
}

/**
 * Recalculate and persist the score for an existing lead record in the DB.
 * @param {string} recordId
 * @param {string} tenantId
 */
export async function rescore(recordId, tenantId) {
    try {
        const row = await db.get('SELECT data FROM records WHERE id = ? AND tenant_id = ?', recordId, tenantId);
        if (!row) return;
        let data = {};
        try { data = JSON.parse(row.data); } catch { return; }
        const score = await calculateLeadScore(data, tenantId);
        data.score = score;
        await db.run('UPDATE records SET data = ? WHERE id = ? AND tenant_id = ?', JSON.stringify(data), recordId, tenantId);
        console.log(`[scoring] Rescored lead ${recordId} → ${score}`);
    } catch (err) {
        console.error('[scoring] rescore error:', err.message);
    }
}
