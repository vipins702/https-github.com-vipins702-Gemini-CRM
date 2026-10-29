import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from './audit.js';
import { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM } from '../config.js';

/**
 * Email service — metadata-driven + API-based, same pattern as WhatsApp/CTI.
 *
 * Outbound email is matched to a lead/customer by address, stored in email_messages,
 * and logged to that record's timeline. With no SMTP_HOST configured it runs in
 * SIMULATED mode — stored + marked 'simulated' so the whole flow is demoable
 * (and workflow "send email" actions work) without a mail server.
 *
 * nodemailer is imported lazily so a missing/unconfigured mail setup never crashes boot.
 */

export const isConfigured = () => Boolean(SMTP_HOST);

let _transporter = null;
async function getTransporter() {
    if (!isConfigured()) return null;
    if (_transporter) return _transporter;
    const { default: nodemailer } = await import('nodemailer');
    _transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    return _transporter;
}

function normalizeEmail(s) {
    return String(s || '').trim().toLowerCase();
}

/** Find a lead/customer by email address (customer preferred). */
export async function matchByEmail(tenantId, email) {
    const target = normalizeEmail(email);
    if (!target) return { match: null };

    const search = async (entityType) => {
        const rows = await db.all('SELECT id, primary_display, status, data FROM records WHERE tenant_id = ? AND entity_type = ?', tenantId, entityType);
        for (const row of rows) {
            let data = {};
            try { data = JSON.parse(row.data); } catch (e) { continue; }
            if (normalizeEmail(data.email) === target) {
                const name = (row.primary_display && row.primary_display !== 'Untitled')
                    ? row.primary_display
                    : (data.company || [data.firstName, data.lastName].filter(Boolean).join(' ') || data.name || email);
                return { entityType, recordId: row.id, name };
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

async function storeEmail(tenantId, m) {
    const id = uuidv4();
    await db.run(
        `INSERT INTO email_messages (id, tenant_id, direction, contact_email, from_address, to_address, subject, body, matched_entity, matched_id, status, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, tenantId, m.direction, m.contactEmail, m.fromAddress || null, m.toAddress || null,
        m.subject || '', m.body || '', m.matchedEntity || null, m.matchedId || null, m.status, m.error || null
    );
    return id;
}

/**
 * Send an email. Backward-compatible with workflow callers that pass { to, subject, html }.
 * When tenantId is provided, the message is matched to a contact, stored, and logged
 * to the record timeline.
 *
 * @returns {{ success:boolean, id?:string, status:string, messageId?:string, error?:string }}
 */
export async function sendEmail({ to, subject, html, text, tenantId, actorId = 'system' }) {
    const toAddress = normalizeEmail(to);
    if (!toAddress) return { success: false, status: 'failed', error: 'Missing recipient' };

    let status = 'simulated';
    let messageId = null;
    let error = null;

    if (isConfigured()) {
        try {
            const transporter = await getTransporter();
            const info = await transporter.sendMail({ from: EMAIL_FROM, to: toAddress, subject, text, html });
            status = 'sent';
            messageId = info.messageId;
        } catch (e) {
            status = 'failed';
            error = e.message;
            console.error('[email] send failed:', e.message);
        }
    } else {
        console.log(`[email] (simulated) -> ${toAddress} | ${subject}`);
    }

    // Persist + timeline only when we have tenant context (workflow + API calls do).
    let id = null;
    if (tenantId) {
        const match = await matchByEmail(tenantId, toAddress);
        id = await storeEmail(tenantId, {
            direction: 'outbound', contactEmail: toAddress, fromAddress: EMAIL_FROM, toAddress,
            subject, body: html || text || '', matchedEntity: match.entityType, matchedId: match.recordId, status, error,
        });
        if (match.recordId) {
            await logAudit({
                tenantId, entityType: match.entityType, recordId: match.recordId, action: 'email',
                actorId, details: { direction: 'outbound', subject, status, _via: 'email' },
            });
        }
    }

    return { success: status !== 'failed', id, status, messageId, error };
}

/** Conversation list: latest email per contact address. */
export async function getConversations(tenantId, limit = 50) {
    return db.all(`
        SELECT m.contact_email,
               MAX(m.created_at) AS last_at,
               (SELECT subject FROM email_messages WHERE tenant_id = m.tenant_id AND contact_email = m.contact_email ORDER BY created_at DESC LIMIT 1) AS last_subject,
               MAX(m.matched_entity) AS matched_entity,
               MAX(m.matched_id) AS matched_id,
               COUNT(*) AS message_count
        FROM email_messages m
        WHERE m.tenant_id = ?
        GROUP BY m.tenant_id, m.contact_email
        ORDER BY last_at DESC
        LIMIT ?`, tenantId, limit);
}

/** Full thread for one contact email (oldest first). */
export async function getThread(tenantId, email, limit = 200) {
    return db.all(
        `SELECT * FROM email_messages WHERE tenant_id = ? AND contact_email = ? ORDER BY created_at ASC LIMIT ?`,
        tenantId, normalizeEmail(email), limit
    );
}
