import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from './audit.js';
import { generateLeadNormalization } from './ai.js';
import { evaluateWorkflows } from './workflow.js';

/**
 * Lead Ingestion Pipeline.
 * Inbound capture (webhook / web form) -> optional Gemini normalize -> field map -> dedupe -> Leads.
 */

const ALIASES = {
    firstName: ['firstName', 'first_name', 'fname', 'givenName', 'given_name'],
    lastName: ['lastName', 'last_name', 'lname', 'surname', 'familyName'],
    name: ['name', 'fullName', 'full_name', 'fullname'],
    email: ['email', 'emailAddress', 'email_address', 'e-mail', 'mail'],
    phone: ['phone', 'mobile', 'phoneNumber', 'phone_number', 'contact', 'contactNumber', 'tel'],
    company: ['company', 'organization', 'organisation', 'org', 'business', 'companyName'],
    title: ['title', 'jobTitle', 'job_title', 'designation', 'role'],
    website: ['website', 'url', 'site', 'web'],
    location: ['location', 'city', 'address', 'region', 'place'],
};
const CONTROL_KEYS = new Set(['_ai', 'tenant', 'key', 'source']);

function pick(obj, keys) {
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
    }
    return undefined;
}

function mapPayload(payload) {
    const mapped = {};
    for (const [field, aliases] of Object.entries(ALIASES)) {
        const v = pick(payload, aliases);
        if (v !== undefined) mapped[field] = v;
    }
    // Split a full name when first/last are missing
    if (!mapped.firstName && !mapped.lastName && mapped.name) {
        const parts = String(mapped.name).trim().split(/\s+/);
        mapped.firstName = parts.shift();
        if (parts.length) mapped.lastName = parts.join(' ');
    }
    // Carry over any extra (non-aliased, non-control) fields
    const aliasSet = new Set(Object.values(ALIASES).flat());
    for (const [k, v] of Object.entries(payload)) {
        if (!aliasSet.has(k) && !CONTROL_KEYS.has(k) && !(k in mapped)) mapped[k] = v;
    }
    return mapped;
}

/**
 * @returns {Promise<{ success:boolean, id?:string, deduped?:boolean, primaryDisplay?:string, aiUsed?:boolean }>}
 */
export async function ingestLead({ tenantId = 'default', source = 'webhook', payload = {}, useAI = false, dedupe = true, actorId = 'system' }) {
    // 1. Optional AI normalization (best-effort)
    let aiUsed = false;
    let normalized = mapPayload(payload);
    if (useAI) {
        const ai = await generateLeadNormalization(payload);
        if (ai) {
            aiUsed = true;
            normalized = { ...normalized, ...Object.fromEntries(Object.entries(ai).filter(([, v]) => v != null && String(v).trim() !== '')) };
        }
    }

    // 2. Dedupe by email
    if (dedupe && normalized.email) {
        const leadRows = await db.all('SELECT data FROM records WHERE tenant_id = ? AND entity_type = ?', tenantId, 'lead');
        const exists = leadRows.some((row) => {
            try { return String(JSON.parse(row.data).email || '').toLowerCase() === String(normalized.email).toLowerCase(); }
            catch { return false; }
        });
        if (exists) return { success: true, deduped: true };
    }

    // 3. Build + insert lead
    const leadData = {
        ...normalized,
        source: normalized.source || `Capture: ${source}`,
        status: normalized.status || 'New',
        score: normalized.score ?? 10,
        _via: 'ingest',
        _capture_source: source,
        _captured_at: new Date().toISOString(),
    };
    const primaryDisplay =
        leadData.name ||
        [leadData.firstName, leadData.lastName].filter(Boolean).join(' ') ||
        leadData.email || leadData.company || 'Captured Lead';

    const id = uuidv4();
    await db.run(
        'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
        id, tenantId, 'lead', primaryDisplay, leadData.status, JSON.stringify(leadData)
    );
    await logAudit({ tenantId, entityType: 'lead', recordId: id, action: 'create', actorId, details: { ...leadData } });
    console.log(`[ingest] captured lead ${id} from "${source}"${aiUsed ? ' (AI-normalized)' : ''}`);

    // Auto-assignment engine
    const { assignLead } = await import('./assignment.js');
    await assignLead(tenantId, id, leadData);

    // 4. Fire create-trigger journeys for the captured lead
    await evaluateWorkflows({ tenantId, entityType: 'lead', triggerType: 'create', record: { ...leadData, id }, actorId });

    return { success: true, id, deduped: false, primaryDisplay, aiUsed };
}
