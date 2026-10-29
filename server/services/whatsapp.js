import crypto from 'crypto';
import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { WHATSAPP_ALLOW_UNSIGNED } from '../config.js';
import { logAudit } from './audit.js';
import { lookupByPhone, normalizePhone, createLeadFromCall } from './cti.js';
import { getResolvedConfig, isValidVerifyToken, resolveTenantByWhatsAppPhoneId } from './integrations.js';

/**
 * WhatsApp Business Cloud API (Meta) integration.
 *
 * Inbound:  Meta posts message webhooks to POST /api/webhooks/whatsapp.
 *           We match the sender's phone against leads/customers (reusing the CTI
 *           lookup), auto-create a lead for unknown numbers, and store the message.
 * Outbound: sendMessage() calls the Graph API using the tenant's own credentials
 *           (falling back to global env config). With no token configured it runs
 *           in SIMULATED mode — the message is stored and marked 'simulated' so the
 *           whole flow is demoable without a Meta account.
 *
 * Credentials are per-tenant (see services/integrations.js): each tenant can connect
 * their own WhatsApp Business number; env config is the single-tenant fallback.
 */

export async function isConfigured(tenantId = 'default') {
    const cfg = await getResolvedConfig(tenantId, 'whatsapp');
    return Boolean(cfg.token && cfg.phoneNumberId);
}

/** Meta webhook verification handshake (GET). Returns the challenge or null. */
export async function verifyWebhook(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (mode === 'subscribe' && await isValidVerifyToken(token)) return challenge;
    return null;
}

/** Resolve the owning tenant for an inbound webhook from its phone_number_id, or null if unknown. */
export async function resolveTenant(phoneNumberId) {
    return resolveTenantByWhatsAppPhoneId(phoneNumberId);
}

/** True if `signature` (the X-Hub-Signature-256 header) is Meta's HMAC of rawBody under appSecret. */
export function isValidSignature(rawBody, signature, appSecret) {
    if (!rawBody || !signature || !appSecret) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(String(signature));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Keep only messages that are genuinely from Meta: each must route to a known tenant
 * and the request signature must verify against that tenant's app secret.
 * Returns [{ tenantId, msg }].
 */
export async function authenticateMessages(messages, rawBody, signature) {
    const accepted = [];
    for (const msg of messages) {
        const tenantId = await resolveTenant(msg.phoneNumberId);
        if (!tenantId) {
            console.warn(`[whatsapp] dropped message for unknown phone_number_id ${msg.phoneNumberId}`);
            continue;
        }
        const { appSecret } = await getResolvedConfig(tenantId, 'whatsapp');
        if (appSecret ? isValidSignature(rawBody, signature, appSecret) : WHATSAPP_ALLOW_UNSIGNED) {
            accepted.push({ tenantId, msg });
        } else if (appSecret) {
            console.warn(`[whatsapp] rejected message for tenant ${tenantId}: invalid signature`);
        } else {
            console.warn(`[whatsapp] rejected message for tenant ${tenantId}: no app secret configured (set it in Integrations or WHATSAPP_APP_SECRET)`);
        }
    }
    return accepted;
}

async function storeMessage(tenantId, msg) {
    const id = uuidv4();
    await db.run(
        `INSERT INTO wa_messages (id, tenant_id, wa_message_id, direction, phone, profile_name, body, msg_type, matched_entity, matched_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, tenantId, msg.waMessageId || null, msg.direction, msg.phone, msg.profileName || null,
        msg.body || '', msg.msgType || 'text', msg.matchedEntity || null, msg.matchedId || null, msg.status
    );
    return id;
}

/**
 * Handle one inbound message: dedupe, identify sender, auto-create lead if unknown,
 * store, and log an activity on the matched record's timeline.
 */
export async function handleIncomingMessage(tenantId, { from, profileName, body, msgType = 'text', waMessageId }, actorId = 'whatsapp') {
    const phone = normalizePhone(from);
    if (!phone) return { ok: false, reason: 'no phone' };

    // Dedupe: Meta retries webhooks — same wa_message_id must not double-insert.
    if (waMessageId) {
        const dup = await db.get('SELECT id FROM wa_messages WHERE wa_message_id = ? AND tenant_id = ?', waMessageId, tenantId);
        if (dup) return { ok: true, deduped: true, id: dup.id };
    }

    // Identify the sender (customer preferred, then lead) — same matching as CTI calls.
    let match = await lookupByPhone(tenantId, phone);
    let isNew = false;
    if (!match.match) {
        const lead = await createLeadFromCall(tenantId, phone, actorId, `WhatsApp: ${body || ''}`.slice(0, 300));
        // Re-shape to the lookup result format and rename the source to WhatsApp.
        await db.run(
            `UPDATE records SET data = json_set(data, '$.source', 'WhatsApp'), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
            lead.id, tenantId
        );
        match = { match: 'lead', entityType: 'lead', recordId: lead.id, name: profileName || lead.name };
        // If WhatsApp gave us a profile name, use it as the lead name.
        if (profileName) {
            await db.run(
                `UPDATE records SET primary_display = ?, data = json_set(data, '$.name', ?) WHERE id = ? AND tenant_id = ?`,
                profileName, profileName, lead.id, tenantId
            );
        }
        isNew = true;
    }

    const id = await storeMessage(tenantId, {
        waMessageId, direction: 'inbound', phone, profileName,
        body, msgType, matchedEntity: match.entityType, matchedId: match.recordId, status: 'received',
    });

    if (match.recordId) {
        await logAudit({
            tenantId, entityType: match.entityType, recordId: match.recordId, action: 'whatsapp',
            actorId, details: { direction: 'inbound', preview: (body || '').slice(0, 140), _via: 'whatsapp' },
        });
    }

    return { ok: true, id, phone, matchedEntity: match.entityType, matchedId: match.recordId, matchedName: match.name, isNewLead: isNew };
}

/** Parse a raw Meta webhook body into simple message objects (text only for now). */
export function parseWebhookPayload(payload) {
    const out = [];
    for (const entry of payload?.entry || []) {
        for (const change of entry?.changes || []) {
            const value = change?.value;
            if (!value?.messages) continue;
            const phoneNumberId = value?.metadata?.phone_number_id || null;
            const contacts = value.contacts || [];
            for (const m of value.messages) {
                const contact = contacts.find(c => c.wa_id === m.from) || contacts[0];
                out.push({
                    from: m.from,
                    phoneNumberId,
                    profileName: contact?.profile?.name || '',
                    waMessageId: m.id,
                    msgType: m.type || 'text',
                    body: m.type === 'text' ? (m.text?.body || '') : `[${m.type} message]`,
                });
            }
        }
    }
    return out;
}

/** Send a text message. Real Graph API call when configured; simulated otherwise. */
export async function sendMessage(tenantId, { to, body }, actorId = 'system') {
    const phone = normalizePhone(to);
    if (!phone) throw new Error('Invalid phone number');
    if (!body || !String(body).trim()) throw new Error('Message body is required');

    const match = await lookupByPhone(tenantId, phone);
    let status = 'simulated';
    let waMessageId = null;

    const cfg = await getResolvedConfig(tenantId, 'whatsapp');
    if (cfg.token && cfg.phoneNumberId) {
        const res = await fetch(`https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body } }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error('[whatsapp] send failed:', json?.error?.message || res.status);
            status = 'failed';
        } else {
            status = 'sent';
            waMessageId = json?.messages?.[0]?.id || null;
        }
    }

    const id = await storeMessage(tenantId, {
        waMessageId, direction: 'outbound', phone, body,
        matchedEntity: match.entityType, matchedId: match.recordId, status,
    });

    if (match.recordId) {
        await logAudit({
            tenantId, entityType: match.entityType, recordId: match.recordId, action: 'whatsapp',
            actorId, details: { direction: 'outbound', preview: body.slice(0, 140), status, _via: 'whatsapp' },
        });
    }

    return { id, status, phone, matchedEntity: match.entityType, matchedId: match.recordId };
}

/** Conversation list: latest message per phone + counterparty info. */
export async function getConversations(tenantId, limit = 50) {
    return db.all(`
        SELECT m.phone,
               MAX(m.created_at) AS last_at,
               (SELECT body FROM wa_messages WHERE tenant_id = m.tenant_id AND phone = m.phone ORDER BY created_at DESC LIMIT 1) AS last_body,
               (SELECT direction FROM wa_messages WHERE tenant_id = m.tenant_id AND phone = m.phone ORDER BY created_at DESC LIMIT 1) AS last_direction,
               COALESCE(MAX(m.profile_name), '') AS profile_name,
               MAX(m.matched_entity) AS matched_entity,
               MAX(m.matched_id) AS matched_id,
               COUNT(*) AS message_count
        FROM wa_messages m
        WHERE m.tenant_id = ?
        GROUP BY m.phone
        ORDER BY last_at DESC
        LIMIT ?`, tenantId, limit);
}

/** Full thread for one phone number (oldest first). */
export async function getThread(tenantId, phone, limit = 200) {
    const p = normalizePhone(phone);
    return db.all(
        `SELECT * FROM wa_messages WHERE tenant_id = ? AND phone = ? ORDER BY created_at ASC LIMIT ?`,
        tenantId, p, limit
    );
}
