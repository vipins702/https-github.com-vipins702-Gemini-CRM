import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from './audit.js';
import { sendEmail } from './email.js';

/**
 * Quotes service — metadata-driven (quotes are records with entity_type='quote',
 * line items + totals live in the JSON `data` column) and API-based.
 *
 * Totals are ALWAYS computed server-side from line items so the client can never
 * post an inconsistent subtotal/total. Multi-currency: the quote carries a currency
 * code; formatting happens in the UI via the existing currency engine.
 */

const STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Compute subtotal / tax / total from line items. */
export function computeTotals(items = [], taxRate = 0) {
    const subtotal = round2((items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0));
    const taxAmount = round2(subtotal * (Number(taxRate) || 0) / 100);
    const total = round2(subtotal + taxAmount);
    return { subtotal, taxAmount, total };
}

function normalizeItems(items) {
    return (Array.isArray(items) ? items : []).map((it) => ({
        description: String(it.description || ''),
        qty: Number(it.qty) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        lineTotal: round2((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)),
        productId: it.productId || '',
        sku: it.sku || '',
    }));
}

/** Next per-tenant sequential quote number, e.g. Q-1001. */
async function nextQuoteNumber(tenantId) {
    const row = await db.get('SELECT COUNT(*) AS n FROM records WHERE tenant_id = ? AND entity_type = ?', tenantId, 'quote');
    return `Q-${1001 + (row?.n || 0)}`;
}

function parseQuote(row) {
    let d = {};
    try { d = JSON.parse(row.data); } catch { d = {}; }
    return {
        id: row.id,
        quoteNumber: d.quoteNumber || '',
        title: d.title || '',
        customerId: d.customerId || '',
        customerName: d.customerName || '',
        customerEmail: d.customerEmail || '',
        status: d.status || row.status || 'Draft',
        currency: d.currency || 'USD',
        items: normalizeItems(d.items),
        taxRate: Number(d.taxRate) || 0,
        subtotal: Number(d.subtotal) || 0,
        taxAmount: Number(d.taxAmount) || 0,
        total: Number(d.total) || 0,
        validUntil: d.validUntil || '',
        notes: d.notes || '',
        convertedDealId: d.convertedDealId || '',
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export async function listQuotes(tenantId) {
    const rows = await db.all(
        'SELECT id, status, data, created_at, updated_at FROM records WHERE tenant_id = ? AND entity_type = ? ORDER BY created_at DESC',
        tenantId, 'quote'
    );
    return rows.map(parseQuote);
}

export async function getQuote(tenantId, id) {
    const row = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', id, tenantId, 'quote');
    return row ? parseQuote(row) : null;
}

/** Create or update a quote. Totals are recomputed server-side. */
export async function saveQuote(tenantId, payload = {}, actorId = 'system') {
    const items = normalizeItems(payload.items);
    const taxRate = Number(payload.taxRate) || 0;
    const totals = computeTotals(items, taxRate);

    if (payload.id) {
        const existing = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', payload.id, tenantId, 'quote');
        if (!existing) throw new Error('Quote not found');
        let prev = {};
        try { prev = JSON.parse(existing.data); } catch { prev = {}; }
        const data = {
            ...prev,
            title: payload.title ?? prev.title ?? '',
            customerId: payload.customerId ?? prev.customerId ?? '',
            customerName: payload.customerName ?? prev.customerName ?? '',
            customerEmail: payload.customerEmail ?? prev.customerEmail ?? '',
            currency: payload.currency ?? prev.currency ?? 'USD',
            items, taxRate, ...totals,
            validUntil: payload.validUntil ?? prev.validUntil ?? '',
            notes: payload.notes ?? prev.notes ?? '',
            status: payload.status ?? prev.status ?? 'Draft',
            quoteNumber: prev.quoteNumber,
        };
        await db.run(
            'UPDATE records SET primary_display = ?, status = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
            data.quoteNumber || data.title || 'Quote', data.status, JSON.stringify(data), payload.id, tenantId
        );
        await logAudit({ tenantId, entityType: 'quote', recordId: payload.id, action: 'update', actorId, details: { total: data.total, status: data.status } });
        return { id: payload.id, ...data };
    }

    // create
    const id = uuidv4();
    const quoteNumber = await nextQuoteNumber(tenantId);
    const data = {
        quoteNumber,
        title: payload.title || '',
        customerId: payload.customerId || '',
        customerName: payload.customerName || '',
        customerEmail: payload.customerEmail || '',
        currency: payload.currency || 'USD',
        items, taxRate, ...totals,
        validUntil: payload.validUntil || '',
        notes: payload.notes || '',
        status: payload.status || 'Draft',
    };
    await db.run(
        'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
        id, tenantId, 'quote', quoteNumber, data.status, JSON.stringify(data)
    );
    await logAudit({ tenantId, entityType: 'quote', recordId: id, action: 'create', actorId, details: { quoteNumber, total: data.total } });
    return { id, ...data };
}

export async function setQuoteStatus(tenantId, id, status, actorId = 'system') {
    if (!STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
    const row = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', id, tenantId, 'quote');
    if (!row) throw new Error('Quote not found');
    let data = {};
    try { data = JSON.parse(row.data); } catch { data = {}; }
    data.status = status;
    await db.run(
        'UPDATE records SET status = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
        status, JSON.stringify(data), id, tenantId
    );
    await logAudit({ tenantId, entityType: 'quote', recordId: id, action: 'status', actorId, details: { status } });
    return { id, ...data };
}

/**
 * Convert an accepted quote into a won deal:
 *  - ensure a Customer exists (use linked one, else create from name/email)
 *  - create a Won "deal" (lead, status Won) carrying the quote total
 *  - link quote -> customer + deal (idempotent via convertedDealId)
 */
export async function convertQuote(tenantId, id, actorId = 'system') {
    const row = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', id, tenantId, 'quote');
    if (!row) throw new Error('Quote not found');
    let d = {};
    try { d = JSON.parse(row.data); } catch { d = {}; }

    if (d.convertedDealId) {
        return { alreadyConverted: true, dealId: d.convertedDealId, customerId: d.customerId };
    }

    // 1) Ensure customer
    let customerId = d.customerId || '';
    let customerName = d.customerName || 'New Customer';
    if (customerId) {
        const existing = await db.get('SELECT id, primary_display FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', customerId, tenantId, 'customer');
        if (existing) customerName = existing.primary_display || customerName;
        else customerId = '';
    }
    if (!customerId) {
        customerId = uuidv4();
        const custData = { name: customerName, email: d.customerEmail || '', status: 'Active', source: 'Quote', _fromQuote: id };
        await db.run(
            'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
            customerId, tenantId, 'customer', customerName, 'Active', JSON.stringify(custData)
        );
        await logAudit({ tenantId, entityType: 'customer', recordId: customerId, action: 'create', actorId, details: { ...custData, _via: 'quote_conversion' } });
    }

    // 2) Create the won deal (a lead in the Won stage carrying the value)
    const dealId = uuidv4();
    const dealName = d.title ? `${d.title} — ${customerName}` : `${customerName} — ${d.quoteNumber}`;
    const dealData = {
        name: dealName, value: Number(d.total) || 0, currency: d.currency || 'USD',
        status: 'Won', source: 'Quote', relatedCustomer: customerId, customerId,
        _fromQuote: id, _quoteNumber: d.quoteNumber, _isDeal: true,
    };
    await db.run(
        'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
        dealId, tenantId, 'lead', dealName, 'Won', JSON.stringify(dealData)
    );
    await logAudit({ tenantId, entityType: 'lead', recordId: dealId, action: 'create', actorId, details: { ...dealData, _via: 'quote_conversion' } });

    // 3) Link the quote back + mark accepted
    d.customerId = customerId;
    d.convertedDealId = dealId;
    d.status = 'Accepted';
    await db.run(
        'UPDATE records SET status = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
        'Accepted', JSON.stringify(d), id, tenantId
    );
    await logAudit({ tenantId, entityType: 'quote', recordId: id, action: 'convert', actorId, details: { customerId, dealId, value: dealData.value } });

    return { customerId, customerName, dealId, dealName, dealValue: dealData.value };
}

/** Email the quote to the customer (uses the email service; simulated unless SMTP set). */
export async function emailQuote(tenantId, id, actorId = 'system') {
    const q = await getQuote(tenantId, id);
    if (!q) throw new Error('Quote not found');
    if (!q.customerEmail) throw new Error('Quote has no customer email');

    const rows = q.items.map(it =>
        `<tr><td>${it.description}</td><td align="right">${it.qty}</td><td align="right">${it.unitPrice}</td><td align="right">${it.lineTotal}</td></tr>`
    ).join('');
    const html = `
        <p>Hi ${q.customerName || 'there'},</p>
        <p>Please find your quote <strong>${q.quoteNumber}</strong> below.</p>
        <table border="1" cellpadding="6" cellspacing="0">
          <tr><th align="left">Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
          ${rows}
        </table>
        <p>Subtotal: ${q.subtotal}<br/>Tax (${q.taxRate}%): ${q.taxAmount}<br/><strong>Total: ${q.total} ${q.currency}</strong></p>
        ${q.validUntil ? `<p>Valid until: ${q.validUntil}</p>` : ''}
        ${q.notes ? `<p>${q.notes}</p>` : ''}`;

    const result = await sendEmail({
        to: q.customerEmail, subject: `Quote ${q.quoteNumber}`, html,
        tenantId, actorId,
    });
    // Mark as Sent if it was a Draft
    if (q.status === 'Draft') await setQuoteStatus(tenantId, id, 'Sent', actorId);
    return { ...result, quoteNumber: q.quoteNumber };
}
