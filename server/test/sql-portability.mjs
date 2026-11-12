// Guards against SQL that works on SQLite (the default and what the other suites run on) but misbehaves on Postgres
// (production on Render). A static check: it needs no server.
//   node server/test/sql-portability.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'test' || e.name === 'uploads') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
} };
walk(root);

const fails = []; let pass = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else { fails.push(name); console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };

// 1. A column alias with capital letters must be quoted: Postgres turns `as roleId` into `roleid`, so the app got undefined.
const aliasRe = /\bas\s+([a-z]+[A-Z][A-Za-z0-9]*)\b/g;
const bad = [];
for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
        // only SQL text: skip import lines, comments and arrow-function / destructuring renames
        if (/^\s*(import|\/\/|\*)/.test(line) || /\*\s+as\s/.test(line) || /\{[^}]*\bas\b/.test(line)) return;
        if (!/\b(SELECT|FROM|WHERE|JOIN|COALESCE|COUNT|SUM|AVG|ORDER|GROUP)\b/i.test(line) && !/^\s+[A-Za-z_.()|' ,]+\bas\s/i.test(line)) return;
        for (const m of line.matchAll(aliasRe)) bad.push(`${path.relative(root, f)}:${i + 1} as ${m[1]}`);
    });
}
check('no unquoted camelCase column aliases (Postgres lowercases them)', bad.length === 0, bad.join(' | '));

// 2. The users list names its aliases exactly as the app reads them.
const idx = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
check('/api/users aliases are quoted roleId / isActive', /role as "roleId"/.test(idx) && /is_active as "isActive"/.test(idx));

// 3. SQLite-only functions the Postgres adapter cannot run.
const sqliteOnly = [];
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    // SQLite on purpose: the adapter itself, the schema dump, the SQLite-to-Postgres copier and the in-memory SQL sandbox.
    if (['sqlite.js', 'database.js', 'check_schema.js', 'copy-sqlite-to-postgres.js', 'sqlSandboxWorker.js'].includes(path.basename(f))) continue;
    for (const m of src.matchAll(/\b(json_extract|PRAGMA|datetime\(|strftime\(|INSERT OR (REPLACE|IGNORE))/gi)) sqliteOnly.push(`${path.relative(root, f)}: ${m[0]}`);
}
check('no SQLite-only SQL outside the adapter', sqliteOnly.length === 0, sqliteOnly.slice(0, 6).join(' | '));

console.log(`\n=========== ${pass} passed, ${fails.length} failed ===========`);
process.exit(fails.length ? 1 : 0);
