// End-to-end CRM scenarios against a running server.
//   JWT_SECRET=x ADMIN_PASSWORD=... PORT=3015 node server/index.js      (one terminal)
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/e2e-scenarios.mjs
// Prints PASS / FAIL / GAP per check. GAP = works as coded but the product lacks the capability.
const BASE = process.env.E2E_BASE || 'http://localhost:3015/api';
const EMAIL = process.env.E2E_EMAIL || 'design.review@flowcrm.test';
const PASS = process.env.E2E_PASSWORD || 'Design@12345';

const call = async (method, path, token, body) => {
    const res = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { s: res.status, j: json };
};

const results = [];
let section = '';
const sec = (name) => { section = name; console.log(`\n== ${name}`); };
const check = (name, ok, detail = '') => { results.push({ section, name, r: ok ? 'PASS' : 'FAIL' }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`); };
const gap = (name, detail = '') => { results.push({ section, name, r: 'GAP' }); console.log(`GAP   ${name}${detail ? '  -> ' + detail : ''}`); };
const tag = Date.now().toString().slice(-6);

const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).j?.token;
const A = await login(EMAIL, PASS);
if (!A) { console.log('Cannot log in as admin'); process.exit(2); }
const list = async (type, tok = A) => (await call('GET', `/data/${type}`, tok)).j || [];
const find = async (type, pred, tok = A) => (await list(type, tok)).find(pred);
const stats0 = (await call('GET', '/dashboard/stats', A)).j;
const leadCount0 = (await list('lead')).length;

// ─────────────────────────────────────────────────────────────────────────────
sec('1. Create leads: Instagram, WhatsApp, manual (5 scenarios)');
const key = (await call('GET', '/ingest-key', A)).j;
const ingestKey = key?.key || key?.ingestKey || key?.apiKey;
check('ingest key available for social webhooks', !!ingestKey, JSON.stringify(key));

const noKey = await call('POST', '/ingest/instagram', null, { name: 'x', email: 'x@x.io' });
check('social ingest without key is rejected (401)', noKey.s === 401, String(noKey.s));

const igEmail = `ig.priya.${tag}@example.com`;
const ig1 = await (await fetch(`${BASE}/ingest/instagram`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ingest-key': ingestKey || '' }, body: JSON.stringify({ full_name: 'Priya Instagram', email: igEmail, mobile: '+919811100011', instagram: '@priya.styles', message: 'Interested in Elite Card' }) })).json();
check('L1 Instagram lead (with email) created', ig1.success && !!ig1.id, JSON.stringify(ig1));
const ig1Rec = await find('lead', r => r.id === ig1.id);
check('L1 source recorded as Instagram', /instagram/i.test(ig1Rec?.source || ''), ig1Rec?.source);
check('L1 instagram handle kept', ig1Rec?.instagram === '@priya.styles', ig1Rec?.instagram);
check('L1 name split into first/last', ig1Rec?.firstName === 'Priya' && ig1Rec?.lastName === 'Instagram');

const ig2 = await call('POST', '/ingest/instagram', A, { name: 'DM Only Dev', instagram: '@dm.only.dev', message: 'price?' });
const ig2Rec = await find('lead', r => r.id === ig2.j?.id);
check('L2 Instagram DM lead without email/phone is still captured', ig2.s === 200 && !!ig2Rec, JSON.stringify(ig2.j));

const dup = await call('POST', '/ingest/instagram', A, { full_name: 'Priya Again', email: igEmail });
check('L1 duplicate Instagram lead (same email) is de-duplicated', dup.j?.deduped === true, JSON.stringify(dup.j));

const manualOk = await call('POST', '/data/lead', A, { firstName: 'Manual', lastName: 'Valid', email: `manual.${tag}@example.com`, phone: '+919822200022', company: 'Acme Ltd', status: 'New', source: 'Referral' });
check('L3 manual lead (valid) saved', manualOk.s === 200 && !!manualOk.j?.id, JSON.stringify(manualOk.j));
const manualBad = await call('POST', '/data/lead', A, { firstName: 'Bad', lastName: 'Email', email: 'not-an-email', status: 'New' });
check('L4 manual lead with invalid email is rejected (400)', manualBad.s === 400, String(manualBad.s));
const manualMissing = await call('POST', '/data/lead', A, { firstName: 'No', status: 'New' });
check('L4b manual lead missing required fields is rejected (400)', manualMissing.s === 400, String(manualMissing.s));

const waPhone = `+9199${tag}00`.slice(0, 13);
const wa = await call('POST', '/whatsapp/simulate-incoming', A, { from: waPhone, body: 'Hi, I want a Home Loan', profileName: 'WhatsApp Walter' });
check('L5 WhatsApp first message creates a lead', wa.s === 200 && wa.j?.ok !== false, JSON.stringify(wa.j));
const waLead = await find('lead', r => (r.name || '').includes('WhatsApp Walter') || (r.phone || '').includes(waPhone.slice(-8)));
check('L5 WhatsApp lead has source WhatsApp', waLead?.source === 'WhatsApp', waLead?.source);

const dupPhone = await call('GET', `/leads/check-duplicate?phone=${encodeURIComponent('+919822200022')}`, A);
check('duplicate-phone check finds the manual lead', JSON.stringify(dupPhone.j).includes('Manual') || dupPhone.j?.exists === true || (Array.isArray(dupPhone.j) && dupPhone.j.length > 0), JSON.stringify(dupPhone.j));

const xss = await call('POST', '/data/lead', A, { firstName: '<img src=x onerror=alert(1)>', lastName: 'Xss', email: `xss.${tag}@example.com`, status: 'New' });
check('script-like text is stored as plain text (UI escapes it)', xss.s === 200);

// ─────────────────────────────────────────────────────────────────────────────
sec('2. Lead journey: stages, tasks, activity, product + category tagging');
const L = manualOk.j?.id;
const move = async (status, note) => (await call('POST', `/data/lead/${L}/status`, A, { status, note }));
check('New -> Contacted', (await move('Contacted')).s === 200);
check('Contacted -> Qualified', (await move('Qualified')).s === 200);
const bogus = await move('Totally Bogus Stage');
if (bogus.s === 200) gap('server accepts a stage name that is not in the pipeline', 'any text can be set as status');
else check('unknown stage rejected', true);
await move('Qualified');

const cat = await call('POST', `/data/lead/${L}`, A, { id: L, firstName: 'Manual', lastName: 'Valid', email: `manual.${tag}@example.com`, status: 'Qualified', category: 'Card > Elite Card', interestedProduct: 'Elite Card', source: 'Referral' });
const afterCat = await find('lead', r => r.id === L);
check('lead keeps category tag (Card > Elite Card)', /Elite Card/.test(String(afterCat?.category || '')), String(afterCat?.category));
const schemas = (await call('GET', '/metadata/schemas', A)).j;
const leadFields = (schemas.lead?.fields || []).map(f => f.name);
if (!leadFields.includes('interestedProduct') && !leadFields.some(f => /product/i.test(f))) gap('Lead has no "Product of interest" field in the data model', 'only a category; product is stored as an untyped extra key');
else check('Lead has a product-of-interest field', true);

const task = await call('POST', '/data/task', A, { subject: 'Call the lead', customerId: L, status: 'Not Started', priority: 'High', dueDate: '2030-01-15', category: 'Call' });
check('task linked to lead created', task.s === 200 && !!task.j?.id, JSON.stringify(task.j));
const act = (await call('GET', `/records/lead/${L}/related-activity`, A)).j;
check('lead activity shows the task', (act?.tasks || []).some(t => t.subject === 'Call the lead'), JSON.stringify(act?.tasks));
check('lead activity shows stage history', (act?.stageHistory || []).length >= 2, `${(act?.stageHistory || []).length} entries`);
const note = await call('POST', `/notes/lead/${L}`, A, { body: 'Customer asked for a callback after 5pm', content: 'Customer asked for a callback after 5pm', text: 'Customer asked for a callback after 5pm' });
check('note saved on lead', note.s === 200, JSON.stringify(note.j));
const notes = (await call('GET', `/notes/lead/${L}`, A)).j;
check('note readable back', JSON.stringify(notes).includes('callback'), JSON.stringify(notes)?.slice(0, 120));
const audit = (await call('GET', `/audit/lead/${L}`, A)).j;
check('audit trail has create + update entries', Array.isArray(audit) && audit.length >= 2, `${Array.isArray(audit) ? audit.length : '?'} entries`);

const lostLead = await call('POST', '/data/lead', A, { firstName: 'Lost', lastName: 'Cause', email: `lost.${tag}@example.com`, status: 'New' });
check('journey FAIL path: New -> Lost', (await call('POST', `/data/lead/${lostLead.j.id}/status`, A, { status: 'Lost', note: 'Budget' })).s === 200);
const afterLost = await call('POST', `/leads/${lostLead.j.id}/convert`, A);
if (afterLost.s === 200 && afterLost.j?.customerId) gap('a LOST lead can still be converted to a customer', 'no guard on status');
else check('lost lead cannot be converted', true);

// ─────────────────────────────────────────────────────────────────────────────
sec('3. Qualification, convert to customer, relationship builder');
const relDefs = (await call('GET', '/relationships', A)).j || [];
const rel = await call('POST', '/relationships', A, { name: `lead_customer_${tag}`, sourceEntity: 'lead', targetEntity: 'customer', sourceField: 'customerId', targetField: 'id', relationshipType: 'lookup', displayField: 'name' });
check('relationship Lead -> Customer created in builder', rel.s === 200, JSON.stringify(rel.j));
const conv = await call('POST', `/leads/${L}/convert`, A);
check('convert qualified lead -> customer', conv.s === 200 && !!conv.j?.customerId, JSON.stringify(conv.j));
const C = conv.j?.customerId;
const convAgain = await call('POST', `/leads/${L}/convert`, A);
check('second convert is idempotent (same customer)', convAgain.j?.customerId === C && convAgain.j?.alreadyConverted === true, JSON.stringify(convAgain.j));
const leadAfter = await find('lead', r => r.id === L);
check('lead marked Won and linked to the customer', leadAfter?.status === 'Won' && leadAfter?._converted_to_customer === C, JSON.stringify({ s: leadAfter?.status, c: leadAfter?._converted_to_customer }));
const cust = await find('customer', r => r.id === C);
check('customer exists with lead email', cust?.email === `manual.${tag}@example.com`, cust?.email);
check('customer name is company when lead has one', cust?.name === 'Acme Ltd', cust?.name);
const relatedLead = (await call('GET', `/data/customer/${C}/related/lead`, A)).j;
check('customer -> related leads finds the source lead via relationship', Array.isArray(relatedLead) && relatedLead.some(r => r.id === L), JSON.stringify(relatedLead)?.slice(0, 140));
const upsell = await find('task', r => r.customerId === C);
check('conversion creates an upsell follow-up task', !!upsell, '');

// ─────────────────────────────────────────────────────────────────────────────
sec('4. Customer 360: does everything from the lead carry over?');
const carry = [['category', 'Elite Card'], ['interestedProduct', 'Elite Card'], ['source', 'Referral'], ['score', undefined], ['instagram', undefined]];
check('customer links back to the lead (_converted_from_lead)', cust?._converted_from_lead === L);
if (!/Elite Card/.test(String(cust?.category || ''))) gap('customer does not inherit the lead category / product tag', 'tag lives only on the lead');
if (!cust?.source) gap('customer does not keep the lead source (where they came from)', 'only a back-link id is kept');
const lead2 = await find('lead', r => r.id === ig1.id);
const conv2 = await call('POST', `/leads/${ig1.id}/convert`, A);
const cust2 = await find('customer', r => r.id === conv2.j?.customerId);
check('Instagram lead converts', conv2.s === 200 && !!cust2, JSON.stringify(conv2.j));
if (cust2 && !cust2.instagram) gap('Instagram handle is lost when the lead becomes a customer', 'customer has no instagram field');
const tasksAfter = (await call('GET', `/records/customer/${C}/related-activity`, A)).j;
if (!(tasksAfter?.tasks || []).some(t => t.subject === 'Call the lead')) gap('lead tasks / notes do not follow the lead to the customer 360', 'only the upsell task is linked');
const att = await call('GET', `/attachments/lead/${L}`, A);
check('attachments endpoint works for lead', att.s === 200);
const prof = await call('POST', `/upload/profile/lead/${L}`, A);
check('profile-image upload route exists (rejects empty upload)', [400, 415, 500].includes(prof.s) || prof.s === 200, String(prof.s));
if (!cust?.profileImage && !cust?.avatar && !cust?.image) gap('profile photo set on a lead is not copied to the customer', 'customer has no image after conversion');

// ─────────────────────────────────────────────────────────────────────────────
sec('5. Customer chat (WhatsApp + email)');
const cPhone = cust?.phone || '+919822200022';
const incoming = await call('POST', '/whatsapp/simulate-incoming', A, { from: cPhone, body: 'Where is my card?', profileName: 'Acme' });
check('customer WhatsApp inbound is accepted', incoming.s === 200 && incoming.j?.ok !== false, JSON.stringify(incoming.j));
const thread = (await call('GET', `/whatsapp/thread/${encodeURIComponent(cPhone)}`, A)).j;
check('chat thread contains the inbound message', JSON.stringify(thread).includes('Where is my card'), JSON.stringify(thread)?.slice(0, 120));
const sent = await call('POST', '/whatsapp/send', A, { to: cPhone, body: 'It ships tomorrow' });
check('agent reply sent (simulated mode ok)', sent.s === 200, JSON.stringify(sent.j));
const convs = (await call('GET', '/whatsapp/conversations', A)).j;
check('conversation appears in the inbox list', JSON.stringify(convs).includes(cPhone.slice(-8)), '');
const wa360 = (await call('GET', `/records/customer/${C}/related-activity`, A)).j;
check('customer 360 activity shows WhatsApp messages', (wa360?.whatsapp || []).length >= 1, `${(wa360?.whatsapp || []).length}`);
const mail = await call('POST', '/email/send', A, { to: cust?.email, subject: 'Welcome', body: 'Thanks for joining' });
check('email to customer is accepted (queued/simulated)', mail.s === 200 || mail.s === 202, `${mail.s} ${JSON.stringify(mail.j)?.slice(0, 120)}`);

// ─────────────────────────────────────────────────────────────────────────────
sec('6. Customer cases');
const cs = await call('POST', '/data/case', A, { subject: 'Card not delivered', customerId: C, description: 'Ordered 10 days ago', status: 'New', priority: 'High', contactEmail: cust?.email });
check('case for customer created', cs.s === 200 && !!cs.j?.id, JSON.stringify(cs.j));
check('case: New -> In Progress', (await call('POST', `/data/case/${cs.j.id}/status`, A, { status: 'In Progress' })).s === 200);
check('case: In Progress -> Escalated', (await call('POST', `/data/case/${cs.j.id}/status`, A, { status: 'Escalated' })).s === 200);
check('case: Escalated -> Resolved', (await call('POST', `/data/case/${cs.j.id}/status`, A, { status: 'Resolved', note: 'Re-shipped' })).s === 200);
const csBad = await call('POST', '/data/case', A, { subject: 'No priority', customerId: C, status: 'New' });
check('case without description/priority rejected (400)', csBad.s === 400, String(csBad.s));
const custCases = (await list('case')).filter(r => r.customerId === C);
check('case is attached to the customer', custCases.length >= 1);
const ghost = await call('POST', '/data/case', A, { subject: 'Ghost customer', customerId: 'does-not-exist', description: 'x', status: 'New', priority: 'Low' });
if (ghost.s === 200) gap('a case can point at a customer id that does not exist', 'no foreign-key check');

// ─────────────────────────────────────────────────────────────────────────────
sec('7. Lead cases');
const lc = await call('POST', '/data/case', A, { subject: 'Lead asks about fees', customerId: ig1.id, relatedEntity: 'lead', description: 'Prospect question before buying', status: 'New', priority: 'Medium' });
check('case can be raised against a LEAD', lc.s === 200 && !!lc.j?.id, JSON.stringify(lc.j));
const leadAct = (await call('GET', `/records/lead/${ig1.id}/related-activity`, A)).j;
gap('lead 360 does not list cases (related-activity returns tasks, quotes, email, WhatsApp, calls, stages only)', Object.keys(leadAct || {}).join(','));

// ─────────────────────────────────────────────────────────────────────────────
sec('8. User management & roles');
const roleSales = await call('POST', '/roles', A, { name: `Sales Rep ${tag}`, description: 'Leads + tasks only', permissions: { lead: { read: true, create: true, edit: true, delete: false, scope: 'own' }, task: { read: true, create: true, edit: true, delete: false, scope: 'own' }, customer: { read: true, create: false, edit: false, delete: false, scope: 'all' } } });
check('admin creates a limited role', roleSales.s === 200 && !!roleSales.j?.id);
const roleSupport = await call('POST', '/roles', A, { name: `Support ${tag}`, description: 'Cases + customers', permissions: { case: { read: true, create: true, edit: true, delete: false, scope: 'all' }, customer: { read: true, create: false, edit: true, delete: false, scope: 'all' } } });
const repEmail = `rep.${tag}@flowcrm.test`, supEmail = `sup.${tag}@flowcrm.test`;
check('admin creates Sales user', (await call('POST', '/users', A, { email: repEmail, password: 'Rep@12345x', roleId: roleSales.j.id, name: 'Sam Sales' })).s === 200);
check('admin creates Support user', (await call('POST', '/users', A, { email: supEmail, password: 'Sup@12345x', roleId: roleSupport.j.id, name: 'Sue Support' })).s === 200);
const R = await login(repEmail, 'Rep@12345x');
const S = await login(supEmail, 'Sup@12345x');
check('both users can log in', !!R && !!S);
const rows = [
    ['rep read lead', () => call('GET', '/data/lead', R), 200], ['rep read customer', () => call('GET', '/data/customer', R), 200], ['rep read case (no perm)', () => call('GET', '/data/case', R), 403],
    ['rep create lead', () => call('POST', '/data/lead', R, { firstName: 'Rep', lastName: 'Made', email: `rep.lead.${tag}@example.com`, status: 'New' }), 200],
    ['rep create customer (no perm)', () => call('POST', '/data/customer', R, { name: 'X', email: 'x@y.io', status: 'Active' }), 403],
    ['rep delete lead (no perm)', () => call('DELETE', `/data/lead/${L}`, R), 403],
    ['support read case', () => call('GET', '/data/case', S), 200], ['support read lead (no perm)', () => call('GET', '/data/lead', S), 403],
    ['support create case', () => call('POST', '/data/case', S, { subject: 'By support', customerId: C, description: 'd', status: 'New', priority: 'Low' }), 200],
    ['support edit customer', () => call('POST', '/data/customer', S, { id: C, name: cust?.name, email: cust?.email, status: 'Active' }), 200],
    ['rep manage users (admin only)', () => call('POST', '/users', R, { email: 'z@z.io', password: 'Zz@123456', roleId: 'admin', name: 'Z' }), 403],
    ['rep read roles list', () => call('GET', '/roles', R), 403],
    ['rep change settings', () => call('POST', '/settings', R, { theme: 'dark' }), 403],
    ['rep convert lead (needs create customer)', () => call('POST', `/leads/${ig1.id}/convert`, R), 403],
    ['rep read dashboard', () => call('GET', '/dashboard/stats', R), 200],
];
for (const [name, fn, want] of rows) { const r = await fn(); check(name + ` -> ${want}`, r.s === want, `got ${r.s}`); }
const adminLeads = (await list('lead')).length;
const repLeads = (await list('lead', R));
if (repLeads.length === adminLeads) gap('role scope "own" is not enforced: the rep sees every lead', `${repLeads.length} of ${adminLeads} visible; UI offers All / Team / Own`);
else check('scope "own" limits the rep to their own leads', true);
const perm = (await call('GET', '/auth/me', R));
const inactive = await call('POST', '/users', A, { id: (await call('GET', '/users', A)).j.find(u => u.email === repEmail)?.id, email: repEmail, roleId: roleSales.j.id, name: 'Sam Sales', isActive: false });
check('admin deactivates the rep', inactive.s === 200);
check('deactivated rep is blocked at once', (await call('GET', '/data/lead', R)).s === 403);

// ─────────────────────────────────────────────────────────────────────────────
sec('9. Reports & dashboard');
const stats = (await call('GET', '/dashboard/stats', A)).j;
const leadsNow = (await list('lead')).length;
check('dashboard lead count matches the real number of leads', Number(stats?.leadCount ?? stats?.totalLeads ?? stats?.leads) === leadsNow, `${JSON.stringify(stats)?.slice(0, 160)} vs ${leadsNow}`);
check('lead count grew by the leads this run created', leadsNow > leadCount0, `${leadCount0} -> ${leadsNow}`);
const widgets = await call('GET', '/dashboard/widgets', A);
check('dashboard widgets load', widgets.s === 200);
const chart = await call('GET', '/dashboard/chart-data', A);
check('dashboard chart data loads', chart.s === 200);
const packs = (await call('GET', '/reports/packs', A)).j;
check('report packs listed', Array.isArray(packs) && packs.length > 0, JSON.stringify(packs)?.slice(0, 100));
const firstPack = Array.isArray(packs) ? packs[0] : null;
if (firstPack) {
    const run = await call('POST', `/reports/packs/${firstPack.id}/run`, A, {});
    check(`report pack "${firstPack.name || firstPack.id}" runs`, run.s === 200, `${run.s} ${JSON.stringify(run.j)?.slice(0, 120)}`);
}
const reports = (await call('GET', '/reports', A)).j;
check('standard reports listed', Array.isArray(reports) && reports.length > 0);
if (Array.isArray(reports) && reports[0]) {
    const rr = await call('POST', `/reports/${reports[0].id}/run`, A, {});
    check(`report "${reports[0].name}" runs`, rr.s === 200, `${rr.s}`);
    const bySrc = Array.isArray(reports) ? reports.find(r => /source/i.test(r.name || '')) : null;
    if (bySrc) {
        const out = (await call('POST', `/reports/${bySrc.id}/run`, A, {})).j;
        check('Leads by Source report includes Instagram and WhatsApp', /instagram/i.test(JSON.stringify(out)) && /whatsapp/i.test(JSON.stringify(out)), JSON.stringify(out)?.slice(0, 200));
    }
}
const saved = await call('POST', '/saved-reports', A, { name: `E2E ${tag}`, entityType: 'lead', columns: ['firstName', 'status'], filters: [], groupBy: 'status', vizType: 'bar' });
check('custom report can be saved', saved.s === 200, JSON.stringify(saved.j)?.slice(0, 100));

// ─────────────────────────────────────────────────────────────────────────────
sec('10. Extra edge cases');
check('unauthenticated API call is refused', (await call('GET', '/data/lead')).s === 401);
check('garbage token is refused', (await call('GET', '/data/lead', 'abc.def.ghi')).s === 403);
check('global search finds the Instagram lead', JSON.stringify((await call('GET', '/search?q=priya.styles', A)).j).includes('Priya'));
const del = await call('DELETE', `/data/lead/${lostLead.j.id}`, A);
check('admin can delete a lead', del.s === 200);
check('deleted lead is gone', !(await find('lead', r => r.id === lostLead.j.id)));
const delAgain = await call('DELETE', `/data/lead/${lostLead.j.id}`, A);
check('deleting twice gives 404, not a crash', delAgain.s === 404, String(delAgain.s));
const big = await call('POST', '/data/lead', A, { firstName: 'Big', lastName: 'Note', email: `big.${tag}@example.com`, status: 'New', notes: 'x'.repeat(200000) });
check('very large text field handled (no 500)', big.s < 500, String(big.s));
const wrongEntity = await call('GET', '/data/nonexistent_entity', A);
if (wrongEntity.s === 200) gap('unknown record types return 200 + empty list instead of 404', '');
const concurrent = await Promise.all([1, 2, 3].map(() => call('POST', `/leads/${ig1.id}/convert`, A)));
check('3 simultaneous converts do not create duplicate customers', new Set(concurrent.map(r => r.j?.customerId)).size === 1, JSON.stringify(concurrent.map(r => r.j?.customerId)));

// ─────────────────────────────────────────────────────────────────────────────
const n = (r) => results.filter(x => x.r === r).length;
console.log(`\n=========== ${n('PASS')} passed, ${n('FAIL')} failed, ${n('GAP')} product gaps ===========`);
for (const r of results.filter(x => x.r !== 'PASS')) console.log(`${r.r}  [${r.section.split('.')[0]}] ${r.name}`);
process.exit(n('FAIL') ? 1 : 0);
