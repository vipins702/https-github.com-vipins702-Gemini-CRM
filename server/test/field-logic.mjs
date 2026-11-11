// Formula fields, field triggers (before-save rules) and record scope (own = created or assigned; team = reports-to chain).
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/field-logic.mjs
const BASE = process.env.E2E_BASE || 'http://localhost:3015/api';
const tag = Date.now().toString().slice(-6);
const call = async (method, path, token, body) => {
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await res.json(); } catch { /* empty */ }
    return { s: res.status, j };
};
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).j?.token;
const A = await login(process.env.E2E_EMAIL || 'admin@flowcrm.com', process.env.E2E_PASSWORD);
if (!A) { console.log('Cannot log in as admin'); process.exit(2); }

const fails = []; let pass = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else { fails.push(name); console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const sec = (n) => console.log(`\n== ${n}`);
const rnd = () => Math.random().toString(36).slice(2, 8);
const one = async (id, t = A) => ({ j: ((await call('GET', '/data/lead', t)).j || []).find(x => x.id === id) });
const leadBody = (extra = {}) => ({ firstName: 'Logic', lastName: 'T' + rnd(), email: `fl.${rnd()}@example.com`, status: 'New', ...extra });

// ── Set-up: add test fields to the lead definition ────────────────────────
const schemas = (await call('GET', '/metadata/schemas', A)).j;
const lead = schemas.lead;
const extraFields = [
    { name: 'fl_interested', label: 'Interested', type: 'select', options: ['Yes', 'No'] },
    { name: 'fl_budget', label: 'Budget OK', type: 'select', options: ['Yes', 'No'] },
    { name: 'fl_callback', label: 'Callback', type: 'select', options: ['Yes', 'No'] },
    { name: 'fl_priority', label: 'Priority', type: 'text' },
    { name: 'fl_qty', label: 'Quantity', type: 'number' },
    { name: 'fl_price', label: 'Unit price', type: 'number' },
    { name: 'fl_total', label: 'Total', type: 'formula', formula: '{fl_qty} * {fl_price}' },
    { name: 'fl_fullname', label: 'Full name', type: 'formula', formula: '{firstName} {lastName}' },
    { name: 'fl_note', label: 'Changed note', type: 'text' },
];
const def = { ...lead, fields: [...lead.fields.filter(f => !f.name.startsWith('fl_')), ...extraFields] };
const saved = await call('POST', '/metadata/schemas', A, { entityType: 'lead', config: def });
check('test fields added to lead', saved.s < 300, JSON.stringify(saved.j));

sec('1. Formula fields');
let r = await call('POST', '/data/lead', A, leadBody({ firstName: 'Asha', lastName: 'Rao', fl_qty: 3, fl_price: 12.5 }));
check('create ok', r.s < 300, JSON.stringify(r.j));
let got = (await one(r.j?.id)).j || {};
check('numeric formula = 37.5', got.fl_total === 37.5, JSON.stringify(got.fl_total));
check('text formula = "Asha Rao"', got.fl_fullname === 'Asha Rao', JSON.stringify(got.fl_fullname));
r = await call('POST', '/data/lead', A, { ...got, id: got.id, fl_qty: 4, fl_total: 999999 });
got = (await one(got.id)).j || {};
check('formula recalculated on edit (4 x 12.5 = 50)', got.fl_total === 50, JSON.stringify(got.fl_total));
check('a typed value cannot override a formula', got.fl_total !== 999999);
r = await call('POST', '/data/lead', A, leadBody({ fl_qty: 2 }));
got = (await one(r.j?.id)).j || {};
check('blank number counts as 0 in a formula', got.fl_total === 0, JSON.stringify(got.fl_total));

sec('2. Field triggers');
r = await call('POST', '/field-rules/lead', A, {
    name: 'Hot callback ' + tag, match: 'all',
    conditions: [{ field: 'fl_interested', operator: '==', value: 'Yes' }, { field: 'fl_budget', operator: '==', value: 'No' }, { field: 'fl_callback', operator: '==', value: 'Yes' }],
    actions: [{ field: 'fl_priority', value: 'Nurture {firstName}' }],
});
check('rule created', r.s < 300 && r.j?.id, JSON.stringify(r.j));
const ruleId = r.j?.id;
r = await call('POST', '/data/lead', A, leadBody({ firstName: 'Ravi', fl_interested: 'Yes', fl_budget: 'No', fl_callback: 'Yes' }));
got = (await one(r.j?.id)).j || {};
check('Yes / No / Yes sets Priority', got.fl_priority === 'Nurture Ravi', JSON.stringify(got.fl_priority));
r = await call('POST', '/data/lead', A, leadBody({ fl_interested: 'Yes', fl_budget: 'Yes', fl_callback: 'Yes' }));
got = (await one(r.j?.id)).j || {};
check('Yes / Yes / Yes leaves Priority alone', !got.fl_priority, JSON.stringify(got.fl_priority));
// edit into the matching state
r = await call('POST', '/data/lead', A, { ...got, id: got.id, fl_budget: 'No' });
got = (await one(got.id)).j || {};
check('trigger also runs on edit', got.fl_priority?.startsWith('Nurture'), JSON.stringify(got.fl_priority));
// "any" + "changed"
await call('POST', '/field-rules/lead', A, { name: 'Changed ' + tag, match: 'any', conditions: [{ field: 'fl_qty', operator: 'changed' }], actions: [{ field: 'fl_note', value: 'qty changed' }] });
r = await call('POST', '/data/lead', A, leadBody({ fl_qty: 1 }));
got = (await one(r.j?.id)).j || {};
check('"changed" does not fire on create', !got.fl_note, JSON.stringify(got.fl_note));
await call('POST', '/data/lead', A, { ...got, id: got.id, fl_qty: 2 });
got = (await one(got.id)).j || {};
check('"changed" fires when the field changes', got.fl_note === 'qty changed', JSON.stringify(got.fl_note));
// turning a rule off
await call('POST', '/field-rules/lead', A, { id: ruleId, name: 'Hot callback ' + tag, active: false, match: 'all', conditions: [{ field: 'fl_interested', operator: '==', value: 'Yes' }], actions: [{ field: 'fl_priority', value: 'X' }] });
r = await call('POST', '/data/lead', A, leadBody({ fl_interested: 'Yes' }));
got = (await one(r.j?.id)).j || {};
check('an inactive rule does nothing', !got.fl_priority, JSON.stringify(got.fl_priority));
// validation
check('unknown field refused', (await call('POST', '/field-rules/lead', A, { name: 'x', conditions: [{ field: 'nope', operator: '==', value: 1 }], actions: [{ field: 'fl_priority', value: 'a' }] })).s === 400);
check('setting a formula field refused', (await call('POST', '/field-rules/lead', A, { name: 'x', conditions: [{ field: 'fl_qty', operator: '>', value: 1 }], actions: [{ field: 'fl_total', value: '1' }] })).s === 400);
check('bad operator refused', (await call('POST', '/field-rules/lead', A, { name: 'x', conditions: [{ field: 'fl_qty', operator: 'eval', value: 1 }], actions: [{ field: 'fl_priority', value: 'a' }] })).s === 400);
check('no conditions refused', (await call('POST', '/field-rules/lead', A, { name: 'x', conditions: [], actions: [{ field: 'fl_priority', value: 'a' }] })).s === 400);
check('rules list', ((await call('GET', '/field-rules/lead', A)).j?.rules || []).length >= 2);

sec('3. Record scope: own = created or assigned, team = reports-to chain');
const role = async (scope) => (await call('POST', '/roles', A, { name: `Scope ${scope} ${tag}${rnd()}`, description: 'x', permissions: { lead: { read: true, create: true, edit: true, delete: false, scope } } })).j?.id;
const ownRole = await role('own'), teamRole = await role('team');
const mk = async (label, roleId, reportsTo) => {
    const email = `scope.${label}.${tag}@flowcrm.test`;
    const s = await call('POST', '/users', A, { email, password: 'Scope@12345x', roleId, name: `${label} User`, ...(reportsTo ? { reportsTo } : {}) });
    const id = ((await call('GET', '/users', A)).j || []).find(u => u.email === email)?.id;
    return { id, email, token: await login(email, 'Scope@12345x'), status: s.s };
};
const mgr = await mk('mgr', teamRole);
const rm1 = await mk('rm1', ownRole, mgr.id);
const rm2 = await mk('rm2', ownRole, mgr.id);
const other = await mk('other', ownRole);
check('users created', !!(mgr.id && rm1.id && rm2.id && other.id && rm1.token));
check('reportsTo returned by /users', ((await call('GET', '/users', A)).j || []).find(u => u.id === rm1.id)?.reportsTo === mgr.id);

const l1 = (await call('POST', '/data/lead', rm1.token, leadBody({ firstName: 'Rm1lead' }))).j?.id;
const l2 = (await call('POST', '/data/lead', rm2.token, leadBody({ firstName: 'Rm2lead' }))).j?.id;
const lo = (await call('POST', '/data/lead', other.token, leadBody({ firstName: 'Otherlead' }))).j?.id;
const ids = async (t) => ((await call('GET', '/data/lead', t)).j || []).map(x => x.id);
let v = await ids(rm1.token);
check('RM sees the lead they created', v.includes(l1));
check('RM does not see a colleague\'s lead', !v.includes(l2) && !v.includes(lo));
v = await ids(mgr.token);
check('manager (team) sees both RMs\' leads', v.includes(l1) && v.includes(l2));
check('manager does not see someone outside the team', !v.includes(lo));
check('RM cannot open a colleague\'s lead', (await call('GET', `/records/lead/${l2}/related-activity`, rm1.token)).s === 403);
check('manager can open a team lead', (await call('GET', `/records/lead/${l1}/related-activity`, mgr.token)).s === 200);
check('manager can edit a team lead', (await call('POST', '/data/lead', mgr.token, { ...leadBody({ firstName: 'MgrEdit' }), id: l1 })).s < 300);
// search respects scope
const found = ((await call('GET', '/search?q=Rm2lead', rm1.token)).j || []).map(x => x.id);
check('search does not leak a colleague\'s lead', !found.includes(l2));
// loops refused
check('a user cannot report to themselves', (await call('POST', '/users', A, { id: mgr.id, email: mgr.email, roleId: teamRole, name: 'mgr User', reportsTo: mgr.id })).s === 400);
check('a reporting loop is refused', (await call('POST', '/users', A, { id: mgr.id, email: mgr.email, roleId: teamRole, name: 'mgr User', reportsTo: rm1.id })).s === 400);
check('unknown manager refused', (await call('POST', '/users', A, { id: rm1.id, email: rm1.email, roleId: ownRole, name: 'rm1 User', reportsTo: 'nobody' })).s === 400);

sec('3b. Reports, dashboard, saved reports, related records and tasks follow the same scope');
const adminLeads = ((await call('GET', '/data/lead', A)).j || []).length;
const rmCount = (await ids(rm1.token)).length, mgrCount = (await ids(mgr.token)).length;
let st = (await call('GET', '/dashboard/stats', rm1.token)).j;
check('dashboard lead count = what the RM can see', st?.leadCount === rmCount, JSON.stringify({ got: st?.leadCount, want: rmCount, all: adminLeads }));
st = (await call('GET', '/dashboard/stats', mgr.token)).j;
check('dashboard lead count for the manager = team', st?.leadCount === mgrCount, JSON.stringify({ got: st?.leadCount, want: mgrCount }));
check('admin dashboard still counts every lead', (await call('GET', '/dashboard/stats', A)).j?.leadCount === adminLeads);
let rep = (await call('POST', '/reports/lead_list/run', rm1.token, { pageSize: 100 })).j;
check('lead list report = the RM leads only', rep?.total === rmCount && (rep?.rows || []).every(x => !/Rm2lead|Otherlead/.test(x.name || '')), JSON.stringify({ total: rep?.total, want: rmCount }));
rep = (await call('POST', '/reports/lead_list/run', mgr.token, { pageSize: 100 })).j;
check('lead list report = the manager team', rep?.total === mgrCount, JSON.stringify({ total: rep?.total, want: mgrCount }));
// cache: run as manager first, then the RM must not get the the manager cached numbers
const kpi = async (t) => (await call('POST', '/reports/packs/dashboard_summary/run', t, { datasets: ['kpi'] })).j?.datasets?.kpi?.row?.total_leads;
const kMgr = await kpi(mgr.token), kRm = await kpi(rm1.token), kAdmin = await kpi(A);
check('report pack KPI: manager sees team total', kMgr === mgrCount, JSON.stringify({ kMgr, mgrCount }));
check('report pack KPI: RM is not served the the manager cached total', kRm === rmCount, JSON.stringify({ kRm, rmCount }));
check('report pack KPI: admin sees all', kAdmin === adminLeads, JSON.stringify({ kAdmin, adminLeads }));
check('pack response does not echo the scope', !('_scope' in ((await call('POST', '/reports/packs/dashboard_summary/run', rm1.token, { datasets: ['kpi'] })).j?.params || {})));
check('caller cannot widen scope through params', (await call('POST', '/reports/packs/dashboard_summary/run', rm1.token, { datasets: ['kpi'], params: { _scope: '{"lead":null}' } })).j?.datasets?.kpi?.row?.total_leads === rmCount);
const sr = (await call('POST', '/saved-reports/run', rm1.token, { entityType: 'lead', columns: [{ field: 'firstName' }] })).j;
check('saved report rows = the RM leads only', (sr?.rows || []).length === rmCount && sr.rows.every(x => !/Rm2lead|Otherlead/.test(x.firstName || '')), JSON.stringify({ n: sr?.rows?.length, want: rmCount }));
check('saved report on a type the role cannot read is refused', (await call('POST', '/saved-reports/run', rm1.token, { entityType: 'case', columns: [] })).s === 403);
check('named report on a type the role cannot read is refused', (await call('POST', '/reports/cases_by_priority/run', rm1.token, {})).s === 403);
// tasks: own scope covers tasks assigned to the person
const taskRole = await (async () => (await call('POST', '/roles', A, { name: 'Task own ' + tag, description: 'x', permissions: { task: { read: true, create: true, edit: true, scope: 'own' } } })).j?.id)();
const tu = await mk('tasker', taskRole);
const tA = (await call('POST', '/data/task', A, { subject: 'Assigned to tasker ' + tag, status: 'Not Started', assigneeId: tu.id })).j?.id;
const tB = (await call('POST', '/data/task', A, { subject: 'Not theirs ' + tag, status: 'Not Started' })).j?.id;
const tl = ((await call('GET', '/tasks', tu.token)).j || []).map(x => x.id);
check('task list shows a task assigned to them', tl.includes(tA), JSON.stringify(tl.length));
check('task list hides other tasks', !tl.includes(tB));

sec('4. Form layouts are validated');
const goodLayout = (await call('GET', '/metadata/layouts/lead', A)).j;
check('stored layout has sections', Array.isArray(goodLayout?.sections) && goodLayout.sections.length > 0);
check('junk layout refused', (await call('POST', '/metadata/layouts/lead', A, { name: 5, email: 'a@b.io' })).s === 400);
check('section without columns refused', (await call('POST', '/metadata/layouts/lead', A, { sections: [{ id: 's', title: 'x' }] })).s === 400);
check('column width 13 refused', (await call('POST', '/metadata/layouts/lead', A, { sections: [{ id: 's', title: 'x', columns: [{ id: 'c', width: 13, fields: [] }] }] })).s === 400);
check('bad showOn refused', (await call('POST', '/metadata/layouts/lead', A, { ...goodLayout, fieldConfigs: { email: { showOn: 'everywhere' } } })).s === 400);
check('showOn: form accepted', (await call('POST', '/metadata/layouts/lead', A, { ...goodLayout, fieldConfigs: { ...(goodLayout.fieldConfigs || {}), email: { showOn: 'form' } } })).s < 300);
check('showOn kept', (await call('GET', '/metadata/layouts/lead', A)).j?.fieldConfigs?.email?.showOn === 'form');
await call('POST', '/metadata/layouts/lead', A, goodLayout);

sec('5. Web Presenter public data link');
const pub = async (path) => { const res = await fetch(BASE + path); let j = null; try { j = await res.json(); } catch {} return { s: res.status, j }; };
for (let i = 0; i < 7; i++) await call('POST', '/data/lead', A, leadBody({ firstName: 'Wp' + i, company: 'WpCity' + tag, fl_qty: i }));
const slugNo = 'wp-nofields-' + tag, slug = 'wp-' + tag;
await call('POST', '/web-content', A, { slug: slugNo, type: 'crm', title: 'No fields', content: JSON.stringify({ entity: 'lead', filters: [] }), metadata: { crmEntity: 'lead' } });
check('a view with no shared fields shares nothing', (await pub('/web-content/' + slugNo + '/data')).s === 409);
await call('POST', '/web-content', A, { slug, type: 'crm', title: 'By company', content: JSON.stringify({ entity: 'lead', filters: [{ field: 'company', op: 'eq', value: '{co}' }], fields: ['firstName', 'company', 'fl_qty'] }), metadata: { crmEntity: 'lead', crmParams: [{ name: 'co', label: 'Company' }] } });
let w = await pub('/web-content/' + slug + '/data');
check('missing parameter refused with its name', w.s === 400 && (w.j?.missing || []).includes('co'), JSON.stringify(w.j));
w = await pub('/web-content/' + slug + '/data?co=WpCity' + tag + '&pageSize=3&page=2&sort=fl_qty&dir=desc');
check('filter + paging: 7 total, 3 per page, page 2', w.s === 200 && w.j?.total === 7 && w.j?.count === 3 && w.j?.page === 2 && w.j?.pages === 3, JSON.stringify({ t: w.j?.total, c: w.j?.count, p: w.j?.page }));
check('sorted descending', w.j?.data?.[0]?.fl_qty === 3, JSON.stringify(w.j?.data?.map(d => d.fl_qty)));
check('only shared fields returned (no email)', w.j?.data?.every(d => !('email' in d) && 'firstName' in d && 'id' in d));
check('pageSize capped at 100', (await pub('/web-content/' + slug + '/data?co=x&pageSize=5000')).j?.pageSize === 100);
check('unknown view 404', (await pub('/web-content/nope-' + tag + '/data')).s === 404);

// tidy: remove test rules and fields
for (const rr of (await call('GET', '/field-rules/lead', A)).j?.rules || []) if (rr.name.endsWith(tag)) await call('DELETE', `/field-rules/lead/${rr.id}`, A);
await call('POST', '/metadata/schemas', A, { entityType: 'lead', config: lead });

console.log(`\n=========== ${pass} passed, ${fails.length} failed ===========`);
process.exit(fails.length ? 1 : 0);
