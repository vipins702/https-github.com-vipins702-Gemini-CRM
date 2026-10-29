// Sets a new random password for an admin user and saves it to server/admin-password.txt
// (a git-ignored file on this computer). The password is never printed to the screen.
//
//     npm run admin:reset-password                       # admin@flowcrm.com in the database from server/.env
//     npm run admin:reset-password -- --email you@x.com  # a different user
//     npm run admin:reset-password -- --dry-run          # only check the user exists; change nothing
//
// It uses whichever database server/.env points at (DB_TYPE / DATABASE_URL), so it works for
// the local SQLite file and for the live Neon database.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

await import('./config.js'); // loads server/.env (and requires JWT_SECRET)
const { default: db } = await import('./database.js');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const emailArg = args.indexOf('--email');
const email = (emailArg >= 0 ? args[emailArg + 1] : 'admin@flowcrm.com') || '';

const where = process.env.DB_TYPE === 'postgres'
    ? `Postgres (${new URL(process.env.DATABASE_URL).hostname})`
    : 'local SQLite file (server/crm_v5.db)';

try {
    const users = await db.all('SELECT id, tenant_id, email, role, is_active FROM users WHERE LOWER(email) = ?', email.toLowerCase());
    if (users.length === 0) {
        console.error(`No user with email "${email}" in ${where}.`);
        process.exit(1);
    }
    if (users.length > 1) {
        console.error(`More than one user matches "${email}" in ${where}; refusing to guess which to change.`);
        process.exit(1);
    }
    const user = users[0];
    console.log(`Found ${user.email} (${user.role}, ${user.is_active ? 'active' : 'DISABLED'}) in ${where}.`);

    if (flag('dry-run')) {
        console.log('Dry run: nothing was changed.');
        process.exit(0);
    }

    // 12 random characters plus one of each character type the password rules usually want.
    const password = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'x') + 'Aa1!';
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'admin-password.txt');
    fs.writeFileSync(file, `Email:    ${user.email}\nPassword: ${password}\n`, { mode: 0o600 });

    const result = await db.run('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?', bcrypt.hashSync(password, 10), user.id);
    if (!result.changes) throw new Error('The database reported no rows changed.');

    console.log(`\nPassword changed in ${where}.`);
    console.log(`The new password is saved in: ${file}`);
    console.log('Open that file to read it, log in, then delete the file.');
    process.exit(0);
} catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
}
