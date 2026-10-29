import pg from 'pg';

const { Pool, types } = pg;

// Return values in the same shapes SQLite gives, so callers work unchanged:
// COUNT/SUM come back as numbers (not strings), and JSONB comes back as the JSON
// string that callers JSON.parse() themselves.
types.setTypeParser(20, (v) => parseInt(v, 10));      // int8 (COUNT)
types.setTypeParser(1700, (v) => parseFloat(v));      // numeric (SUM/AVG/ROUND)
types.setTypeParser(114, (v) => v);                   // json
types.setTypeParser(3802, (v) => v);                  // jsonb

// Timestamps are stored as UTC text 'YYYY-MM-DD HH:MM:SS', exactly as SQLite's
// CURRENT_TIMESTAMP writes them, so stored values, sorting and comparisons match.
const NOW_TEXT = `(to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'))`;

/**
 * Rewrite SQLite-flavoured SQL for Postgres, outside quoted literals only:
 * `?` placeholders become $1, $2… and CURRENT_TIMESTAMP becomes UTC text.
 */
function formatSql(sql) {
    let i = 0;
    return sql.split("'").map((part, idx) => (idx % 2 === 1 ? part : part
        .replace(/\?/g, () => `$${++i}`)
        .replace(/\bCURRENT_TIMESTAMP\b/gi, NOW_TEXT)
    )).join("'");
}

/**
 * Adapt the shared CREATE TABLE statements: DATETIME columns become text timestamps,
 * and foreign keys are dropped because SQLite never enforced them (see initDB).
 */
function translateDDL(sql) {
    return formatSql(sql
        .replace(/\bDATETIME\b/gi, 'TEXT')
        .replace(/,\s*FOREIGN KEY\s*\([^)]*\)\s*REFERENCES\s+\w+\s*\([^)]*\)/gi, '')
        .replace(/\s+REFERENCES\s+\w+\s*\([^)]*\)/gi, ''));
}

/** get/all/run over anything with .query() — the pool, or one client inside a transaction. */
class PgQueries {
    constructor(conn) { this.conn = conn; }

    async get(sql, ...params) {
        const { rows } = await this.conn.query(formatSql(sql), params);
        return rows[0] || null;
    }

    async all(sql, ...params) {
        const { rows } = await this.conn.query(formatSql(sql), params);
        return rows;
    }

    async run(sql, ...params) {
        const result = await this.conn.query(formatSql(sql), params);
        return { changes: result.rowCount };
    }
}

export class PostgresAdapter extends PgQueries {
    constructor() {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable is required for PostgresAdapter');
        }
        // Hosted databases (Neon, Supabase…) get TLS with certificate verification;
        // only a database on this machine may connect without TLS.
        const isLocal = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(connectionString);
        super(new Pool({ connectionString, ssl: isLocal ? false : { rejectUnauthorized: true } }));
        this.pool = this.conn;
        this.jsonType = 'JSONB';
        this.like = 'ILIKE'; // SQLite's LIKE is case-insensitive; keep that behaviour
        console.log('Postgres Adapter initialized.');
    }

    async exec(sql) {
        return this.pool.query(translateDDL(sql));
    }

    /** Column names of a table. */
    async columns(table) {
        const rows = await this.all(
            'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?',
            table
        );
        return rows.map(r => r.name);
    }

    /** Run fn(tx) in one transaction; tx has get/all/run. */
    async transaction(fn) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(new PgQueries(client));
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /** SQL for a JSON field of a JSONB column, as text. */
    json(column, field) {
        return `(${column} ->> '${String(field).replace(/'/g, "''")}')`;
    }

    /** SQL for the column with one JSON text field set to the next bound parameter. */
    jsonSet(column, field) {
        const key = String(field).replace(/'/g, "''").replace(/[{}",\\]/g, '');
        return `jsonb_set(${column}, '{${key}}', to_jsonb(?::text))`;
    }

    /** SQL for a JSON field as a number, or NULL when it isn't numeric. */
    jsonNum(column, field) {
        const v = this.json(column, field);
        return `(CASE WHEN trim(${v}) ~ '^-{0,1}[0-9]+([.][0-9]+){0,1}$' THEN trim(${v})::numeric END)`;
    }
}
