// Resets the admin@flowcrm.com password to Admin@1234
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'crm_v5.db');

const db = new Database(dbPath);

const newPassword = 'Admin@1234';
const hash = bcrypt.hashSync(newPassword, 10);

const result = db.prepare(`UPDATE users SET password_hash = ? WHERE email = 'admin@flowcrm.com'`).run(hash);

if (result.changes > 0) {
    console.log('✅ Admin password reset successfully!');
    console.log('   Email:    admin@flowcrm.com');
    console.log('   Password: Admin@1234');
} else {
    console.log('⚠️  No user found with email admin@flowcrm.com');
    // List all users
    const users = db.prepare('SELECT email, role FROM users').all();
    console.log('Users in DB:', users);
}

db.close();
