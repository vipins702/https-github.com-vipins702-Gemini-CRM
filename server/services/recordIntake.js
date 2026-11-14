// One way in for records that arrive without a person at the keyboard: web forms, the website demo request,
// webhooks and inbound WhatsApp / calls. Every channel then behaves like a record saved in the app:
//   duplicate rule of the object (server/services/dedupe.js) -> field triggers and formulas -> auto numbers
//   -> lead score -> insert -> history -> owner (assignment rules / round-robin) -> "created" journeys.

import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';
import { logAudit } from './audit.js';
import { resolveAutomated } from './dedupe.js';
import { calculateLeadScore } from './scoring.js';
import { assignLead } from './assignment.js';
import { applyFieldLogic } from './fieldRules.js';
import { applyAutoNumbers } from './fieldTypes.js';

export function displayName(d) {
    const full = [d?.firstName, d?.lastName].filter(Boolean).join(' ');
    return String(d?.name || full || d?.title || d?.subject || d?.company || d?.email || d?.phone || 'Untitled').slice(0, 200);
}

/**
 * @returns {Promise<{ action: 'created' | 'updated' | 'skipped', id: string, name?: string, existing?: object }>}
 *   updated / skipped: the record already existed (see the object's duplicate setting); id is the existing record.
 */
export async function intakeRecord(tenantId, entityType, data, { channel = 'form', actorId = 'system', dedupe = true, ownerId = null } = {}) {
    const defRow = await db.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', tenantId, entityType);
    let def = null; try { def = defRow ? JSON.parse(defRow.config) : null; } catch { def = null; }

    if (dedupe) {
        const r = await resolveAutomated(tenantId, entityType, data, { channel, actorId, definition: def });
        if (r.action !== 'create') return { action: r.action, id: r.existing.id, name: r.existing.name, existing: r.existing };
    }

    const id = uuidv4();
    const rec = { ...data, id };
    if (!rec.status) rec.status = 'New';
    if (def) {
        try {
            await applyAutoNumbers(db, tenantId, entityType, def, rec);
            await applyFieldLogic(db, tenantId, entityType, def, rec, null);
        } catch (e) { console.warn(`[intake] field rules skipped for ${entityType}: ${e.message}`); }
    }
    if (entityType === 'lead') {
        try { const s = await calculateLeadScore(rec, tenantId); if (s > 0) rec.score = s; } catch { /* a missing score is fine */ }
    }
    const name = displayName(rec);
    await db.run(
        'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        id, tenantId, entityType, name, rec.status, JSON.stringify(rec), ownerId, ownerId
    );
    await logAudit({ tenantId, entityType, recordId: id, action: 'create', actorId, details: { ...rec, _via: rec._via || channel } });
    try {
        if (entityType === 'lead' && !ownerId) await assignLead(tenantId, id, rec);
        const { evaluateWorkflows } = await import('./workflow.js');
        await evaluateWorkflows({ tenantId, entityType, triggerType: 'create', record: { ...rec, id }, actorId });
        const { evaluateRealtimeLeadRules } = await import('./leadgen.js');
        await evaluateRealtimeLeadRules({ tenantId, entityType, record: { ...rec, id }, actorId });
    } catch (e) { console.warn(`[intake] follow-up steps failed for ${entityType} ${id}: ${e.message}`); }
    return { action: 'created', id, name };
}
