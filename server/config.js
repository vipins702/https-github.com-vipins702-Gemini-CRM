import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

export const PORT = process.env.PORT || 3015;
// Signs login tokens. There is no default: a guessable value would let anyone forge a login.
if (!process.env.JWT_SECRET) {
    throw new Error(
        'JWT_SECRET is not set. Add a long random value to server/.env, e.g. the output of: ' +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
}
export const JWT_SECRET = process.env.JWT_SECRET;
if (JWT_SECRET.length < 32) console.warn('[security] JWT_SECRET is shorter than 32 characters. Use a long random value (see the command above).');
// Encrypts saved integration secrets (tokens, app secrets, SMTP passwords). Defaults to a key
// derived from JWT_SECRET — set SECRETS_KEY too if you may ever change JWT_SECRET, or saved
// secrets become unreadable and must be re-entered.
export const SECRETS_KEY = process.env.SECRETS_KEY || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

// WhatsApp Business Cloud API (Meta). Leave empty to run in simulated mode —
// outbound messages are stored locally and marked 'simulated' instead of hitting Graph API.
export const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
export const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
// No built-in default: a token written in the source is public. Set WHATSAPP_VERIFY_TOKEN, or (better) save a verify
// token per workspace in Integrations.
export const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
// Meta App Secret — inbound webhooks are rejected unless their X-Hub-Signature-256
// verifies against it (tenant config overrides this). WHATSAPP_ALLOW_UNSIGNED=true
// accepts unsigned webhooks when no secret is set; local development only.
export const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';
export const WHATSAPP_ALLOW_UNSIGNED = process.env.WHATSAPP_ALLOW_UNSIGNED === 'true';

// Email (SMTP). Leave SMTP_HOST empty to run in simulated mode — outbound email is
// stored + logged to the contact timeline and marked 'simulated' instead of being sent.
export const SMTP_HOST = process.env.SMTP_HOST || '';
export const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
export const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'FlowCRM <noreply@flowcrm.com>';

// Product name used in e-mails, and the public address of the web app (password-reset links point here).
export const BRAND_NAME = process.env.BRAND_NAME || 'FlowCRM';
export const APP_URL = process.env.APP_URL || 'http://localhost:3000';
// Workspace that receives demo requests sent from the public website.
export const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID || 'default';
