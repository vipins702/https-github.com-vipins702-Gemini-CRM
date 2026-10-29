// One-time copy of all CRM data from the local SQLite file (crm_v5.db) into the
// Postgres database in DATABASE_URL. Run from the project root:
//
//     npm run db:copy-to-postgres
//
// It creates the tables, refuses to touch a database that already holds records,
// copies every table in one transaction, and checks the row counts match.
// Your SQLite file is only read, never changed.

import crypto from 'crypto';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DB_TYPE = 'postgres';
await import('./config.js'); // loads server/.env
if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL in server/.env to your Postgres connection string first.');
    process.exit(1);
}
const { default: pgdb, initDB } = await import('./database.js');

const sqlitePath = path.join(__dirname, 'crm_v5.db');
const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });

// Create the schema. initDB also seeds a default tenant/admin, which the copy below replaces;
// give that throwaway admin a random password so none is printed.
process.env.ADMIN_PASSWORD ||= crypto.randomBytes(18).toString('hex');
await initDB();

const existing = await pgdb.get('SELECT COUNT(*) AS n FROM records');
if (existing.n > 0) {
    console.error(`Stopped: the Postgres database already has ${existing.n} records. Copy only into an empty database.`);
    process.exit(1);
}

const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
const pgTypes = Object.fromEntries((await pgdb.all(
    "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema()"
)).map(c => [`${c.table_name}.${c.column_name}`, c.data_type]));

const warnings = [];
const NUMERIC = new Set(['integer', 'bigint', 'smallint', 'real', 'double precision', 'numeric']);

/** Make one SQLite value acceptable to the Postgres column type. */
function convert(table, column, value) {
    if (value === null || value === undefined) return null;
    const type = pgTypes[`${table}.${column}`];
    if (NUMERIC.has(type)) {
        if (value === '') return null;
        const n = Number(value);
        if (Number.isFinite(n)) return n;
        warnings.push(`${table}.${column}: non-number "${String(value).slice(0, 40)}" stored as empty`);
        return null;
    }
    if (type === 'jsonb') {
        const text = String(value).replace(/\u0000/g, '');
        try { JSON.parse(text); return text; } catch {
            warnings.push(`${table}.${column}: invalid JSON kept under "_raw"`);
            return JSON.stringify({ _raw: text });
        }
    }
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    return typeof value === 'string' ? value.replace(/\u0000/g, '') : String(value);
}

const targetColumns = {};
for (const table of tables) targetColumns[table] = await pgdb.columns(table);

const summary = [];
await pgdb.transaction(async (tx) => {
    for (const table of tables) {
        const targetCols = targetColumns[table];
        if (targetCols.length === 0) {
            summary.push([table, 'skipped (no such table in the app any more)']);
            continue;
        }
        const sourceCols = sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        const cols = sourceCols.filter(c => targetCols.includes(c));
        const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();

        await tx.run(`DELETE FROM ${table}`); // remove the seed rows initDB just created
        const insert = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
        for (const row of rows) {
            await tx.run(insert, ...cols.map(c => convert(table, c, row[c])));
        }
        const copied = await tx.get(`SELECT COUNT(*) AS n FROM ${table}`);
        if (copied.n !== rows.length) throw new Error(`${table}: copied ${copied.n} of ${rows.length} rows`);
        summary.push([table, `${rows.length} rows`]);
    }
});

console.log('\nCopied from', sqlitePath);
for (const [table, result] of summary) console.log(`  ${table.padEnd(24)} ${result}`);
if (warnings.length) {
    console.log(`\n${warnings.length} value(s) needed fixing:`);
    for (const w of warnings.slice(0, 50)) console.log('  -', w);
}
console.log('\nDone. Set DB_TYPE=postgres in server/.env and restart the CRM.');
process.exit(0);
