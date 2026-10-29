import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'crm_v5.db');

export class SQLiteAdapter {
    constructor() {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.jsonType = 'TEXT';
        this.like = 'LIKE';
        console.log('SQLite Adapter initialized connected to:', dbPath);
    }

    async get(sql, ...params) {
        return this.db.prepare(sql).get(...params);
    }

    async all(sql, ...params) {
        return this.db.prepare(sql).all(...params);
    }

    async run(sql, ...params) {
        return this.db.prepare(sql).run(...params);
    }

    async exec(sql) {
        return this.db.exec(sql);
    }

    /** Column names of a table. */
    async columns(table) {
        return this.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    }

    /**
     * Run fn(tx) in one transaction; tx has get/all/run. better-sqlite3 is synchronous,
     * so nothing else can run between fn's statements unless fn awaits real I/O.
     */
    async transaction(fn) {
        this.db.exec('BEGIN');
        try {
            const result = await fn(this);
            this.db.exec('COMMIT');
            return result;
        } catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }

    /** SQL for a JSON field of a JSON text column. */
    json(column, field) {
        return `json_extract(${column}, '$.${String(field).replace(/'/g, "''")}')`;
    }

    /** SQL for the column with one JSON text field set to the next bound parameter. */
    jsonSet(column, field) {
        return `json_set(${column}, '$.${String(field).replace(/'/g, "''")}', ?)`;
    }

    /** SQL for a JSON field as a number. */
    jsonNum(column, field) {
        return `CAST(${this.json(column, field)} AS REAL)`;
    }
}
