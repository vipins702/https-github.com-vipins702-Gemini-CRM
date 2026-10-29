// Worker for services/sqlSandbox.js: builds an in-memory SQLite database from one
// tenant's rows, then runs the user's single read-only SELECT against it.
import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';

const { tables, columns, query, tenantId, maxRows } = workerData;

try {
    const mem = new Database(':memory:');
    for (const [table, cols] of Object.entries(columns)) {
        mem.exec(`CREATE TABLE ${table} (${cols.join(', ')})`);
        const insert = mem.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
        mem.transaction((rows) => { for (const r of rows) insert.run(...cols.map(c => r[c] ?? null)); })(tables[table]);
    }
    mem.pragma('query_only = ON');

    const placeholders = (query.match(/:tenantId/gi) || []).length;
    const stmt = mem.prepare(query.replace(/:tenantId/gi, '?')); // throws on more than one statement
    if (!stmt.reader) throw new Error('Only SELECT queries are allowed');

    const rows = [];
    for (const row of stmt.iterate(...Array(placeholders).fill(tenantId))) {
        if (rows.length >= maxRows) throw new Error(`Query returned more than ${maxRows} rows — add a LIMIT or a filter`);
        rows.push(row);
    }
    parentPort.postMessage({ rows });
} catch (e) {
    parentPort.postMessage({ error: e.message });
}
