// Security and data-quality regression checks: uploads, SSRF, headers, validation, quotes, audit trail,
// passwords and sessions, internal fields, repeated stage moves.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/hardening.mjs
import { isPrivateAddress, assertPublicHttpUrl } from '../utils/safeFetch.js';

const BASE = process.env.E2E_BASE || 'http://localhost:3015/api';
const HOST = BASE.replace(/\/api$/, '');
const tag = Date.now().toString().slice(-6);
const call = async (method, path, token, body, headers = {}) => {
    const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
    return { s: res.status, j, text, h: res.headers };
};
const upload = async (path, token, name, type, bytes) => {
    const fd = new FormData(); fd.append('file', new Blob([bytes], { type }), name);
    const res = await fetch(BASE + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
    return { s: res.status, j: await res.json().catch(() => null) };
};
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).j;

let pass = 0; const fails = [];
const check = (name, ok, detail = '') => { if (ok) pass++; else { fails.push(name); console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const sec = (t) => console.log(`\n== ${t}`);

const admin = await login(process.env.E2E_EMAIL || 'admin@flowcrm.com', process.env.E2E_PASSWORD);
const A = admin?.token;
if (!A) { console.log('Cannot log in as admin'); process.exit(2); }
const mkLead = async (extra = {}) => (await call('POST', '/data/lead', A, { firstName: 'Hard', lastName: 'Ening', email: `hard.${tag}.${Math.random().toString(36).slice(2, 7)}@example.com`, status: 'New', ...extra })).j;

// ───────────────────────────────────────────────────────────────────────────
sec('1. Address checks (unit)');
for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.5.5', '192.168.0.9', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) check(`${ip} is private`, isPrivateAddress(ip) === true);
for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) check(`${ip} is public`, isPrivateAddress(ip) === false);
for (const url of ['http://127.0.0.1/x', 'http://localhost/x', 'http://[::1]/x', 'http://169.254.169.254/latest/meta-data', 'http://2130706433/', 'http://0x7f000001/', 'http://10.0.0.5:8080/', 'ftp://example.com/', 'file:///etc/passwd', 'http://user:pw@example.com/', 'not a url']) {
    let refused = false; try { await assertPublicHttpUrl(url); } catch { refused = true; }
    check(`URL refused: ${url}`, refused);
}

sec('2. Webhook URLs on workflow stages (SSRF)');
for (const url of ['http://127.0.0.1:3015/api', 'http://localhost/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://192.168.1.1/']) {
    const r = await call('POST', '/processes/lead', A, { name: 'Probe', stages: [{ name: 'New' }, { name: 'Probe', entryActions: [{ type: 'webhook', url }] }] });
    check(`saving a stage webhook to ${url} is refused (400)`, r.s === 400, `HTTP ${r.s} ${r.text.slice(0, 80)}`);
}
const okProc = await call('POST', '/processes/lead', A, { name: 'Lead pipeline', stages: [{ name: 'New' }, { name: 'Contacted' }, { name: 'Qualified' }, { name: 'Won', type: 'won' }, { name: 'Lost', type: 'lost' }] });
check('a normal process still saves', okProc.s === 200, `HTTP ${okProc.s}`);

sec('3. Uploads');
const lead = await mkLead();
const html = await upload(`/attachments/lead/${lead.id}`, A, 'evil.html', 'text/html', '<script>alert(1)</script>');
check('uploading .html is refused (400)', html.s === 400, `HTTP ${html.s}`);
const svg = await upload(`/attachments/lead/${lead.id}`, A, 'pic.svg', 'image/svg+xml', '<svg onload="alert(1)"/>');
check('uploading .svg is refused (400)', svg.s === 400, `HTTP ${svg.s}`);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const okPng = await upload(`/attachments/lead/${lead.id}`, A, 'dot.png', 'image/png', png);
check('uploading .png works', okPng.s === 200 && okPng.j?.url, `HTTP ${okPng.s}`);
if (okPng.j?.url) {
    const r = await fetch(HOST + okPng.j.url);
    check('png is served inline with nosniff and a sandboxing CSP', r.status === 200 && !r.headers.get('content-disposition') && r.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(r.headers.get('content-security-policy') || ''), `${r.status} disp=${r.headers.get('content-disposition')} csp=${r.headers.get('content-security-policy')}`);
}
const txt = await upload(`/attachments/lead/${lead.id}`, A, 'notes.txt', 'text/plain', 'hello');
if (txt.j?.url) {
    const r = await fetch(HOST + txt.j.url);
    check('a text file is forced to download', /attachment/.test(r.headers.get('content-disposition') || ''), `disp=${r.headers.get('content-disposition')}`);
}
const ghost = await upload('/attachments/lead/no-such-record', A, 'dot.png', 'image/png', png);
check('attaching to a record that does not exist is refused (404)', ghost.s === 404, `HTTP ${ghost.s}`);
const prof = await upload(`/upload/profile/lead/${lead.id}`, A, 'x.html', 'text/html', '<b>x</b>');
check('profile photo must be an image (400)', prof.s === 400, `HTTP ${prof.s}`);

sec('4. Headers');
const hd = await call('GET', '/data/lead', A);
check('X-Content-Type-Options: nosniff', hd.h.get('x-content-type-options') === 'nosniff');
check('X-Powered-By is not sent', !hd.h.get('x-powered-by'));
check('API responses are not cacheable (no-store)', /no-store/.test(hd.h.get('cache-control') || ''));
check('X-Frame-Options is set', !!hd.h.get('x-frame-options'));
check('unknown route is JSON', (await call('GET', '/nope', A)).j?.error === 'Not found');

sec('5. Quotes');
const cust = (await call('POST', `/leads/${lead.id}/convert`, A)).j;
const quote = (items, extra = {}) => call('POST', '/quotes', A, { customerId: cust.customerId, currency: 'USD', items, ...extra });
const good = await quote([{ name: 'A', qty: 3, unitPrice: 0.1 }, { name: 'B', qty: 1, unitPrice: 0.2 }], { taxRate: 18 });
check('quote totals are right (3 x 0.10 + 1 x 0.20 at 18% = 0.59)', good.s === 200 && good.j?.total === 0.59, `HTTP ${good.s} total ${good.j?.total}`);
check('the blank draft line the UI starts with is accepted', (await quote([{ description: '', qty: 1, unitPrice: 0 }], { status: 'Draft' })).s === 200);
for (const [label, items, extra] of [['negative quantity', [{ qty: -5, unitPrice: 100 }], {}], ['negative price', [{ qty: 1, unitPrice: -100 }], {}], ['text quantity', [{ qty: 'abc', unitPrice: 1 }], {}], ['tax 5000%', [{ qty: 1, unitPrice: 100 }], { taxRate: 5000 }], ['negative tax', [{ qty: 1, unitPrice: 100 }], { taxRate: -5 }], ['items not a list', 'x', {}], ['sent quote with no lines', [], { status: 'Sent' }]]) {
    const r = await quote(items, extra);
    check(`quote with ${label} is refused (400)`, r.s === 400, `HTTP ${r.s}`);
}

sec('6. Record validation');
const bad = async (label, body) => { const r = await call('POST', '/data/lead', A, { firstName: 'V', lastName: 'Alid', email: `v.${tag}.${Math.random().toString(36).slice(2, 6)}@example.com`, status: 'New', ...body }); check(`${label} is refused (400)`, r.s === 400, `HTTP ${r.s}`); };
check('lead without a last name is refused', (await call('POST', '/data/lead', A, { firstName: 'No', email: `n.${tag}@example.com`, status: 'New' })).s === 400);
check('lead with an object as first name is refused', (await call('POST', '/data/lead', A, { firstName: { a: 1 }, lastName: 'X', email: `o.${tag}@example.com`, status: 'New' })).s === 400);
await bad('status outside the options and pipeline', { status: 'Nonsense' });
await bad('source outside the picklist', { source: 'Smoke Signals' });
await bad('score "lots"', { score: 'lots' });
await bad('garbage phone', { phone: 'abc' });
await bad('100,000-character company', { company: 'x'.repeat(100000) });
await bad('invalid website', { website: 'not a url' });
check('a pipeline stage is accepted as status', (await call('POST', '/data/lead', A, { firstName: 'Stage', lastName: 'Ok', email: `s.${tag}@example.com`, status: 'Qualified' })).s === 200);
const ig = (await call('POST', '/ingest/instagram', A, { name: 'Imported Lead', email: `ig.${tag}@example.com`, instagram: '@x' })).j;
const igRec = ((await call('GET', '/data/lead', A)).j || []).find(r => r.id === ig?.id);
const edit = await call('POST', '/data/lead', A, { ...igRec, company: 'Edited Co' });
check('editing an imported lead keeps its legacy source value (200)', edit.s === 200, `HTTP ${edit.s} ${edit.text.slice(0, 100)}`);
const edit2 = await call('POST', '/data/lead', A, { ...igRec, source: 'Smoke Signals' });
check('changing source to an invalid value on that lead is refused', edit2.s === 400, `HTTP ${edit2.s}`);

sec('7. Internal fields and repeated stage moves');
const mine = await mkLead({ _isDeal: true, _converted_to_customer: 'x', _assigned_to: 'y' });
const mineRec = ((await call('GET', '/data/lead', A)).j || []).find(r => r.id === mine.id);
check('client-supplied "_" fields are dropped on create', !mineRec?._isDeal && !mineRec?._converted_to_customer && mineRec?._assigned_to !== 'y', JSON.stringify({ d: mineRec?._isDeal, c: mineRec?._converted_to_customer, a: mineRec?._assigned_to }));
const conv = await call('POST', `/data/lead/${lead.id}/status`, A, { status: 'Contacted' });
const after = ((await call('GET', '/data/lead', A)).j || []).find(r => r.id === lead.id);
const sent = await call('POST', '/data/lead', A, { ...after, company: 'Keeps internal keys', _converted_to_customer: 'forged' });
const back = ((await call('GET', '/data/lead', A)).j || []).find(r => r.id === lead.id);
check('an edit keeps server-set "_" fields and ignores forged ones', sent.s === 200 && back?._converted_to_customer === cust.customerId, `got ${back?._converted_to_customer}`);
check('first move to a stage works', conv.s === 200);
const again = await call('POST', `/data/lead/${lead.id}/status`, A, { status: 'Contacted' });
check('moving to the stage it is already in is a no-op', again.s === 200 && again.j?.unchanged === true, JSON.stringify(again.j));
const hist = (await call('GET', `/records/lead/${lead.id}/related-activity`, A)).j?.stageHistory || [];
check('stage history has one row for that stage, not two', hist.filter(h => h.to === 'Contacted').length === 1, `${hist.filter(h => h.to === 'Contacted').length} rows`);

sec('8. Passwords and sessions');
const email = `pw.${tag}@example.com`, pw0 = 'Start!Pass#1234';
const role = await call('POST', '/roles', A, { name: `PW role ${tag}`, description: '', permissions: { lead: { read: true } } });
for (const weak of ['short1', 'allletterslong', '123456789012']) {
    const r = await call('POST', '/users', A, { email: `w.${weak}.${tag}@example.com`, name: 'Weak', roleId: role.j.id, password: weak });
    check(`weak password "${weak}" is refused (400)`, r.s === 400, `HTTP ${r.s}`);
}
check('a strong password creates the user', (await call('POST', '/users', A, { email, name: 'Pw User', roleId: role.j.id, password: pw0 })).s === 200);
const first = await login(email, pw0);
check('new user must change the password at first sign-in', first?.user?.mustChangePassword === true);
const tok1 = first.token;
check('the token works', (await call('GET', '/data/lead', tok1)).s === 200);
check('wrong current password is refused (403, not 401)', (await call('POST', '/auth/change-password', tok1, { currentPassword: 'Wrong!Pass#1', newPassword: 'Brand!New#5678' })).s === 403);
check('weak new password is refused (400)', (await call('POST', '/auth/change-password', tok1, { currentPassword: pw0, newPassword: 'abc' })).s === 400);
check('same password again is refused (400)', (await call('POST', '/auth/change-password', tok1, { currentPassword: pw0, newPassword: pw0 })).s === 400);
const ch = await call('POST', '/auth/change-password', tok1, { currentPassword: pw0, newPassword: 'Brand!New#5678' });
check('password change succeeds and returns a new token', ch.s === 200 && !!ch.j?.token, `HTTP ${ch.s}`);
check('the old token is ended (401)', (await call('GET', '/data/lead', tok1)).s === 401);
check('the new token works', (await call('GET', '/data/lead', ch.j.token)).s === 200);
check('old password no longer signs in', !(await login(email, pw0))?.token);
const second = await login(email, 'Brand!New#5678');
check('new password signs in and mustChangePassword is cleared', !!second?.token && second.user.mustChangePassword === false);
const out = await call('POST', '/auth/logout', second.token);
check('logout succeeds', out.s === 200);
check('the token is dead after logout (401)', (await call('GET', '/data/lead', second.token)).s === 401);
const third = await login(email, 'Brand!New#5678');
const uid = ((await call('GET', '/users', A)).j || []).find(u => u.email === email)?.id;
await call('POST', '/users', A, { id: uid, email, name: 'Pw User', roleId: role.j.id, password: 'Admin!Reset#4321' });
check('an admin reset ends the user\'s existing sessions (401)', (await call('GET', '/data/lead', third.token)).s === 401);
const afterReset = await login(email, 'Admin!Reset#4321');
check('after an admin reset the user must choose a new password', afterReset?.user?.mustChangePassword === true);

sec('9. Audit trail');
const logsOf = async (q) => { const r = await call('GET', `/audit-logs?${q}`, A); return r.j?.logs || r.j?.rows || (Array.isArray(r.j) ? r.j : []); };
const has = async (q, action) => (await logsOf(q)).some(l => l.action === action);
check('user creation is logged', await has('entityType=user', 'create'));
check('user update / admin reset is logged', await has('entityType=user', 'update'));
check('role creation is logged', await has('entityType=role', 'create'));
check('successful sign-in is logged', await has('entityType=auth', 'login'));
await login(email, 'definitely-wrong-1');
check('failed sign-in is logged', await has('entityType=auth', 'login_failed'));
check('logout is logged', await has('entityType=auth', 'logout'));
check('password change is logged', await has('entityType=auth', 'password_changed'));
const entries = JSON.stringify(await logsOf('entityType=user'));
check('no password appears in the audit trail', !/Brand!New|Admin!Reset|Start!Pass/.test(entries));

sec('10. Menu, settings and audit entries keep their shape');
const menu0 = (await call('GET', '/metadata/menu', A)).j;
check('the menu is always a list', Array.isArray(menu0));
check('saving the menu back unchanged works', (await call('POST', '/metadata/menu', A, menu0)).s === 200);
check('an empty menu is refused (400): it would leave nothing to click', (await call('POST', '/metadata/menu', A, [])).s === 400);
check('a menu that is not a list is refused (400)', (await call('POST', '/metadata/menu', A, { name: 5, email: 'a@b.io' })).s === 400);
check('a menu item without an id is refused (400)', (await call('POST', '/metadata/menu', A, [{ label: 'No id' }])).s === 400);
check('a menu item with a non-text label is refused (400)', (await call('POST', '/metadata/menu', A, [{ id: 'x', label: { a: 1 } }])).s === 400);
check('nested menu groups are checked too', (await call('POST', '/metadata/menu', A, [{ id: 'g', label: 'Group', type: 'group', children: [{ id: 'c' }] }])).s === 400);
check('a valid nested menu is accepted', (await call('POST', '/metadata/menu', A, [{ id: 'g', label: 'Group', type: 'group', children: [{ id: 'c', label: 'Child', view: 'lead', icon: 'Users' }] }])).s === 200);
check('the failed saves left the previous menu in place', ((await call('GET', '/metadata/menu', A)).j || [])[0]?.id === 'g');
await call('POST', '/metadata/menu', A, menu0); // put the original back
const set0 = (await call('GET', '/settings', A)).j;
check('saving the settings back unchanged works', (await call('POST', '/settings', A, set0)).s === 200, JSON.stringify(set0).slice(0, 80));
check('settings that are not settings are refused (400)', (await call('POST', '/settings', A, { name: 5, email: 'a@b.io' })).s === 400);
check('an unknown theme is refused (400)', (await call('POST', '/settings', A, { ...set0, theme: 'neon' })).s === 400);
check('a colour that is not #RRGGBB is refused (400)', (await call('POST', '/settings', A, { ...set0, customColor: 'red' })).s === 400);
check('a javascript: logo address is refused (400)', (await call('POST', '/settings', A, { ...set0, logoUrl: 'javascript:alert(1)' })).s === 400);
check('oversized settings are refused (400)', (await call('POST', '/settings', A, { ...set0, address: 'x'.repeat(30000) })).s === 400);
check('an audit entry without a record id is refused (400)', (await call('POST', '/audit', A, { entityType: 'lead', action: 'note' })).s === 400);
check('an audit entry with a record id is accepted', (await call('POST', '/audit', A, { entityType: 'lead', recordId: lead.id, action: 'note', details: { text: 'ok' } })).s === 200);

console.log(`\n=========== ${pass} passed, ${fails.length} failed ===========`);
process.exit(fails.length ? 1 : 0);
