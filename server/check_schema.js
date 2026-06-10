
import db from './database.js';

const columns = db.prepare('PRAGMA table_info(records)').all();
console.log('Records Table Columns:', columns.map(c => c.name));
