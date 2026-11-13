import crypto from 'crypto';
import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { WHATSAPP_ALLOW_UNSIGNED } from '../config.js';
import { logAudit } from './audit.js';
import { lookupByPhone, normalizePhone } from './cti.js';
import { calculateLeadScore } from './scoring.js';
import { assignLead } from './assignment.js';
import { applyFieldLogic } from './fieldRules.js';
import { applyAutoNumbers } from './fieldTypes.js';
import { getResolvedConfig, checkVerifyToken, resolveTenantByWhatsAppPhoneId } from './integrations.js';

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

/**
 * Meta webhook verification handshake (GET). Returns the challenge to echo, or null to refuse.
 *   hub.mode must be "subscribe"; hub.challenge must be present and a plain token (Meta sends a number); hub.verify_token
 *   must match a saved, enabled WhatsApp set-up. Why a request was refused goes to the server log (never the token itself).
 */
export async function verifyWebhook(query) {
    const refuse = (why) => { console.warn(`[whatsapp] webhook verification refused: ${why}`); return null; };
    const mode = query?.['hub.mode'], token = query?.['hub.verify_token'], challenge = query?.['hub.challenge'];
    if (mode !== 'subscribe') return refuse(`hub.mode is ${typeof mode === 'string' ? '"' + mode.slice(0, 20) + '"' : 'missing'}, expected "subscribe"`);
    if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) return refuse('hub.challenge is missing or not a plain value');
    if (typeof token !== 'string') return refuse('hub.verify_token is missing');
    const checked = await checkVerifyToken(token);
    return checked.ok ? challenge : refuse(checked.reason);
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

// ── Who is this? Names for people who message from a number we do not know ──────────────────────────────────

/** "+91 95577 22795" for an Indian number, "+<digits>" for any other. */
export function formatPhone(p) {
    const d = normalizePhone(p);
    if (!d) return '';
    if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
    return `+${d}`;
}

const PLACEHOLDER_NAMES = new Set(['unknown', 'whatsapp user', 'whatsapp', 'user', 'null', 'undefined', 'n/a', 'na']);

/** A WhatsApp profile name worth showing, or '' (empty, "~", only symbols or emoji, a bare phone number, a placeholder). */
export function cleanProfileName(name) {
    const s = String(name ?? '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (!/[\p{L}]/u.test(s)) return '';                   // no letters at all: "~", "...", "🔥", "12345"
    if (/^\+?[\d\s().-]{7,}$/.test(s)) return '';          // just a phone number
    if (PLACEHOLDER_NAMES.has(s.toLowerCase())) return '';
    return s.slice(0, 80);
}

// Words that end a name when someone writes "my name is Chad n looking for ..."
const NAME_STOP = new Set(('and n looking from here interested want need needs wanted calling living working in at for i im am is the a an to of ' +
    'trying searching enquiring inquiring contacting regarding about with hai hu hoon hun se ka ki ke main mein me hello hi hey please pls').split(' '));
const NAME_PATTERN = /(?:my name is|my name's|this is|mera naam|mera nam|i am called|i'm called|name is|myself|i am|i'm)\s+([\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*){0,3})/iu;

/** A name a person gives in their own words ("my name is Chad"), or ''. */
export function guessNameFromText(body) {
    const m = String(body ?? '').match(NAME_PATTERN);
    if (!m) return '';
    const words = [];
    for (const w of m[1].split(/\s+/)) {
        if (NAME_STOP.has(w.toLowerCase().replace(/[.,]$/, ''))) break;
        if (w.length > 25) break;
        words.push(w.replace(/[.,]$/, ''));
        if (words.length === 3) break;
    }
    if (!words.length) return '';
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Best name for a number: profile name, else a name in the message, else "WhatsApp +91 ...". */
export function resolveContactName({ profileName, body, phone }) {
    const fromProfile = cleanProfileName(profileName);
    if (fromProfile) return { name: fromProfile, source: 'profile' };
    const fromText = guessNameFromText(body);
    if (fromText) return { name: fromText, source: 'message' };
    return { name: `WhatsApp ${formatPhone(phone)}`.trim(), source: 'phone' };
}

/** Lead first / last name. A one-word name gets the number as its last name so two "Chad"s stay apart. */
function splitName(name, phone) {
    const words = String(name).trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1] };
    return { firstName: words[0] || 'WhatsApp', lastName: formatPhone(phone) || '(WhatsApp)' };
}

/**
 * A new lead from a number we have never seen. It is built like any other lead: field rules, score, owner (assignment rules
 * or round-robin) and the "record created" journeys all run.
 */
export async function createLeadFromWhatsApp(tenantId, { phone, profileName, body, name, actorId = 'whatsapp' }) {
    const digits = normalizePhone(phone);
    const who = name ? { name: String(name).trim().slice(0, 80), source: 'manual' } : resolveContactName({ profileName, body, phone: digits });
    const { firstName, lastName } = splitName(who.name, digits);
    const display = `${firstName} ${lastName}`.trim();
    const id = uuidv4();
    const data = {
        firstName, lastName, name: display, phone: formatPhone(digits), status: 'New', source: 'WhatsApp',
        notes: body ? `WhatsApp: ${String(body).slice(0, 500)}` : 'Started a WhatsApp chat',
        _via: 'whatsapp', _name_source: who.source, id,
    };
    try {
        const dr = await db.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', tenantId, 'lead');
        if (dr) {
            const def = JSON.parse(dr.config);
            await applyAutoNumbers(db, tenantId, 'lead', def, data);
            await applyFieldLogic(db, tenantId, 'lead', def, data, null);
        }
    } catch (e) { console.warn('[whatsapp] lead field rules skipped:', e.message); }
    await db.run(
        'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
        id, tenantId, 'lead', display, data.status || 'New', JSON.stringify(data)
    );
    await logAudit({ tenantId, entityType: 'lead', recordId: id, action: 'create', actorId, details: { ...data, _via: 'whatsapp' } });
    try {
        const score = await calculateLeadScore(data, tenantId);
        if (score > 0) {
            data.score = score;
            await db.run('UPDATE records SET data = ? WHERE id = ? AND tenant_id = ?', JSON.stringify(data), id, tenantId);
        }
        await assignLead(tenantId, id, data);
        const { evaluateWorkflows } = await import('./workflow.js');   // loaded here: workflow.js can send WhatsApp messages
        await evaluateWorkflows({ tenantId, entityType: 'lead', triggerType: 'create', record: { ...data, id }, actorId });
    } catch (e) { console.warn('[whatsapp] lead follow-up steps failed:', e.message); }
    return { id, name: display, nameSource: who.source };
}

/** A lead this module made with only a number for a name gets a real one as soon as the person tells us. */
async function upgradeAutoLeadName(tenantId, match, who) {
    if (match.entityType !== 'lead' || who.source === 'phone') return;
    const d = match.data || {};
    const placeholder = d._via === 'whatsapp' && (d._name_source === 'phone' || !cleanProfileName(match.name));
    const junk = !cleanProfileName(match.name) && !String(match.name || '').startsWith('WhatsApp ');
    if (!placeholder && !junk) return;
    const { firstName, lastName } = splitName(who.name, match.data?.phone || '');
    const display = `${firstName} ${lastName}`.trim();
    const row = await db.get('SELECT data FROM records WHERE id = ? AND tenant_id = ?', match.recordId, tenantId);
    let cur = {}; try { cur = JSON.parse(row?.data || '{}'); } catch { cur = {}; }
    cur.firstName = firstName; cur.lastName = lastName; cur.name = display; cur._name_source = who.source;
    await db.run('UPDATE records SET primary_display = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
        display, JSON.stringify(cur), match.recordId, tenantId);
}

async function storeMessage(tenantId, msg) {
    const id = uuidv4();
    await db.run(
        `INSERT INTO wa_messages (id, tenant_id, wa_message_id, direction, phone, profile_name, body, msg_type, matched_entity, matched_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, tenantId, msg.waMessageId || null, msg.direction, msg.phone, cleanProfileName(msg.profileName) || null,
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
        const lead = await createLeadFromWhatsApp(tenantId, { phone, profileName, body, actorId });
        match = { match: 'lead', entityType: 'lead', recordId: lead.id, name: lead.name };
        isNew = true;
    } else if (match.entityType === 'lead') {
        await upgradeAutoLeadName(tenantId, match, resolveContactName({ profileName, body, phone }));
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

/** Conversation list: latest message per phone + counterparty info, with a name worth showing. */
export async function getConversations(tenantId, limit = 50) {
    const rows = await conversationRows(tenantId, limit);
    const ids = [...new Set(rows.map(r => r.matched_id).filter(Boolean))];
    const byId = new Map();
    if (ids.length) {
        const recs = await db.all(
            `SELECT id, entity_type, primary_display, status FROM records WHERE tenant_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
            tenantId, ...ids);
        for (const r of recs) byId.set(r.id, r);
    }
    return rows.map(r => {
        const rec = r.matched_id ? byId.get(r.matched_id) : null;
        const shown = formatPhone(r.phone);
        let display = (rec && cleanProfileName(rec.primary_display)) || cleanProfileName(r.profile_name) || `WhatsApp ${shown}`;
        // The number is already printed under the name, so "Chad +91 95577 22795" is shown as "Chad".
        if (shown && display.endsWith(` ${shown}`) && !display.startsWith('WhatsApp ')) display = display.slice(0, -(shown.length + 1));
        const unreplied = Number(r.unreplied) || 0;
        return {
            ...r,
            matched_entity: rec ? rec.entity_type : undefined,
            matched_id: rec ? rec.id : undefined,
            record_status: rec ? rec.status : undefined,
            display_name: display,
            phone_display: formatPhone(r.phone),
            unreplied,
            needs_reply: r.last_direction === 'inbound',
        };
    });
}

async function conversationRows(tenantId, limit) {
    return db.all(`
        SELECT m.phone,
               MAX(m.created_at) AS last_at,
               (SELECT body FROM wa_messages WHERE tenant_id = m.tenant_id AND phone = m.phone ORDER BY created_at DESC LIMIT 1) AS last_body,
               (SELECT direction FROM wa_messages WHERE tenant_id = m.tenant_id AND phone = m.phone ORDER BY created_at DESC LIMIT 1) AS last_direction,
               COALESCE(MAX(m.profile_name), '') AS profile_name,
               MAX(m.matched_entity) AS matched_entity,
               MAX(m.matched_id) AS matched_id,
               COUNT(*) AS message_count,
               (SELECT COUNT(*) FROM wa_messages i WHERE i.tenant_id = m.tenant_id AND i.phone = m.phone AND i.direction = 'inbound'
                   AND i.created_at > COALESCE((SELECT MAX(o.created_at) FROM wa_messages o WHERE o.tenant_id = m.tenant_id AND o.phone = m.phone AND o.direction = 'outbound'), '1970-01-01')) AS unreplied
        FROM wa_messages m
        WHERE m.tenant_id = ?
        GROUP BY m.tenant_id, m.phone
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

// ── Things you can do from a conversation ───────────────────────────────────────────────────────────────

/** Make a lead for a number that is not one yet (e.g. you messaged first). Messages already in the chat are linked to it. */
export async function createLeadForConversation(tenantId, phone, { name, actorId } = {}) {
    const p = normalizePhone(phone);
    if (!p) throw new Error('Invalid phone number');
    const found = await lookupByPhone(tenantId, p);
    if (found.match) return { existing: true, entityType: found.entityType, recordId: found.recordId, name: found.name };
    const first = await db.get(
        "SELECT body, profile_name FROM wa_messages WHERE tenant_id = ? AND phone = ? AND direction = 'inbound' ORDER BY created_at ASC LIMIT 1", tenantId, p);
    const lead = await createLeadFromWhatsApp(tenantId, { phone: p, profileName: first?.profile_name, body: first?.body, name, actorId: actorId || 'whatsapp' });
    await db.run("UPDATE wa_messages SET matched_entity = 'lead', matched_id = ? WHERE tenant_id = ? AND phone = ?", lead.id, tenantId, p);
    return { existing: false, entityType: 'lead', recordId: lead.id, name: lead.name };
}

async function matchedOrThrow(tenantId, phone) {
    const match = await lookupByPhone(tenantId, phone);
    if (!match.match) throw new Error('This number is not a lead or customer yet. Create a lead first.');
    return match;
}

/** A note on the lead/customer's timeline, written from the chat. */
export async function addConversationNote(tenantId, phone, text, actorId) {
    const note = String(text || '').trim();
    if (!note) throw new Error('Write the note first');
    const match = await matchedOrThrow(tenantId, phone);
    await logAudit({ tenantId, entityType: match.entityType, recordId: match.recordId, action: 'note', actorId, details: { note: note.slice(0, 2000), _via: 'whatsapp' } });
    return { entityType: match.entityType, recordId: match.recordId };
}

/** A follow-up task linked to the lead/customer, owned by the person who made it. */
export async function addConversationTask(tenantId, phone, { subject, priority, dueInDays, notes } = {}, actorId) {
    const match = await matchedOrThrow(tenantId, phone);
    const last = await db.get(
        "SELECT body FROM wa_messages WHERE tenant_id = ? AND phone = ? AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1", tenantId, normalizePhone(phone));
    const due = new Date();
    due.setDate(due.getDate() + (Number.isFinite(Number(dueInDays)) ? Math.max(0, Math.min(365, Number(dueInDays))) : 1));
    const fields = {
        subject: String(subject || '').trim().slice(0, 200) || `Follow up on WhatsApp chat with ${String(match.name).replace(` ${formatPhone(phone)}`, '')}`,
        description: String(notes || '').trim().slice(0, 1000) || (last?.body ? `Last message: ${last.body.slice(0, 300)}` : ''),
        status: 'Not Started',
        priority: ['Low', 'Medium', 'High'].includes(priority) ? priority : 'Medium',
        category: 'Follow-up',
        dueDate: due.toISOString().slice(0, 10),
        _via: 'whatsapp', _source_entity: match.entityType, _source_record_id: match.recordId,
    };
    if (match.entityType === 'customer') fields.customerId = match.recordId;
    else { fields.relatedId = match.recordId; fields.relatedEntity = match.entityType; }
    const id = uuidv4();
    fields.id = id;
    try {
        const dr = await db.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', tenantId, 'task');
        if (dr) {
            const def = JSON.parse(dr.config);
            await applyAutoNumbers(db, tenantId, 'task', def, fields);
            await applyFieldLogic(db, tenantId, 'task', def, fields, null);
        }
    } catch (e) { console.warn('[whatsapp] task field rules skipped:', e.message); }
    const owner = actorId && !['whatsapp', 'system', 'journey'].includes(actorId) ? actorId : null;
    await db.run(
        'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        id, tenantId, 'task', fields.subject, fields.status, JSON.stringify(fields), owner, owner
    );
    await logAudit({ tenantId, entityType: 'task', recordId: id, action: 'create', actorId, details: { ...fields } });
    try {
        const { evaluateWorkflows } = await import('./workflow.js');
        await evaluateWorkflows({ tenantId, entityType: 'task', triggerType: 'create', record: { ...fields, id }, actorId });
    } catch (e) { console.warn('[whatsapp] task journeys failed:', e.message); }
    return { id, subject: fields.subject, dueDate: fields.dueDate, entityType: match.entityType, recordId: match.recordId };
}
