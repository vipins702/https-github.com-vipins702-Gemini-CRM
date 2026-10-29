import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'crm_v5.db');

export class SQLiteAdapter {
    constructor() {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
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

    prepare(sql) {
        return this.db.prepare(sql);
    }

    // For transaction support
    transaction(fn) {
        return this.db.transaction(fn);
    }

    // Helper for reporting
    buildJsonPath(column, field) {
        return `json_extract(${column}, '$.${field}')`;
    }
}
