import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Assignment Engine
 * Priority: assignment_rules (condition-based) → round-robin from active users.
 */

// ── helpers ─────────────────────────────────────────────────────────────────

const OPERATORS = {
    '==':          (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase(),
    '!=':          (a, b) => String(a ?? '').toLowerCase() !== String(b ?? '').toLowerCase(),
    'contains':    (a, b) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
    'not_contains':(a, b) => !String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
    'is_empty':    (a)    => a === undefined || a === null || String(a).trim() === '',
    'is_not_empty':(a)    => !(a === undefined || a === null || String(a).trim() === ''),
    '>':           (a, b) => Number(a) > Number(b),
    '<':           (a, b) => Number(a) < Number(b),
};

function matchesConditions(record, conditions) {
    if (!conditions || !Array.isArray(conditions.rules) || conditions.rules.length === 0) return true;
    const mode = conditions.match === 'any' ? 'any' : 'all';
    const check = (rule) => {
        const op = OPERATORS[rule.operator];
        return op ? op(record[rule.field], rule.value) : false;
    };
    return mode === 'any' ? conditions.rules.some(check) : conditions.rules.every(check);
}

/** Pick the next user in round-robin order, persisting state to DB. */
async function roundRobinPick(tenantId, users) {
    if (users.length === 0) return null;
    if (users.length === 1) return users[0];

    const state = await db.get('SELECT last_assigned_user_id FROM assignment_state WHERE tenant_id = ?', tenantId);
    const lastId = state?.last_assigned_user_id;

    let nextUser;
    if (!lastId) {
        nextUser = users[0];
    } else {
        const lastIdx = users.findIndex(u => u.id === lastId);
        nextUser = users[(lastIdx + 1) % users.length];
    }

    // Persist state (upsert)
    await db.run(
        `INSERT INTO assignment_state (tenant_id, last_assigned_user_id, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(tenant_id) DO UPDATE SET last_assigned_user_id = excluded.last_assigned_user_id, updated_at = CURRENT_TIMESTAMP`,
        tenantId, nextUser.id
    );

    return nextUser;
}

// ── main export ──────────────────────────────────────────────────────────────

/**
 * Assign a lead to a user via:
 * 1. Active assignment_rules (first matching rule wins)
 * 2. True round-robin fallback across all active users
 */
export async function assignLead(tenantId, leadId, leadData) {
    const users = await db.all(
        'SELECT id, email, first_name FROM users WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at ASC',
        tenantId
    );
    if (users.length === 0) return null;

    let assignedUser = null;

    // 1. Try assignment rules (sorted by priority DESC)
    const rules = await db.all(
        'SELECT * FROM assignment_rules WHERE tenant_id = ? AND is_active = 1 ORDER BY priority DESC',
        tenantId
    );

    for (const rule of rules) {
        let conditions = {};
        try { conditions = JSON.parse(rule.conditions); } catch {}

        if (!matchesConditions(leadData, conditions)) continue;

        if (rule.mode === 'round_robin') {
            // Round-robin within all users
            assignedUser = await roundRobinPick(tenantId, users);
        } else if (rule.assign_to) {
            // Assign to a specific user
            assignedUser = users.find(u => u.id === rule.assign_to) || null;
        }

        if (assignedUser) {
            console.log(`[assignment] Rule "${rule.name}" matched → assigning to ${assignedUser.email}`);
            break;
        }
    }

    // 2. Fallback: global round-robin
    if (!assignedUser) {
        assignedUser = await roundRobinPick(tenantId, users);
        if (assignedUser) console.log(`[assignment] Round-robin fallback → ${assignedUser.email}`);
    }

    if (!assignedUser) return null;

    // 3. Update lead record with owner
    leadData.owner_id = assignedUser.id;
    leadData._assigned_to = assignedUser.id;

    await db.run(
        'UPDATE records SET owner_id = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
        assignedUser.id, JSON.stringify(leadData), leadId, tenantId
    );

    // 4. Create notification for assigned user
    const notifId = uuidv4();
    const leadName = [leadData.firstName, leadData.lastName].filter(Boolean).join(' ') || leadData.name || leadData.company || 'Unknown';
    await db.run(
        `INSERT INTO notifications (id, tenant_id, user_id, title, body, kind, record_id, entity_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        notifId, tenantId, assignedUser.id,
        'New Lead Assigned',
        `You have been assigned a new lead: ${leadName}`,
        'alert', leadId, 'lead'
    );

    console.log(`[assignment] Assigned lead ${leadId} to ${assignedUser.email}`);
    return assignedUser.id;
}
