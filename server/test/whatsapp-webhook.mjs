// WhatsApp (Meta Cloud API) webhook: the GET verification handshake and the signed POST.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/whatsapp-webhook.mjs
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = process.env.E2E_BASE || 'http://localhost:3015/api';
const tag = Date.now().toString().slice(-6);
const call = async (method, p, token, body) => {
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await res.json(); } catch { /* empty */ }
    return { s: res.status, j };
};
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).j?.token;
const A = await login(process.env.E2E_EMAIL || 'admin@flowcrm.com', process.env.E2E_PASSWORD);
if (!A) { console.log('Cannot log in as admin'); process.exit(2); }
const fails = []; let pass = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else { fails.push(name); console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const sec = (n) => console.log(`\n== ${n}`);

// GET /api/webhooks/whatsapp?... exactly as Meta calls it (no sign-in)
const verify = async (qs) => { const r = await fetch(`${BASE}/webhooks/whatsapp?${qs}`); return { s: r.status, text: await r.text(), type: r.headers.get('content-type') || '', nosniff: r.headers.get('x-content-type-options') }; };
const q = (o) => Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

const TOKEN = `wa-verify-${tag}-a1B2c3`;
const PNID = 'PNID' + tag;
const APP_SECRET = 'app-secret-' + tag + '-xyz';
const CH = '1158201444';

sec('1. Before anything is saved');
let r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'flowcrm-wa-verify', 'hub.challenge': CH }));
check('the old built-in token no longer works (it was public in the source)', r.s === 403, JSON.stringify(r));
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': CH }));
check('a token nobody has saved is refused', r.s === 403);
const cfg0 = (await call('GET', '/integrations/whatsapp/setup-check', A)).j;
check('the set-up check lists what is missing, in order', cfg0?.ready === false && cfg0.checks.map(c => c.key).join() === 'enabled,verifyToken,phoneNumberId,appSecret,token' && cfg0.checks.find(c => c.key === 'enabled').ok === false, JSON.stringify(cfg0?.checks?.map(c => [c.key, c.ok])));

sec('2. Saving rules for the verify token');
check('a short token is refused', (await call('POST', '/integrations/whatsapp', A, { config: { verifyToken: 'short' } })).s === 400);
check('a token with spaces inside is refused', (await call('POST', '/integrations/whatsapp', A, { config: { verifyToken: 'has a space in it' } })).s === 400);
// The reported case: credentials saved but the integration was never switched on.
let sv = await call('POST', '/integrations/whatsapp', A, { config: { verifyToken: ' ' + TOKEN + ' \n', phoneNumberId: ' ' + PNID + ' ', appSecret: APP_SECRET, token: 'EAAGfake' + tag } });
check('saving works, and surrounding spaces / newlines from pasting are trimmed', sv.s === 200 && sv.j?.config?.verifyToken === TOKEN && sv.j?.config?.phoneNumberId === PNID, JSON.stringify(sv.j?.config));
check('saved without turning it on: it stays off', sv.j?.enabled === false);

sec('3. The reported 403: saved but switched off');
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': CH }));
check('a switched-off integration is refused (this is the 403 people hit)', r.s === 403, JSON.stringify(r));
const cfg1 = (await call('GET', '/integrations/whatsapp/setup-check', A)).j;
check('and the set-up check says exactly that', cfg1?.checks?.find(c => c.key === 'enabled')?.ok === false && cfg1.checks.find(c => c.key === 'verifyToken')?.ok === true && /Enabled switch/.test(cfg1.checks.find(c => c.key === 'enabled').fix));
const on = await call('POST', '/integrations/whatsapp', A, { config: {}, enabled: true });
check('switching it on works', on.s === 200 && on.j?.enabled === true);
check('the set-up check now passes', (await call('GET', '/integrations/whatsapp/setup-check', A)).j?.ready === true);

sec('4. Verification (your five cases)');
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': CH }));
check('valid token: 200 and the exact challenge', r.s === 200 && r.text === CH, JSON.stringify(r));
check('the challenge is plain text and cannot be sniffed as a page', /^text\/plain/.test(r.type) && r.nosniff === 'nosniff', JSON.stringify([r.type, r.nosniff]));
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN + 'x', 'hub.challenge': CH }));
check('invalid token: 403', r.s === 403 && r.text === 'Forbidden', JSON.stringify(r));
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.challenge': CH }));
check('missing token: 403', r.s === 403);
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': CH }));
check('empty token: 403', r.s === 403);
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN }));
check('missing challenge: rejected (a valid token alone is not enough)', r.s === 403, JSON.stringify(r));
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': '' }));
check('empty challenge: rejected', r.s === 403);
r = await verify(q({ 'hub.mode': 'unsubscribe', 'hub.verify_token': TOKEN, 'hub.challenge': CH }));
check('invalid mode: rejected', r.s === 403);
r = await verify(q({ 'hub.verify_token': TOKEN, 'hub.challenge': CH }));
check('missing mode: rejected', r.s === 403);
r = await verify('');
check('no parameters at all: 403', r.s === 403);

sec('5. Hardening');
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': '<script>alert(1)</script>' }));
check('a challenge that is not a plain value is never echoed', r.s === 403 && !r.text.includes('<script>'), JSON.stringify(r));
r = await verify(`hub.mode=subscribe&hub.verify_token=${TOKEN}&hub.verify_token=other&hub.challenge=${CH}`);
check('a repeated parameter is refused, not guessed at', r.s === 403);
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': '  ' + TOKEN + '  ', 'hub.challenge': CH }));
check('spaces around the token Meta sends do not matter', r.s === 200 && r.text === CH);
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN.toUpperCase(), 'hub.challenge': CH }));
check('the token is case-sensitive', r.s === 403);
r = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN.slice(0, -1), 'hub.challenge': CH }));
check('a prefix of the token is refused', r.s === 403);
const here = path.dirname(fileURLToPath(import.meta.url));
let envToken = 'unset';
try {
    envToken = execFileSync(process.execPath, ['--input-type=module', '-e', `import { WHATSAPP_VERIFY_TOKEN as t } from ${JSON.stringify(pathToFileURL(path.join(here, '..', 'config.js')).href)}; process.stdout.write(JSON.stringify(t));`],
        { env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48), WHATSAPP_VERIFY_TOKEN: '' }, encoding: 'utf8', timeout: 20000 });
} catch (e) { envToken = 'error: ' + String(e.message).slice(0, 100); }
check('with no environment setting the server has NO verify token (nothing hard-coded)', envToken === '""', envToken);
const dis = await call('POST', '/integrations/whatsapp', A, { config: {}, enabled: false });
check('turning it off again makes the handshake refuse', dis.s === 200 && (await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': CH }))).s === 403);
await call('POST', '/integrations/whatsapp', A, { config: {}, enabled: true });
const RM_EMAIL = `wa.rm.${tag}@flowcrm.test`;
const roleId = (await call('POST', '/roles', A, { name: 'WA RM ' + tag, description: 'x', permissions: { lead: { read: true } } })).j?.id;
await call('POST', '/users', A, { email: RM_EMAIL, password: 'Wa@12345xxx', roleId, name: 'WA RM' });
const RM = await login(RM_EMAIL, 'Wa@12345xxx');
check('only admins can see the set-up check or change the integration', (await call('GET', '/integrations/whatsapp/setup-check', RM)).s === 403 && (await call('POST', '/integrations/whatsapp', RM, { config: { verifyToken: 'whatever-token-123' } })).s === 403 && (await call('GET', '/integrations/whatsapp/setup-check', null)).s === 401);
check('the secrets are never shown back in clear text', !JSON.stringify((await call('GET', '/integrations/whatsapp', A)).j).includes(APP_SECRET));

sec('6. The signed POST is unchanged');
const post = async (bodyObj, sig) => {
    const raw = JSON.stringify(bodyObj);
    const headers = { 'Content-Type': 'application/json' };
    if (sig === 'valid') headers['X-Hub-Signature-256'] = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');
    else if (sig === 'wrong') headers['X-Hub-Signature-256'] = 'sha256=' + crypto.createHmac('sha256', 'not-the-secret').update(raw).digest('hex');
    else if (sig === 'otherbody') headers['X-Hub-Signature-256'] = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw + ' ').digest('hex');
    const res = await fetch(`${BASE}/webhooks/whatsapp`, { method: 'POST', headers, body: raw });
    return res.status;
};
const PHONE = '9198' + String(Math.floor(10000000 + Math.random() * 89999999));
const payload = (text) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: PNID }, contacts: [{ wa_id: PHONE, profile: { name: 'Meera Test ' + tag } }], messages: [{ from: PHONE, id: 'wamid.' + tag + Math.random().toString(36).slice(2), type: 'text', text: { body: text } }] } }] }] });
check('unsigned message: 401', (await post(payload('hello'), 'none')) === 401);
check('message signed with the wrong secret: 401', (await post(payload('hello'), 'wrong')) === 401);
check('signature of a different body: 401', (await post(payload('hello'), 'otherbody')) === 401);
check('message for an unknown phone number id: 401', (await post({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'nobody' }, messages: [{ from: PHONE, id: 'x' + tag, type: 'text', text: { body: 'x' } }] } }] }] }, 'valid')) === 401);
check('a status-only payload is acknowledged so Meta does not retry', (await post({ entry: [{ changes: [{ value: { metadata: { phone_number_id: PNID }, statuses: [{ id: 'abc', status: 'delivered' }] } }] }] }, 'none')) === 200);
check('a correctly signed message: 200', (await post(payload('Hi, I want to know your fees'), 'valid')) === 200);
await new Promise(r => setTimeout(r, 900));
const convs = (await call('GET', '/whatsapp/conversations', A)).j || [];
const conv = convs.find(c => String(c.phone).endsWith(PHONE.slice(-8)));
check('and it reached the inbox, matched to a new lead', !!conv && conv.matched_entity === 'lead', JSON.stringify(conv));

sec('7. Guessing the token is rate limited (keep last)');
let limited = 0, last = 0;
for (let i = 0; i < 80; i++) { const x = await verify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'guess-' + i, 'hub.challenge': CH })); last = x.s; if (x.s === 429) limited++; }
check('many wrong guesses in a minute are answered 429', limited > 0 && last === 429, `limited=${limited}`);

console.log(`\n=========== ${pass} passed, ${fails.length} failed ===========`);
process.exit(fails.length ? 1 : 0);
