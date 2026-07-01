import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from './audit.js';
import { generateUpsellSuggestion, classifyCallIntent } from './ai.js';
import { normalizePhoneE164 } from '../utils/phone.js';

/**
 * CTI (Computer Telephony Integration) + Lead→Customer conversion service.
 * Provider-agnostic: a telephony provider (Exotel/Knowlarity/Twilio) posts inbound
 * call events to /api/cti/incoming; we look up the caller, log the call, and the
 * agent console screen-pops the matched record.
 */

export function normalizePhone(s) {
    return String(s || '').replace(/\D/g, '');
}

function phoneOf(data) {
    return data.phone || data.mobile || data.contact || data.phoneNumber || data.tel || '';
}

/** Find a lead or customer by phone number (customer preferred). Suffix match handles country codes. */
export async function lookupByPhone(tenantId, phone) {
    const target = normalizePhone(phone);
    if (!target) return { match: null };
    const suffix = target.slice(-10);

    const search = async (entityType) => {
        const rows = await db.all('SELECT id, primary_display, status, data FROM records WHERE tenant_id = ? AND entity_type = ?', tenantId, entityType);
        for (const row of rows) {
            let data = {};
            try { data = JSON.parse(row.data); } catch (e) { continue; }
            const p = normalizePhone(phoneOf(data));
            if (p && (p === target || (suffix.length >= 7 && p.endsWith(suffix)))) {
                const display = (row.primary_display && row.primary_display !== 'Untitled')
                    ? row.primary_display
                    : (data.company || [data.firstName, data.lastName].filter(Boolean).join(' ') || data.name || data.email || phone);
                return { entityType, recordId: row.id, name: display, status: row.status, data: { ...data, id: row.id } };
            }
        }
        return null;
    };

    const customer = await search('customer');
    if (customer) return { match: 'customer', ...customer };
    const lead = await search('lead');
    if (lead) return { match: 'lead', ...lead };
    return { match: null };
}

/** Insert a call_logs row (+ optional activity on the matched record). */
export async function logCall(tenantId, { callSid, direction = 'inbound', from, to, status = 'received', matchedEntity, matchedId, matchedName, outcome, notes, actorId = 'system' }) {
    const id = uuidv4();
    await db.run(
        `INSERT INTO call_logs (id, tenant_id, call_sid, direction, from_number, to_number, status, matched_entity, matched_id, matched_name, outcome, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, tenantId, callSid || null, direction, from || null, to || null, status,
        matchedEntity || null, matchedId || null, matchedName || null, outcome || null, notes || null
    );
    if (matchedId && matchedEntity) {
        await logAudit({
            tenantId, entityType: matchedEntity, recordId: matchedId, action: 'call', actorId,
            details: { direction, from, outcome: outcome || status, notes: notes || '', _via: 'cti' },
        });
    }
    return { id };
}

export async function getRecentCalls(tenantId, limit = 25) {
    return db.all('SELECT * FROM call_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?', tenantId, limit);
}

/**
 * Convert a qualified lead into a customer, link both, mark lead Won,
 * then generate an AI upsell suggestion + create a follow-up task.
 */
export async function convertLeadToCustomer(tenantId, leadId, actorId = 'system') {
    const leadRow = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', leadId, tenantId, 'lead');
    if (!leadRow) throw new Error('Lead not found');

    let lead = {};
    try { lead = JSON.parse(leadRow.data); } catch (e) { lead = {}; }

    if (lead._converted_to_customer) {
        return { alreadyConverted: true, customerId: lead._converted_to_customer };
    }

    const rawPhone = phoneOf(lead);
    const normalized = normalizePhoneE164(rawPhone, 'US'); // Using US as default, adjust as needed

    // Check for existing customer
    let customerId = null;
    let customerName = '';
    
    if (normalized) {
        const existing = await db.get(
            `SELECT id, primary_display FROM records WHERE tenant_id = ? AND entity_type = 'customer' AND normalized_phone = ?`,
            tenantId, normalized
        );
        if (existing) {
            customerId = existing.id;
            customerName = existing.primary_display;
            console.log(`[cti] Matched existing customer ${customerId} via normalized phone ${normalized}`);
        }
    }

    if (!customerId) {
        // Build new customer
        customerId = uuidv4();
        customerName = lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || leadRow.primary_display || 'New Customer';
        const customerData = {
            name: customerName,
            email: lead.email,
            phone: rawPhone,
            industry: lead.industry,
            status: 'Active',
            type: 'Customer',
            contactFirstName: lead.firstName,
            contactLastName: lead.lastName,
            _converted_from_lead: leadId,
            _converted_at: new Date().toISOString(),
        };

        try {
            await db.run('BEGIN TRANSACTION');
            await db.run(
                'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data, normalized_phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
                customerId, tenantId, 'customer', customerName, 'Active', JSON.stringify(customerData), normalized
            );
            await logAudit({ tenantId, entityType: 'customer', recordId: customerId, action: 'create', actorId, details: { ...customerData, _via: 'lead_conversion' } });
            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            // Race condition check: Did someone else just insert this customer?
            if (error.message.includes('UNIQUE constraint failed') && normalized) {
                const raceWinner = await db.get(
                    `SELECT id, primary_display FROM records WHERE tenant_id = ? AND entity_type = 'customer' AND normalized_phone = ?`,
                    tenantId, normalized
                );
                if (raceWinner) {
                    customerId = raceWinner.id;
                    customerName = raceWinner.primary_display;
                    console.log(`[cti] Recovered from race condition, matched winner ${customerId}`);
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
    }

    // Mark the lead converted/won
    const updatedLead = { ...lead, status: 'Won', _converted_to_customer: customerId };
    await db.run(
        'UPDATE records SET status = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
        'Won', JSON.stringify(updatedLead), leadId, tenantId
    );
    await logAudit({ tenantId, entityType: 'lead', recordId: leadId, action: 'update', actorId, details: { status: 'Won', _converted_to_customer: customerId, _via: 'lead_conversion' } });

    // AI upsell suggestion -> follow-up task
    const upsell = await generateUpsellSuggestion({ name: customerName, industry: lead.industry, ltv: lead.value, ownedProducts: [] });
    const taskId = uuidv4();
    const taskData = {
        subject: `Upsell: ${upsell.product}`,
        description: upsell.reason,
        status: 'New',
        priority: 'High',
        customerId,
        _via: 'lead_conversion_upsell',
        _ai_source: upsell.source,
    };
    await db.run(
        'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
        taskId, tenantId, 'task', taskData.subject, 'New', JSON.stringify(taskData)
    );
    await logAudit({ tenantId, entityType: 'task', recordId: taskId, action: 'create', actorId, details: taskData });

    console.log(`[cti] Converted lead ${leadId} -> customer ${customerId}; upsell "${upsell.product}" (${upsell.source})`);
    return { customerId, customerName, leadId, upsell, taskId };
}

// ---- Inbound routing helpers ----

async function insertRecord(tenantId, entityType, data, status, primaryDisplay, actorId) {
    const id = uuidv4();
    await db.run(
        'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
        id, tenantId, entityType, primaryDisplay, status, JSON.stringify({ ...data, id })
    );
    await logAudit({ tenantId, entityType, recordId: id, action: 'create', actorId, details: data });
    return id;
}

export async function createLeadFromCall(tenantId, phone, actorId = 'system', summary = '') {
    const name = `Caller ${phone}`;
    const data = { name, phone, status: 'New', source: 'Inbound Call', score: 5, notes: summary, _via: 'inbound_call' };
    const id = await insertRecord(tenantId, 'lead', data, 'New', name, actorId);
    return { id, name };
}

export async function createCaseForContact(tenantId, { recordId, entityType, name, product, summary }, actorId = 'system') {
    const subject = product ? `Support: ${product}` : `Support request — ${name || 'Caller'}`;
    const data = {
        subject, description: summary || '', status: 'New', priority: 'Medium',
        customerId: recordId, relatedEntity: entityType, product: product || undefined,
        source: 'Inbound Call', _via: 'inbound_call',
    };
    const id = await insertRecord(tenantId, 'case', data, 'New', subject, actorId);
    return { id, subject };
}

export async function createOpportunityForContact(tenantId, { recordId, entityType, name, product, summary }, actorId = 'system') {
    const oppName = product ? `${name || 'Customer'} — ${product}` : `${name || 'Customer'} — New Opportunity`;
    const data = {
        name: oppName, company: name, relatedCustomer: entityType === 'customer' ? recordId : undefined,
        status: 'New', source: 'Inbound Call (Cross-sell)', interestedProduct: product || undefined,
        notes: summary || '', score: 30, _via: 'inbound_call_opportunity',
    };
    const id = await insertRecord(tenantId, 'lead', data, 'New', oppName, actorId);
    return { id, name: oppName };
}

/**
 * Called the instant a call rings: identify + log. Auto-creates a LEAD only for unknown callers
 * (a prospect). Known callers are screen-popped and logged — the support-vs-sales decision happens
 * later via routeInbound() once we know what they want.
 */
export async function handleInboundCall(tenantId, { from, to, callSid, direction = 'inbound', autoCreate = true }, actorId = 'system') {
    const match = await lookupByPhone(tenantId, from);

    if (!match.match && autoCreate) {
        const lead = await createLeadFromCall(tenantId, from, actorId);
        await logCall(tenantId, { callSid, direction, from, to, status: 'received', matchedEntity: 'lead', matchedId: lead.id, matchedName: lead.name, actorId });
        return { match: 'lead', entityType: 'lead', recordId: lead.id, name: lead.name, isNew: true, created: { type: 'lead', id: lead.id, name: lead.name } };
    }

    await logCall(tenantId, { callSid, direction, from, to, status: 'received', matchedEntity: match.match || undefined, matchedId: match.recordId, matchedName: match.name, actorId });
    return { match: match.match, entityType: match.entityType, recordId: match.recordId, name: match.name, data: match.data, isNew: false, created: null };
}

/**
 * Decide & create the right record from what the caller wants.
 * support → Case (existing product problem); sales → Opportunity (new product/service).
 * @param {object} args { recordId, entityType, name, text, manualIntent? }
 */
export async function routeInbound(tenantId, { recordId, entityType, name, text, manualIntent, actorId = 'system' }) {
    const cls = manualIntent
        ? { intent: manualIntent, product: '', reason: 'Chosen by agent', source: 'manual' }
        : await classifyCallIntent(text);

    if (cls.intent === 'support') {
        const c = await createCaseForContact(tenantId, { recordId, entityType, name, product: cls.product, summary: text }, actorId);
        return { created: 'case', id: c.id, title: c.subject, intent: cls };
    }
    // sales
    const o = await createOpportunityForContact(tenantId, { recordId, entityType, name, product: cls.product, summary: text }, actorId);
    return { created: 'opportunity', id: o.id, title: o.name, intent: cls };
}
