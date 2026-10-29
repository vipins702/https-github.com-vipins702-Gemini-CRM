import crypto from 'crypto';
import { JWT_SECRET, SECRETS_KEY } from '../config.js';

/**
 * Encryption at rest for stored credentials (AES-256-GCM).
 * Encrypted values look like "enc:v1:<iv>:<tag>:<data>" (base64 parts); anything
 * without that prefix is treated as legacy plain text and passed through.
 */

const PREFIX = 'enc:v1:';
const key = crypto.scryptSync(SECRETS_KEY || JWT_SECRET, 'flowcrm-integration-secrets', 32);

export const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);

export function encryptSecret(plain) {
    if (!plain || isEncrypted(plain)) return plain;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return PREFIX + [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join(':');
}

/** Decrypt a stored value. Throws if it was encrypted under a different key. */
export function decryptSecret(value) {
    if (!isEncrypted(value)) return value;
    const [iv, tag, data] = value.slice(PREFIX.length).split(':').map(s => Buffer.from(s, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
