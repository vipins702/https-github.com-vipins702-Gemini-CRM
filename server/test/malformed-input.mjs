// Malformed-input robustness: no request body may crash the server, hang, or produce a 5xx.
// Regression test for the crash where POST /api/users with a non-string "name" killed the process.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/malformed-input.mjs
const BASE = process.env.E2E_BASE || 'http://localhost:3015/api';
const HOST = BASE.replace(/\/api$/, '');
const call = async (method, path, token, body) => {
    try {
        const res = await fetch(BASE + path, { method, signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
        const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
        return { s: res.status, j, text };
    } catch (e) { return { s: 0, err: e.cause?.code || e.name, text: '' }; }
};
const alive = async () => { try { return (await fetch(HOST + '/', { signal: AbortSignal.timeout(3000) })).status === 200; } catch { return false; } };

const login = await call('POST', '/auth/login', null, { email: process.env.E2E_EMAIL || 'admin@flowcrm.com', password: process.env.E2E_PASSWORD });
const T = login.j?.token;
if (!T) { console.log('Cannot log in as admin'); process.exit(2); }
const lead = (await call('POST', '/data/lead', T, { firstName: 'Fuzz', lastName: 'Target', email: `fuzz.${Date.now()}@example.com`, status: 'New' })).j;

const targets = [
    '/data/lead', '/data/customer', '/data/task', `/data/lead/${lead?.id}/status`, '/quotes', '/roles', '/users', `/notes/lead/${lead?.id}`,
    '/lead-rules', '/scoring-rules', '/assignment-rules', '/sequences', '/campaigns', '/saved-reports', '/saved-reports/run', '/lookups/x',
    '/relationships', '/settings', '/metadata/schemas', '/metadata/layouts/lead', '/metadata/menu', '/workflows', '/dashboard/widgets', '/audit',
    '/notifications', '/email/send', '/whatsapp/send', '/cti/log-call', '/cti/route', '/processes/lead', '/web-content', '/ai/customer-insight',
];
const payloads = [
    ['null', 'null'], ['empty array', []], ['string', '"str"'], ['number', 123], ['nested', { a: { b: [1, { c: null }] } }],
    ['wrong types', { email: { x: 1 }, name: 5, firstName: {}, id: {}, status: 5, items: 'x', query: 7, to: {}, subject: [], note: 5, permissions: 'x', roleId: {}, password: 5 }],
    ['name as number (the original crash)', { name: 5, email: 'a@b.io', password: 'Aaaa!1111', roleId: 'admin' }],
    ['truncated JSON', '{"name": '],
];

let pass = 0; const fails = [];
const check = (label, ok, detail = '') => { if (ok) pass++; else { fails.push(label); console.log(`FAIL  ${label}${detail ? '  -> ' + detail : ''}`); } };

for (const path of targets) for (const [name, body] of payloads) {
    const r = await call('POST', path, T, body);
    check(`POST ${path.replace(lead?.id, ':id')} with ${name}: no crash, no 5xx`, r.s > 0 && r.s < 500, r.s === 0 ? `no response (${r.err}); server alive: ${await alive()}` : `HTTP ${r.s} ${r.text.slice(0, 80)}`);
    if (r.s === 0 && !(await alive())) { console.log('Server died, stopping.'); break; }
}
check('server still answering after all bad requests', await alive());

const u = await call('POST', '/users', T, { name: 5, email: 'x@y.io', password: 'Aaaa!1111', roleId: 'admin' });
check('POST /users with name 5 is refused with 400 and a reason', u.s === 400 && Array.isArray(u.j?.details), `HTTP ${u.s} ${u.text.slice(0, 80)}`);
const unknown = await call('GET', '/definitely-not-a-route', T);
check('unknown route answers 404 as JSON', unknown.s === 404 && typeof unknown.j?.error === 'string', `HTTP ${unknown.s} ${unknown.text.slice(0, 60)}`);
const bad = await call('POST', '/data/lead', T, '{"firstName": ');
check('truncated JSON answers 400 as JSON without a stack trace', bad.s === 400 && typeof bad.j?.error === 'string' && !/\.js|node_modules/.test(bad.text), `HTTP ${bad.s} ${bad.text.slice(0, 80)}`);
const rolesOk = await call('POST', '/roles', T, { name: `Valid role ${Date.now()}`, description: 'ok', permissions: { lead: { read: true } } });
check('a valid role is still accepted', rolesOk.s === 200, `HTTP ${rolesOk.s}`);
const noRole = await call('POST', '/users', T, { name: 'Ghost', email: `ghost.${Date.now()}@x.test`, password: 'Aaaa!1111', roleId: 'not-a-role' });
check('a user cannot be given a role that does not exist in the workspace', noRole.s === 400, `HTTP ${noRole.s}`);

console.log(`\n=========== ${pass} passed, ${fails.length} failed ===========`);
process.exit(fails.length ? 1 : 0);
