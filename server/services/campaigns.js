import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail } from './email.js';
import { sendMessage as sendWhatsApp } from './whatsapp.js';

/**
 * Campaigns — bulk outreach to a segment via Email or WhatsApp.
 * Segment = records of an entity filtered by simple field conditions.
 * Tracking: sent/failed reliably; email opens via a 1x1 tracking pixel.
 * ("Replied" needs inbound capture — not implemented.)
 */

const interpolate = (tpl, data) =>
    String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (data && data[k] != null ? String(data[k]) : ''));

const OPS = {
    eq: (a, b) => String(a ?? '') === String(b),
    neq: (a, b) => String(a ?? '') !== String(b),
    contains: (a, b) => String(a ?? '').toLowerCase().includes(String(b).toLowerCase()),
    gt: (a, b) => Number(a) > Number(b),
    lt: (a, b) => Number(a) < Number(b),
};

function matchesFilters(data, filters = []) {
    return (filters || []).every(f => {
        if (!f.field || f.value === '' || f.value == null) return true;
        const fn = OPS[f.op || 'eq'] || OPS.eq;
        return fn(data[f.field], f.value);
    });
}

/** Resolve the audience: parsed records matching the filters that have a contact for the channel. */
async function resolveAudience(tenantId, { entityType, filters, channel }) {
    const rows = await db.all('SELECT id, primary_display, data FROM records WHERE tenant_id = ? AND entity_type = ?', tenantId, entityType);
    const out = [];
    for (const r of rows) {
        let d = {}; try { d = JSON.parse(r.data); } catch { d = {}; }
        if (!matchesFilters(d, filters)) continue;
        const contact = channel === 'whatsapp' ? (d.phone || d.mobile) : d.email;
        if (!contact) continue;
        out.push({ id: r.id, contact, data: { ...d, id: r.id, name: d.name || r.primary_display } });
    }
    return out;
}

function rowToCampaign(r) {
    return {
        id: r.id, name: r.name, channel: r.channel, entityType: r.entity_type,
        filters: (() => { try { return JSON.parse(r.filters || '[]'); } catch { return []; } })(),
        subject: r.subject || '', body: r.body || '',
        formTemplate: (() => { try { return r.form_template ? JSON.parse(r.form_template) : undefined; } catch { return undefined; } })(),
        status: r.status,
        audienceCount: r.audience_count, sentCount: r.sent_count, failedCount: r.failed_count, openedCount: r.opened_count,
        submissionCount: r.submission_count || 0,
        created_at: r.created_at, sent_at: r.sent_at,
    };
}

export async function listCampaigns(tenantId) {
    const rows = await db.all('SELECT * FROM campaigns WHERE tenant_id = ? ORDER BY created_at DESC', tenantId);
    return rows.map(rowToCampaign);
}

export async function getCampaign(tenantId, id) {
    const r = await db.get('SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?', id, tenantId);
    return r ? rowToCampaign(r) : null;
}

export async function saveCampaign(tenantId, payload = {}) {
    const filters = JSON.stringify(payload.filters || []);
    const formTemplate = payload.formTemplate ? JSON.stringify(payload.formTemplate) : null;
    if (payload.id) {
        await db.run(
            `UPDATE campaigns SET name=?, channel=?, entity_type=?, filters=?, subject=?, body=?, form_template=? WHERE id=? AND tenant_id=?`,
            payload.name || 'Untitled', payload.channel || 'email', payload.entityType || 'lead', filters,
            payload.subject || '', payload.body || '', formTemplate, payload.id, tenantId
        );
        return getCampaign(tenantId, payload.id);
    }
    const id = uuidv4();
    await db.run(
        `INSERT INTO campaigns (id, tenant_id, name, channel, entity_type, filters, subject, body, form_template, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`,
        id, tenantId, payload.name || 'Untitled', payload.channel || 'email', payload.entityType || 'lead',
        filters, payload.subject || '', payload.body || '', formTemplate
    );
    return getCampaign(tenantId, id);
}

/** Count + sample the audience without sending. */
export async function previewAudience(tenantId, payload) {
    const aud = await resolveAudience(tenantId, {
        entityType: payload.entityType || 'lead', filters: payload.filters || [], channel: payload.channel || 'email',
    });
    return { count: aud.length, sample: aud.slice(0, 5).map(a => ({ name: a.data.name, contact: a.contact })) };
}

/**
 * Send the campaign to its audience. Email gets a per-recipient open-tracking pixel.
 * @param {string} baseUrl  public base (req protocol+host) for the pixel.
 */
export async function sendCampaign(tenantId, id, baseUrl, actorId = 'system') {
    const c = await getCampaign(tenantId, id);
    if (!c) throw new Error('Campaign not found');

    const aud = await resolveAudience(tenantId, { entityType: c.entityType, filters: c.filters, channel: c.channel });
    await db.run('UPDATE campaigns SET status=?, audience_count=? WHERE id=?', 'Sending', aud.length, id);

    let sent = 0, failed = 0;
    for (const a of aud) {
        const sendId = uuidv4();
        try {
            if (c.channel === 'whatsapp') {
                const r = await sendWhatsApp(tenantId, { to: a.contact, body: interpolate(c.body, a.data) }, actorId);
                if (r.status === 'failed') throw new Error('send failed');
            } else {
                const pixel = baseUrl ? `<img src="${baseUrl}/api/track/open/${sendId}" width="1" height="1" style="display:none" alt="" />` : '';
                const r = await sendEmail({
                    to: a.contact, subject: interpolate(c.subject, a.data),
                    html: `${interpolate(c.body, a.data)}${pixel}`, tenantId, actorId,
                });
                if (!r.success) throw new Error(r.error || 'send failed');
            }
            await db.run(
                'INSERT INTO campaign_sends (id, tenant_id, campaign_id, record_id, contact, status) VALUES (?, ?, ?, ?, ?, ?)',
                sendId, tenantId, id, a.id, a.contact, 'sent'
            );
            sent++;
        } catch {
            await db.run(
                'INSERT INTO campaign_sends (id, tenant_id, campaign_id, record_id, contact, status) VALUES (?, ?, ?, ?, ?, ?)',
                sendId, tenantId, id, a.id, a.contact, 'failed'
            );
            failed++;
        }
    }

    await db.run('UPDATE campaigns SET status=?, sent_count=?, failed_count=?, sent_at=CURRENT_TIMESTAMP WHERE id=?', 'Sent', sent, failed, id);
    return getCampaign(tenantId, id);
}

/** Mark a send as opened (called by the email tracking pixel). */
export async function trackOpen(sendId) {
    const row = await db.get('SELECT campaign_id, opened FROM campaign_sends WHERE id = ?', sendId);
    if (!row) return;
    if (!row.opened) {
        await db.run('UPDATE campaign_sends SET opened = 1 WHERE id = ?', sendId);
        await db.run('UPDATE campaigns SET opened_count = opened_count + 1 WHERE id = ?', row.campaign_id);
    }
}
