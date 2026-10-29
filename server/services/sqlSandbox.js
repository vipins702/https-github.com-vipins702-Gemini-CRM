import { Worker } from 'worker_threads';
import db from '../database.js';

/**
 * Runs admin-written SQL (Web Presenter views, lookup imports, live lookup sources)
 * without exposing the real database.
 *
 * Keyword blacklists on raw SQL can always be bypassed, so instead the query runs in a
 * worker thread against a throwaway in-memory SQLite database holding only this tenant's
 * rows of a few tables — never other tenants, password hashes or integration secrets.
 * The worker opens it read-only, accepts a single SELECT, and is killed on timeout.
 * Queries use SQLite syntax whichever database the CRM runs on.
 */

// Tables and columns a custom query can see (all limited to the calling tenant).
export const SANDBOX_TABLES = {
    records: ['id', 'tenant_id', 'entity_type', 'primary_display', 'status', 'data', 'owner_id', 'created_at', 'updated_at'],
    users: ['id', 'tenant_id', 'email', 'first_name', 'last_name', 'name', 'role', 'is_active', 'created_at'],
    lookup_values: ['id', 'tenant_id', 'lookup_id', 'value_id', 'value', 'sort_order', 'is_active'],
};
// Columns computed when loading (the lookup screen's example query selects users.name).
const COMPUTED = {
    'users.name': `TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))`,
};

const TIMEOUT_MS = 5000;
const MAX_ROWS = 1000;
const MAX_QUERY_LENGTH = 10000;

/** Error whose message is safe to show to the user (bad SQL, timeout, too many rows). */
export class SandboxQueryError extends Error {}

async function loadTenantData(tenantId) {
    const tables = {};
    for (const [table, cols] of Object.entries(SANDBOX_TABLES)) {
        const select = cols.map(c => COMPUTED[`${table}.${c}`] ? `${COMPUTED[`${table}.${c}`]} AS ${c}` : c);
        tables[table] = await db.all(`SELECT ${select.join(', ')} FROM ${table} WHERE tenant_id = ?`, tenantId);
    }
    return tables;
}

/**
 * Run one SELECT for a tenant. `:tenantId` in the query is bound to the tenant's id.
 * Resolves to an array of row objects (at most MAX_ROWS).
 */
export async function runTenantQuery(tenantId, query) {
    if (typeof query !== 'string' || !query.trim()) throw new SandboxQueryError('Query is required');
    if (query.length > MAX_QUERY_LENGTH) throw new SandboxQueryError('Query is too long');

    const tables = await loadTenantData(tenantId);
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./sqlSandboxWorker.js', import.meta.url), {
            workerData: { tables, columns: SANDBOX_TABLES, query, tenantId, maxRows: MAX_ROWS },
            resourceLimits: { maxOldGenerationSizeMb: 256 },
        });
        const timer = setTimeout(() => {
            worker.terminate();
            reject(new SandboxQueryError(`Query took longer than ${TIMEOUT_MS / 1000} seconds and was stopped`));
        }, TIMEOUT_MS);
        worker.once('message', (msg) => {
            clearTimeout(timer);
            worker.terminate();
            if (msg.error) reject(new SandboxQueryError(msg.error));
            else resolve(msg.rows);
        });
        worker.once('error', (err) => {
            clearTimeout(timer);
            reject(new SandboxQueryError(err.message || 'Query failed'));
        });
    });
}
