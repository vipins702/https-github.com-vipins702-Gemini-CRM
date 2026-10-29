import pg from 'pg';

const { Pool } = pg;

export class PostgresAdapter {
    constructor() {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable is required for PostgresAdapter');
        }
        
        this.pool = new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false } // Needed for Neon DB / Supabase typically
        });
        
        console.log('Postgres Adapter initialized.');
    }

    // Helper to convert SQLite `?` bindings to Postgres `$1, $2` bindings
    _formatSql(sql) {
        let i = 1;
        return sql.replace(/\?/g, () => `$${i++}`);
    }

    async get(sql, ...params) {
        const pgSql = this._formatSql(sql);
        const { rows } = await this.pool.query(pgSql, params);
        return rows[0] || null;
    }

    async all(sql, ...params) {
        const pgSql = this._formatSql(sql);
        const { rows } = await this.pool.query(pgSql, params);
        return rows;
    }

    async run(sql, ...params) {
        const pgSql = this._formatSql(sql);
        const result = await this.pool.query(pgSql, params);
        return { changes: result.rowCount, lastID: null }; // Postgres doesn't easily expose lastID without RETURNING
    }

    async exec(sql) {
        // exec is usually for schema dumps or multi-statement, no params
        return this.pool.query(sql);
    }

    async transaction(fn) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Execute the provided function, passing the client if it needs to run queries inside this specific transaction
            await fn(client);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    // Helper for reporting
    buildJsonPath(column, field) {
        return `${column}->>'${field}'`;
    }
}
