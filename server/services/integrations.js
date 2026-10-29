import crypto from 'crypto';
import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from './audit.js';
import { encryptSecret, decryptSecret, isEncrypted } from '../utils/secrets.js';
import {
    WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET,
    SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM,
} from '../config.js';

/**
 * Per-tenant integration credentials.
 *
 * Each (tenant, provider) row stores a JSON `config`. Services call
 * getResolvedConfig(tenantId, provider) to get live credentials, which merges
 * the tenant's stored config (when enabled) over the global env defaults — so
 * existing single-tenant .env setups keep working while SaaS tenants can each
 * connect their own WhatsApp/FB/IG/email account.
 *
 * Secrets are never returned to the client in clear text; listForClient() masks
 * them, and saveIntegration() preserves an existing secret when the incoming
 * value is blank or still masked. In the database, secret fields are encrypted
 * (utils/secrets.js); getStoredConfig() decrypts them for server-side use.
 */

export const PROVIDERS = ['whatsapp', 'facebook', 'instagram', 'email'];

// Which fields per provider are secrets (masked to the client, preserved on blank save).
const SECRET_FIELDS = {
    whatsapp:  ['token', 'appSecret'],
    facebook:  ['appSecret', 'pageAccessToken'],
    instagram: ['appSecret', 'accessToken'],
    email:     ['smtpPass'],
};

const MASK = (v) => (v && String(v).length > 0 ? '••••••' + String(v).slice(-4) : '');
const isMasked = (v) => typeof v === 'string' && v.includes('••••');

async function getRow(tenantId, provider) {
    return db.get('SELECT * FROM integrations WHERE tenant_id = ? AND provider = ?', tenantId, provider);
}

function parseConfig(row) {
    if (!row) return {};
    try { return JSON.parse(row.config || '{}'); } catch { return {}; }
}

/** Copy of config with this provider's secret fields passed through fn. */
function mapSecrets(provider, config, fn) {
    const out = { ...config };
    for (const f of SECRET_FIELDS[provider] || []) {
        if (out[f]) out[f] = fn(out[f], f);
    }
    return out;
}

function decryptSecrets(tenantId, provider, config) {
    return mapSecrets(provider, config, (v, f) => {
        try { return decryptSecret(v); }
        catch {
            // Encrypted under a different key (JWT_SECRET/SECRETS_KEY changed): treat as unset.
            console.error(`[integrations] cannot decrypt ${provider}.${f} for tenant ${tenantId} — re-enter it in Integrations`);
            return '';
        }
    });
}

/** Stored config for a provider with secrets decrypted (clear text — server-side use only). */
export async function getStoredConfig(tenantId, provider) {
    const row = await getRow(tenantId, provider);
    return { enabled: !!(row && row.enabled), config: decryptSecrets(tenantId, provider, parseConfig(row)) };
}

/** Encrypt any secrets still stored as plain text (from before encryption existed). Run at startup. */
export async function encryptStoredSecrets() {
    const rows = await db.all('SELECT id, provider, config FROM integrations');
    let updated = 0;
    for (const row of rows) {
        const config = parseConfig(row);
        const plain = (SECRET_FIELDS[row.provider] || []).some(f => config[f] && !isEncrypted(config[f]));
        if (!plain) continue;
        await db.run('UPDATE integrations SET config = ? WHERE id = ?',
            JSON.stringify(mapSecrets(row.provider, config, encryptSecret)), row.id);
        updated++;
    }
    if (updated) console.log(`[integrations] Encrypted plain-text secrets in ${updated} integration(s)`);
}

/**
 * Live credentials for a provider: tenant config (when enabled) over env fallback.
 * Returns a flat object of clear-text values for server-side use only.
 */
export async function getResolvedConfig(tenantId, provider) {
    const { enabled, config } = await getStoredConfig(tenantId, provider);
    const c = enabled ? config : {};
    if (provider === 'whatsapp') {
        return {
            token:         c.token         || WHATSAPP_TOKEN,
            phoneNumberId: c.phoneNumberId || WHATSAPP_PHONE_NUMBER_ID,
            verifyToken:   c.verifyToken   || WHATSAPP_VERIFY_TOKEN,
            appSecret:     c.appSecret     || WHATSAPP_APP_SECRET,
        };
    }
    if (provider === 'email') {
        return {
            smtpHost:  c.smtpHost  || SMTP_HOST,
            smtpPort:  c.smtpPort  || SMTP_PORT,
            smtpSecure: c.smtpSecure != null ? c.smtpSecure : SMTP_SECURE,
            smtpUser:  c.smtpUser  || SMTP_USER,
            smtpPass:  c.smtpPass  || SMTP_PASS,
            from:      c.from      || EMAIL_FROM,
        };
    }
    // facebook / instagram: tenant config only (no env fallback yet)
    return c;
}

/** Resolve which tenant owns a given WhatsApp phone_number_id (inbound webhook routing). */
export async function resolveTenantByWhatsAppPhoneId(phoneNumberId) {
    if (!phoneNumberId) return null;
    // Match a tenant whose enabled whatsapp config carries this phone number id.
    const rows = await db.all(
        "SELECT tenant_id, config FROM integrations WHERE provider = 'whatsapp' AND enabled = 1"
    );
    for (const r of rows) {
        try {
            if (JSON.parse(r.config || '{}').phoneNumberId === phoneNumberId) return r.tenant_id;
        } catch { /* ignore */ }
    }
    // Fall back to env-configured default number.
    if (WHATSAPP_PHONE_NUMBER_ID && phoneNumberId === WHATSAPP_PHONE_NUMBER_ID) return 'default';
    return null;
}

const newIngestKey = () => 'ik_' + crypto.randomBytes(24).toString('hex');

/** The tenant's ingest key for public inbound endpoints, created on first use. */
export async function getIngestKey(tenantId) {
    await db.run(
        'INSERT INTO ingest_keys (tenant_id, ingest_key) VALUES (?, ?) ON CONFLICT(tenant_id) DO NOTHING',
        tenantId, newIngestKey()
    );
    const row = await db.get('SELECT ingest_key FROM ingest_keys WHERE tenant_id = ?', tenantId);
    return row.ingest_key;
}

/** Replace the tenant's ingest key; URLs carrying the old key stop working immediately. */
export async function rotateIngestKey(tenantId, actorId = 'system') {
    await getIngestKey(tenantId);
    const key = newIngestKey();
    await db.run(
        'UPDATE ingest_keys SET ingest_key = ?, created_at = CURRENT_TIMESTAMP WHERE tenant_id = ?',
        key, tenantId
    );
    await logAudit({ tenantId, entityType: 'integration', recordId: 'ingest_key', action: 'rotate', actorId, details: {} });
    return key;
}

/** Tenant that owns an ingest key, or null. */
export async function resolveTenantByIngestKey(key) {
    if (!key) return null;
    const row = await db.get('SELECT tenant_id FROM ingest_keys WHERE ingest_key = ?', String(key));
    return row ? row.tenant_id : null;
}

/** True if the given verify token matches the env default or any enabled tenant config. */
export async function isValidVerifyToken(token) {
    if (token && token === WHATSAPP_VERIFY_TOKEN) return true;
    const rows = await db.all(
        "SELECT config FROM integrations WHERE provider = 'whatsapp' AND enabled = 1"
    );
    return rows.some(r => {
        try { return JSON.parse(r.config || '{}').verifyToken === token; } catch { return false; }
    });
}

/** Client-safe view of one provider: secrets masked + whether each secret is set. */
export async function getForClient(tenantId, provider) {
    const { enabled, config } = await getStoredConfig(tenantId, provider);
    const secrets = SECRET_FIELDS[provider] || [];
    const masked = { ...config };
    const secretSet = {};
    for (const f of secrets) {
        secretSet[f] = !!config[f];
        if (config[f]) masked[f] = MASK(config[f]);
    }
    return { provider, enabled, config: masked, secretSet };
}

/** Client-safe list of all providers for a tenant. */
export async function listForClient(tenantId) {
    return Promise.all(PROVIDERS.map(p => getForClient(tenantId, p)));
}

/**
 * Upsert a provider config. Secret fields that arrive blank or still-masked are
 * preserved from the existing stored value (so the UI never has to re-enter them).
 */
export async function saveIntegration(tenantId, provider, { config = {}, enabled }, actorId = 'system') {
    if (!PROVIDERS.includes(provider)) throw new Error(`Unknown provider: ${provider}`);
    const existing = await getStoredConfig(tenantId, provider);
    const secrets = SECRET_FIELDS[provider] || [];

    const merged = { ...existing.config, ...config };
    for (const f of secrets) {
        const incoming = config[f];
        if (incoming === undefined || incoming === '' || isMasked(incoming)) {
            merged[f] = existing.config[f] || '';   // keep what we had
        }
    }

    const nextEnabled = enabled === undefined ? (existing.enabled ? 1 : 0) : (enabled ? 1 : 0);
    const stored = JSON.stringify(mapSecrets(provider, merged, encryptSecret));
    const row = await getRow(tenantId, provider);
    if (row) {
        await db.run(
            'UPDATE integrations SET config = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            stored, nextEnabled, row.id
        );
    } else {
        await db.run(
            'INSERT INTO integrations (id, tenant_id, provider, config, enabled) VALUES (?, ?, ?, ?, ?)',
            uuidv4(), tenantId, provider, stored, nextEnabled
        );
    }
    await logAudit({
        tenantId, entityType: 'integration', recordId: provider, action: 'update',
        actorId, details: { provider, enabled: !!nextEnabled, fields: Object.keys(config) },
    });
    return getForClient(tenantId, provider);
}
