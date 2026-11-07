// Permission matrix: for each role flag (read / create / edit / delete / manage / scope / field rules)
// checks what the server really allows. "Allowed" = anything but 401/403 (a 400 still passed the gate).
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/permissions-matrix.mjs
const BASE = process.env.E2E_BASE || 'http://localhost:3015/api';
const tag = Date.now().toString().slice(-6);
const call = async (method, path, token, body, form) => {
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    let j = null; try { j = await res.json(); } catch { /* empty */ }
    return { s: res.status, j };
};
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).j?.token;
const A = await login(process.env.E2E_EMAIL || 'admin@flowcrm.com', process.env.E2E_PASSWORD);
if (!A) { console.log('Cannot log in as admin'); process.exit(2); }

const fails = []; let pass = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; } else { fails.push(name); console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const gate = (r) => r.s !== 401 && r.s !== 403;
const sec = (n) => console.log(`\n== ${n}`);

let n = 0;
const mkUser = async (label, permissions) => {
    const role = await call('POST', '/roles', A, { name: `${label} ${tag}${n}`, description: label, permissions });
    const email = `perm.${tag}.${n++}@flowcrm.test`;
    await call('POST', '/users', A, { email, password: 'Perm@12345x', roleId: role.j?.id, name: 'Perm User' });
    return { token: await login(email, 'Perm@12345x'), roleId: role.j?.id, email };
};
const P = (read, create, edit, del, scope = 'all') => ({ lead: { read, create, edit, delete: del, scope } });

// fixtures owned by admin
const mkLead = async (tok = A, extra = {}) => (await call('POST', '/data/lead', tok, { firstName: 'Fix', lastName: 'Ture' + Math.random().toString(36).slice(2, 6), email: `fx.${Math.random().toString(36).slice(2, 8)}@example.com`, phone: '+9198' + String(Math.floor(10000000 + Math.random() * 89999999)), status: 'New', ...extra })).j?.id;

// ───────────────────────────────────────────────────────────────────────────
sec('1. Flag matrix on "lead" (each flag alone and in combinations)');
const combos = [
    ['none',            P(false, false, false, false), { list: 0, create: 0, update: 0, del: 0 }],
    ['read only',       P(true, false, false, false),  { list: 1, create: 0, update: 0, del: 0 }],
    ['create only',     P(false, true, false, false),  { list: 0, create: 1, update: 0, del: 0 }],
    ['edit only',       P(false, false, true, false),  { list: 0, create: 0, update: 1, del: 0 }],
    ['delete only',     P(false, false, false, true),  { list: 0, create: 0, update: 0, del: 1 }],
    ['read+edit',       P(true, false, true, false),   { list: 1, create: 0, update: 1, del: 0 }],
    ['read+create',     P(true, true, false, false),   { list: 1, create: 1, update: 0, del: 0 }],
    ['read+delete',     P(true, false, false, true),   { list: 1, create: 0, update: 0, del: 1 }],
    ['read+edit+delete',P(true, false, true, true),    { list: 1, create: 0, update: 1, del: 1 }],
    ['all four',        P(true, true, true, true),     { list: 1, create: 1, update: 1, del: 1 }],
];
for (const [label, perms, want] of combos) {
    const u = await mkUser(label, perms);
    const target = await mkLead();
    const delTarget = await mkLead();
    const stat = (id) => call('POST', `/data/lead/${id}/status`, u.token, { status: 'Contacted' });
    const tests = [
        ['list', want.list, () => call('GET', '/data/lead', u.token)],
        ['create', want.create, () => call('POST', '/data/lead', u.token, { firstName: 'New', lastName: 'ByRole', email: `nb.${Math.random().toString(36).slice(2, 8)}@example.com`, status: 'New' })],
        ['update', want.update, () => call('POST', '/data/lead', u.token, { id: target, firstName: 'Changed', lastName: 'ByRole', email: `up.${Math.random().toString(36).slice(2, 8)}@example.com`, status: 'New' })],
        ['status change', want.update, () => stat(target)],
        ['delete', want.del, () => call('DELETE', `/data/lead/${delTarget}`, u.token)],
        ['view notes', want.list, () => call('GET', `/notes/lead/${target}`, u.token)],
        ['add note', want.update, () => call('POST', `/notes/lead/${target}`, u.token, { note: 'hello' })],
        ['related activity', want.list, () => call('GET', `/records/lead/${target}/related-activity`, u.token)],
        ['record history (audit)', want.list, () => call('GET', `/audit/lead/${target}`, u.token)],
        ['attachments list', want.list, () => call('GET', `/attachments/lead/${target}`, u.token)],
        ['duplicate check', want.list, () => call('GET', '/leads/check-duplicate?email=a@b.io&phone=%2B919800000000', u.token)],
        ['CSV import', want.create, () => { const f = new FormData(); f.append('file', new Blob(['firstName,lastName,email\nImp,Orted,imp.' + tag + '@example.com\n'], { type: 'text/csv' }), 'x.csv'); return call('POST', '/data/lead/import', u.token, null, f); }],
        ['search finds leads', want.list, async () => { const r = await call('GET', '/search?q=Fix', u.token); return { s: (r.j || []).some(x => x.entityType === 'lead') ? 200 : 403 }; }],
    ];
    for (const [op, allow, fn] of tests) {
        const r = await fn();
        check(`[${label}] ${op} ${allow ? 'allowed' : 'blocked'}`, allow ? gate(r) : r.s === 403, `got ${r.s}`);
    }
}

// ───────────────────────────────────────────────────────────────────────────
sec('2. "manage" flag and admin role');
{
    const u = await mkUser('manage', { lead: { manage: true } });
    const id = await mkLead();
    check('[manage] list', gate(await call('GET', '/data/lead', u.token)));
    check('[manage] update', gate(await call('POST', '/data/lead', u.token, { id, firstName: 'M', lastName: 'G', email: `mg.${tag}@example.com`, status: 'New' })));
    check('[manage] delete', gate(await call('DELETE', `/data/lead/${id}`, u.token)));
}

// ───────────────────────────────────────────────────────────────────────────
sec('3. Scope "own": other people\'s records are untouchable');
{
    const u = await mkUser('own scope', P(true, true, true, true, 'own'));
    // A lead that really belongs to someone else (round-robin may hand a new lead to this very rep, so check).
    const repId = ((await call('GET', '/users', A)).j || []).find(x => x.email === u.email)?.id;
    let theirs;
    for (let i = 0; i < 12 && !theirs; i++) {
        const id = await mkLead();
        const rec = ((await call('GET', '/data/lead', A)).j || []).find(r => r.id === id);
        if (rec?._assigned_to !== repId) theirs = id;
    }
    const mine = (await call('POST', '/data/lead', u.token, { firstName: 'Mine', lastName: 'Own' + tag, email: `mine.${tag}@example.com`, status: 'New' })).j?.id;
    const ids = ((await call('GET', '/data/lead', u.token)).j || []).map(r => r.id);
    check('[own] list shows only own', ids.includes(mine) && !ids.includes(theirs), `sees ${ids.length}`);
    check('[own] update other\'s blocked', (await call('POST', '/data/lead', u.token, { id: theirs, firstName: 'X', lastName: 'Y', email: `o.${tag}@example.com`, status: 'New' })).s === 403);
    check('[own] status of other\'s blocked', (await call('POST', `/data/lead/${theirs}/status`, u.token, { status: 'Contacted' })).s === 403);
    check('[own] delete other\'s blocked', (await call('DELETE', `/data/lead/${theirs}`, u.token)).s === 403);
    check('[own] notes of other\'s blocked', (await call('GET', `/notes/lead/${theirs}`, u.token)).s === 403);
    check('[own] add note on other\'s blocked', (await call('POST', `/notes/lead/${theirs}`, u.token, { note: 'sneaky' })).s === 403);
    check('[own] related-activity of other\'s blocked', (await call('GET', `/records/lead/${theirs}/related-activity`, u.token)).s === 403);
    check('[own] history of other\'s blocked', (await call('GET', `/audit/lead/${theirs}`, u.token)).s === 403);
    check('[own] attachments of other\'s blocked', (await call('GET', `/attachments/lead/${theirs}`, u.token)).s === 403);
    check('[own] update own allowed', gate(await call('POST', '/data/lead', u.token, { id: mine, firstName: 'Mine2', lastName: 'Own' + tag, email: `mine.${tag}@example.com`, status: 'New' })));
    check('[own] delete own allowed', gate(await call('DELETE', `/data/lead/${mine}`, u.token)));
    const t = await mkUser('team scope', P(true, true, true, true, 'team'));
    const adminCount = ((await call('GET', '/data/lead', A)).j || []).length;
    const teamCount = ((await call('GET', '/data/lead', t.token)).j || []).length;
    check('[team] scope "team" is actually enforced (not same as all)', teamCount < adminCount, `team sees ${teamCount} of ${adminCount} (no team concept exists)`);
}

// ───────────────────────────────────────────────────────────────────────────
sec('4. Field-level rules');
{
    const u = await mkUser('field rules', { lead: { read: true, create: true, edit: true, delete: false, scope: 'all', fields: { email: { read: false, edit: false }, phone: { read: true, edit: false } } } });
    const id = await mkLead(A, { company: 'FieldCo' });
    const row = ((await call('GET', '/data/lead', u.token)).j || []).find(r => r.id === id);
    check('[fields] hidden field (email) not returned in list', row && row.email === undefined, `email=${row?.email}`);
    const before = row?.phone;
    await call('POST', '/data/lead', u.token, { id, firstName: row?.firstName, lastName: row?.lastName, phone: '+919811122233', email: 'forced@example.com', status: 'New' });
    const after = ((await call('GET', '/data/lead', A)).j || []).find(r => r.id === id);
    check('[fields] read-only field (phone) cannot be changed', after?.phone === before, `${before} -> ${after?.phone}`);
    check('[fields] hidden field (email) cannot be changed', after?.email !== 'forced@example.com', `email=${after?.email}`);
    const rel = (await call('GET', `/records/lead/${id}/related-activity`, u.token)).s;
    check('[fields] hidden field not leaked by search', !JSON.stringify((await call('GET', '/search?q=example.com', u.token)).j || []).includes('@example.com'));
    void rel;
}

// ───────────────────────────────────────────────────────────────────────────
sec('5. Role with NO module access cannot reach anything record-like');
{
    const u = await mkUser('empty', {});
    const lid = await mkLead();
    const mustBlock = [
        ['GET /users', 'GET', '/users'], ['GET /audit-logs', 'GET', '/audit-logs'], ['GET /audit/recent', 'GET', '/audit/recent'],
        ['GET /quotes', 'GET', '/quotes'], ['GET /campaigns', 'GET', '/campaigns'], ['GET /tasks', 'GET', '/tasks'],
        ['GET /whatsapp/conversations', 'GET', '/whatsapp/conversations'], ['GET /email/conversations', 'GET', '/email/conversations'],
        ['GET /cti/calls', 'GET', '/cti/calls'], ['GET /scoring-rules', 'GET', '/scoring-rules'], ['GET /assignment-rules', 'GET', '/assignment-rules'],
        ['GET /lead-rules', 'GET', '/lead-rules'], ['GET /sequences', 'GET', '/sequences'], ['GET /saved-reports', 'GET', '/saved-reports'],
        ['GET /reports', 'GET', '/reports'], ['GET dashboard stats', 'GET', '/dashboard/stats'],
        ['GET lead related (data/related)', 'GET', `/data/lead/${lid}/related/customer`],
        ['POST /quotes', 'POST', '/quotes', { customerId: lid, items: [] }], ['POST /campaigns', 'POST', '/campaigns', { name: 'x' }],
        ['POST /scoring-rules', 'POST', '/scoring-rules', { name: 'x', field: 'status', operator: '==', value: 'New', points: 1 }],
        ['POST /assignment-rules', 'POST', '/assignment-rules', { name: 'x' }], ['POST /lead-rules', 'POST', '/lead-rules', { name: 'x' }],
        ['POST /sequences', 'POST', '/sequences', { name: 'x', steps: [] }], ['POST /processes/lead', 'POST', '/processes/lead', { name: 'x', stages: [] }],
        ['POST /email/send', 'POST', '/email/send', { to: 'a@b.io', subject: 's', body: 'b' }], ['POST /whatsapp/send', 'POST', '/whatsapp/send', { to: '+919800000001', body: 'hi' }],
        ['POST /cti/log-call', 'POST', '/cti/log-call', { from: '+919800000001', to: '+919800000002' }],
        ['POST /tasks/:id/assign', 'POST', `/tasks/${lid}/assign`, { assignee: 'x' }], ['POST /lead-rules/run-all', 'POST', '/lead-rules/run-all', {}],
        ['POST /roles', 'POST', '/roles', { name: 'hack', permissions: { admin: true } }], ['POST /users', 'POST', '/users', { email: 'h@h.io', password: 'Hh@123456', roleId: 'admin', name: 'H' }],
        ['POST /settings', 'POST', '/settings', { theme: 'dark' }], ['POST /metadata/schemas', 'POST', '/metadata/schemas', {}],
        ['POST /workflows', 'POST', '/workflows', {}], ['POST /dashboard/widgets', 'POST', '/dashboard/widgets', []],
    ];
    for (const [name, m, p, b] of mustBlock) {
        const r = await call(m, p, u.token, b);
        check(`[no access] ${name} blocked`, r.s === 403, `got ${r.s}`);
    }
}

// ───────────────────────────────────────────────────────────────────────────
sec('6. Role edits take effect at once, and round-trip intact');
{
    const perms = { lead: { read: true, create: false, edit: false, delete: false, scope: 'own', fields: { email: { read: false, edit: false } } } };
    const u = await mkUser('roundtrip', perms);
    const saved = ((await call('GET', '/roles', A)).j || []).find(r => r.id === u.roleId);
    check('role permissions read back unchanged (scope + fields kept)', JSON.stringify(saved?.permissions) === JSON.stringify(perms), JSON.stringify(saved?.permissions));
    const lg = await call('POST', '/auth/login', null, { email: u.email, password: 'Perm@12345x' });
    check('login returns the role permissions to the UI', JSON.stringify(lg.j?.user?.permissions) === JSON.stringify(perms), JSON.stringify(lg.j?.user?.permissions));
    const before = (await call('POST', '/data/lead', u.token, { firstName: 'A', lastName: 'B', email: `rt.${tag}@example.com`, status: 'New' })).s;
    await call('POST', '/roles', A, { id: u.roleId, name: saved.name, description: 'x', permissions: P(true, true, true, true) });
    const after = (await call('POST', '/data/lead', u.token, { firstName: 'A', lastName: 'B', email: `rt2.${tag}@example.com`, status: 'New' })).s;
    check('granting "create" works without re-login', before === 403 && gate({ s: after }), `before ${before}, after ${after}`);
    await call('POST', '/roles', A, { id: u.roleId, name: saved.name, description: 'x', permissions: P(false, false, false, false) });
    check('revoking "read" works without re-login', (await call('GET', '/data/lead', u.token)).s === 403);
    const del = await call('DELETE', `/roles/${u.roleId}`, A);
    check('deleting a role that still has users is refused (or users lose access)', del.s === 409 || del.s === 400 || (await call('GET', '/data/lead', u.token)).s === 403, `delete ${del.s}`);
}

// ───────────────────────────────────────────────────────────────────────────
sec('7. Live permissions, cross-type writes, who receives auto-assigned leads');
{
    const u = await mkUser('live', P(true, false, false, false));
    const me1 = await call('GET', '/auth/me', u.token);
    check('/auth/me returns current permissions', me1.j?.permissions?.lead?.read === true && !me1.j?.permissions?.lead?.edit, JSON.stringify(me1.j?.permissions));
    await call('POST', '/roles', A, { id: u.roleId, name: 'live ' + tag, description: 'x', permissions: P(true, true, true, false) });
    const me2 = await call('GET', '/auth/me', u.token);
    check('/auth/me follows a role change without re-login', me2.j?.permissions?.lead?.edit === true, JSON.stringify(me2.j?.permissions));

    // an edit right on leads must not let someone overwrite a record of another type
    const caseId = (await call('POST', '/data/case', A, { subject: 'Untouchable ' + tag, description: 'd', priority: 'Low', status: 'New' })).j?.id;
    const hit = await call('POST', '/data/lead', u.token, { id: caseId, firstName: 'Over', lastName: 'Write', email: 'ow@example.com', status: 'New' });
    const caseAfter = ((await call('GET', '/data/case', A)).j || []).find(r => r.id === caseId);
    check('[cross-type] editing a case through /data/lead is refused', hit.s === 404 && caseAfter?.subject === 'Untouchable ' + tag, `got ${hit.s}, subject=${caseAfter?.subject}`);

    // round-robin only hands leads to people who can open leads (and never to the platform owner)
    const noLead = await mkUser('cases only', { case: { read: true, create: true, edit: true, delete: false, scope: 'all' } });
    const usersAll = (await call('GET', '/users', A)).j || [];
    const noLeadId = usersAll.find(x => x.email === noLead.email)?.id;
    const owners = [];
    for (let i = 0; i < 12; i++) {
        const id = await mkLead();
        const rec = ((await call('GET', '/data/lead', A)).j || []).find(r => r.id === id);
        owners.push(rec?._assigned_to);
    }
    check('[assignment] no lead goes to a user who cannot open leads', !owners.includes(noLeadId), 'a cases-only user received a lead');
}

console.log(`\n=========== ${pass} passed, ${fails.length} failed ===========`);
process.exit(fails.length ? 1 : 0);
