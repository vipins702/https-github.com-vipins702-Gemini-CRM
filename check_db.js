import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'server/crm_v3.db');
const db = new Database(dbPath);

try {
    const menus = db.prepare('SELECT * FROM menus').all();
    console.log('Menu Count:', menus.length);
    if (menus.length > 0) {
        console.log('Sample Menu Config:', menus[0].config.substring(0, 100) + '...');
        console.log('Tenant ID:', menus[0].tenant_id);
    } else {
        console.log('Menus table is empty.');
    }

    const schemas = db.prepare('SELECT * FROM entity_definitions').all();
    console.log('Schema Count:', schemas.length);
} catch (error) {
    console.error('Error querying DB:', error);
}
