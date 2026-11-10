// Self-service password reset by e-mail.
// A one-time token is e-mailed as a link; only its SHA-256 hash is stored, it expires after 30 minutes,
// asking again cancels the previous link, and using it ends every session of that user.
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';
import { logAudit } from './audit.js';
import { sendEmail, isConfigured } from './email.js';
import { APP_URL, BRAND_NAME } from '../config.js';
import { passwordProblem } from '../utils/passwordPolicy.js';

const TTL_MINUTES = 30;
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const refused = (message) => Object.assign(new Error(message), { status: 400, expose: true });
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function resetEmail(name, link) {
    const hello = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
    const text = `${hello.replace(/&[a-z#0-9]+;/g, '')}\n\nSomeone asked to reset the password for your ${BRAND_NAME} account. If it was you, open this link within ${TTL_MINUTES} minutes:\n\n${link}\n\nIf it wasn't you, ignore this e-mail. Your password stays the same.\n`;
    const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1b2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #dce2ea" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 32px 8px;font-size:18px;font-weight:bold">${escapeHtml(BRAND_NAME)}</td></tr>
<tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6">
<p style="margin:0 0 12px">${hello}</p>
<p style="margin:0 0 20px">Someone asked to reset the password for your account. If it was you, choose a new password within ${TTL_MINUTES} minutes:</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f2140;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Choose a new password</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#5b6676">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="margin:16px 0 32px;font-size:13px;color:#5b6676">If it wasn't you, ignore this e-mail. Your password stays the same.</p>
</td></tr></table></td></tr></table></body></html>`;
    return { html, text };
}

/**
 * Creates a reset link and e-mails it when the address belongs to an active account.
 * Returns nothing either way, so callers cannot tell which addresses exist.
 */
export async function requestPasswordReset(email, ip) {
    const user = await db.get('SELECT id, tenant_id, email, first_name, is_active FROM users WHERE email = ?', String(email).trim());
    if (!user || !user.is_active) return;

    const now = new Date().toISOString();
    await db.run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', now, user.id);
    const token = crypto.randomBytes(32).toString('base64url');
    await db.run(
        'INSERT INTO password_resets (id, user_id, tenant_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
        uuidv4(), user.id, user.tenant_id, hashToken(token), new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString()
    );

    const link = `${APP_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
    const { html, text } = resetEmail(user.first_name, link);
    await sendEmail({ to: user.email, subject: `Reset your ${BRAND_NAME} password`, html, text });
    if (!isConfigured()) {
        // Without SMTP nothing is delivered. In development the link is printed so the flow can be tried;
        // in production it is not, because logs are read by more people than the account owner.
        if (process.env.NODE_ENV === 'production') console.warn('[password-reset] SMTP is not configured: the reset e-mail was not sent.');
        else console.log(`[password-reset] SMTP not configured (development). Reset link for ${user.email}: ${link}`);
    }
    await logAudit({ tenantId: user.tenant_id, entityType: 'auth', recordId: user.id, action: 'password_reset_requested', actorId: user.id, details: { ip } });
}

async function findUsableToken(token) {
    if (typeof token !== 'string' || token.length < 20) return null;
    const row = await db.get('SELECT * FROM password_resets WHERE token_hash = ?', hashToken(token));
    if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) return null;
    return row;
}

export const isResetTokenValid = async (token) => !!(await findUsableToken(token));

/** Sets the new password, burns the token and ends every session of that user. */
export async function resetPassword(token, newPassword, ip) {
    const row = await findUsableToken(token);
    if (!row) throw refused('This reset link is invalid or has expired. Ask for a new one.');
    const problem = passwordProblem(newPassword);
    if (problem) throw refused(problem);

    const hash = bcrypt.hashSync(newPassword, 10);
    await db.transaction(async (tx) => {
        const fresh = await tx.get('SELECT used_at FROM password_resets WHERE id = ?', row.id);
        if (!fresh || fresh.used_at) throw refused('This reset link has already been used. Ask for a new one.');
        await tx.run('UPDATE password_resets SET used_at = ? WHERE id = ?', new Date().toISOString(), row.id);
        await tx.run(
            'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = COALESCE(token_version, 0) + 1 WHERE id = ? AND tenant_id = ?',
            hash, row.user_id, row.tenant_id
        );
    });
    await logAudit({ tenantId: row.tenant_id, entityType: 'auth', recordId: row.user_id, action: 'password_reset', actorId: row.user_id, details: { ip } });
}
