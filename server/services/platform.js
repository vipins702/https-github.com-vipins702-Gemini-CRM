import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { logAudit } from './audit.js';

/**
 * Platform (superadmin) service — manage tenants across the whole CRM.
 *
 * A new tenant is provisioned by cloning the `default` tenant's *metadata*
 * (entity definitions, layouts, menus, processes, lookups, dashboards,
 * categories) into the new tenant_id, then creating its first admin user.
 * Demo records are NOT copied — a fresh tenant starts empty of data but fully
 * usable. The admin user gets role='admin', which yields full permissions
 * without any roles row.
 */

// Metadata tables that define how a tenant *works* (copied on provisioning).
const CLONE_TABLES = [
    'entity_definitions', 'layouts', 'menus', 'processes',
    'lookup_values', 'lookup_sources', 'dashboard_widgets', 'category_trees',
];

const slugify = (s) =>
    String(s || 'tenant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'tenant';

/** Copy every row of one table from one tenant to another, with fresh ids. */
async function cloneTable(table, fromTenant, toTenant) {
    const cols = (await db.all(`PRAGMA table_info(${table})`)).map(c => c.name);
    if (!cols.includes('tenant_id')) return;
    const rows = await db.all(`SELECT * FROM ${table} WHERE tenant_id = ?`, fromTenant);
    for (const row of rows) {
        const next = { ...row, tenant_id: toTenant };
        if (cols.includes('id')) next.id = uuidv4();
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map(c => next[c]);
        await db.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, ...values);
    }
}

/** All tenants with their user / record counts. */
export async function listTenants() {
    const tenants = await db.all('SELECT id, name, status, created_at FROM tenants ORDER BY created_at ASC');
    const userCounts = await db.all('SELECT tenant_id, COUNT(*) AS c FROM users GROUP BY tenant_id');
    const recCounts = await db.all('SELECT tenant_id, COUNT(*) AS c FROM records GROUP BY tenant_id');
    const um = Object.fromEntries(userCounts.map(r => [r.tenant_id, r.c]));
    const rm = Object.fromEntries(recCounts.map(r => [r.tenant_id, r.c]));
    return tenants.map(t => ({ ...t, userCount: um[t.id] || 0, recordCount: rm[t.id] || 0 }));
}

/** Create a new tenant + its first admin, cloning default-tenant metadata. */
export async function createTenant({ name, adminEmail, adminPassword, adminName }, actorId = 'superadmin') {
    if (!name || !adminEmail || !adminPassword) {
        throw new Error('name, adminEmail and adminPassword are required');
    }
    const dupe = await db.get('SELECT id FROM users WHERE email = ?', adminEmail);
    if (dupe) throw new Error('A user with that email already exists');

    const tenantId = `${slugify(name)}-${uuidv4().slice(0, 6)}`;
    await db.run('INSERT INTO tenants (id, name, status) VALUES (?, ?, ?)', tenantId, name, 'active');

    for (const t of CLONE_TABLES) {
        try { await cloneTable(t, 'default', tenantId); }
        catch (e) { console.warn(`[platform] clone ${t} failed:`, e.message); }
    }

    const [first, ...rest] = String(adminName || 'Admin').trim().split(/\s+/);
    await db.run(
        `INSERT INTO users (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, must_change_password)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, 1, 1)`,
        uuidv4(), tenantId, adminEmail, bcrypt.hashSync(adminPassword, 10), first || 'Admin', rest.join(' ')
    );

    await logAudit({ tenantId, entityType: 'tenant', recordId: tenantId, action: 'create', actorId, details: { name, adminEmail } });
    return { id: tenantId, name, status: 'active', userCount: 1, recordCount: 0, created_at: new Date().toISOString() };
}

/** Rename and/or change status (active|suspended) of a tenant. */
export async function updateTenant(id, { name, status }, actorId = 'superadmin') {
    if (id === 'default' && status === 'suspended') throw new Error('The default tenant cannot be suspended');
    if (status && !['active', 'suspended'].includes(status)) throw new Error('Invalid status');

    const sets = [], vals = [];
    if (name) { sets.push('name = ?'); vals.push(name); }
    if (status) { sets.push('status = ?'); vals.push(status); }
    if (!sets.length) throw new Error('Nothing to update');
    vals.push(id);
    await db.run(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, ...vals);

    await logAudit({ tenantId: id, entityType: 'tenant', recordId: id, action: 'update', actorId, details: { name, status } });
    const t = await db.get('SELECT id, name, status, created_at FROM tenants WHERE id = ?', id);
    const uc = await db.get('SELECT COUNT(*) AS c FROM users WHERE tenant_id = ?', id);
    const rc = await db.get('SELECT COUNT(*) AS c FROM records WHERE tenant_id = ?', id);
    return { ...t, userCount: uc?.c || 0, recordCount: rc?.c || 0 };
}

/** Idempotent: ensure a platform superadmin account exists (dev/demo default). */
export async function ensureSuperadmin() {
    const existing = await db.get('SELECT id FROM users WHERE is_superadmin = 1');
    if (existing) return;
    const dt = await db.get("SELECT id FROM tenants WHERE id = 'default'");
    if (!dt) await db.run("INSERT INTO tenants (id, name, status) VALUES ('default', 'Default', 'active')");
    await db.run(
        `INSERT INTO users (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, must_change_password, is_superadmin)
         VALUES (?, 'default', ?, ?, 'superadmin', 'Platform', 'Owner', 1, 0, 1)`,
        uuidv4(), 'owner@flowcrm.com', bcrypt.hashSync('Owner@123', 10)
    );
    console.log('[platform] Seeded superadmin → owner@flowcrm.com / Owner@123');
}

/** Whether a tenant is suspended (used to block login). */
export async function isTenantSuspended(tenantId) {
    const t = await db.get('SELECT status FROM tenants WHERE id = ?', tenantId);
    return !!t && t.status === 'suspended';
}
