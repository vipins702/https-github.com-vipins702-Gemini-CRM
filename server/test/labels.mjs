// Lookup fields save a CODE (10001) and show a LABEL (Credit Card). Codes stay what is stored; labels travel beside them.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/labels.mjs
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
const getLead = async (id) => ((await call('GET', '/data/lead', A)).j || []).find(x => x.id === id) || {};
const mkLead = async (extra) => (await call('POST', '/data/lead', A, { firstName: 'Lbl', lastName: 'T' + rnd(), email: `lb.${rnd()}@example.com`, status: 'New', ...extra })).j?.id;

const lead0 = (await call('GET', '/metadata/schemas', A)).j.lead;
await call('POST', '/metadata/schemas', A, { entityType: 'lead', config: { ...lead0, fields: [...lead0.fields.filter(f => !f.name.startsWith('lb_')), { name: 'lb_method', label: 'Payment method', type: 'lookup' }, { name: 'lb_copy', label: 'Copy', type: 'text' }] } });
await call('POST', '/lookups/lead_lb_method', A, { valueId: '10001', value: 'Credit Card' });
await call('POST', '/lookups/lead_lb_method', A, { valueId: '10002', value: 'UPI' });

sec('1. The code is saved, the label travels beside it');
const l1 = await mkLead({ lb_method: '10001' });
let g = await getLead(l1);
check('the record stores the code, not the words', g.lb_method === '10001', JSON.stringify(g.lb_method));
check('the list also carries the label', g._labels?.lb_method === 'Credit Card', JSON.stringify(g._labels));
check('a record with no value has no label entry', !('lb_method' in ((await getLead(await mkLead({})))._labels || {})));
check('a code that is in no list gets no label (nothing invented)', !(await getLead(await mkLead({ lb_method: '99999' })))._labels?.lb_method);
await call('POST', '/lookups/lead_lb_method', A, { valueId: '10001', value: 'Card payment' });
g = await getLead(l1);
check('renaming a label changes it everywhere at once', g._labels?.lb_method === 'Card payment' && g.lb_method === '10001', JSON.stringify([g._labels, g.lb_method]));
const back = await call('POST', '/data/lead', A, { ...g, id: l1, firstName: 'Edited' });
g = await getLead(l1);
check('editing a record sends _labels back without storing them', back.s < 300 && g.lb_method === '10001' && g.firstName === 'Edited');
check('labels are never stored in the record data (a fresh read still derives them)', g._labels?.lb_method === 'Card payment');

sec('2. A link to another record shows that record\'s name');
const cust = (await call('POST', '/data/customer', A, { name: 'Acme Traders ' + tag, email: `acme.${rnd()}@example.com`, status: 'Active' })).j?.id;
const l2 = await mkLead({ customerId: cust });
g = await getLead(l2);
check('the stored value is the record id', g.customerId === cust);
check('the label is the customer name', g._labels?.customerId === 'Acme Traders ' + tag, JSON.stringify(g._labels));

sec('3. Choices for the screens that build conditions and mappings');
const opts = (await call('GET', '/metadata/lookup-options/lead', A)).j || {};
check('options give the saved code and the label', (opts.lb_method || []).some(o => o.value === '10001' && o.label === 'Card payment') && (opts.lb_method || []).some(o => o.value === '10002' && o.label === 'UPI'), JSON.stringify(opts.lb_method));
check('unknown record type is 404', (await call('GET', '/metadata/lookup-options/nope', A)).s === 404);
check('needs sign-in', (await call('GET', '/metadata/lookup-options/lead', null)).s === 401);

sec('4. Reports show labels');
const sr = (await call('POST', '/saved-reports/run', A, { entityType: 'lead', columns: [{ field: 'lb_method' }], filters: [{ field: 'lb_method', op: 'eq', value: '10001' }] })).j;
check('a saved report column shows the label (and still filters on the code)', (sr?.rows || []).length >= 1 && sr.rows.every(r => r.lb_method === 'Card payment'), JSON.stringify(sr?.rows?.slice(0, 2)));
const grp = (await call('POST', '/saved-reports/run', A, { entityType: 'lead', groupBy: ['lb_method'], columns: [] })).j;
check('grouping by a lookup shows labels', (grp?.rows || []).some(r => r.lb_method === 'Card payment'), JSON.stringify(grp?.rows));

sec('5. Import accepts labels and codes');
const csv = ['firstName,lastName,email,lb_method',
    `Imp,One,imp1.${tag}@example.com,UPI`,
    `Imp,Two,imp2.${tag}@example.com,10001`,
    `Imp,Three,imp3.${tag}@example.com,card payment`,
    `Imp,Four,imp4.${tag}@example.com,Cash`].join('\n') + '\n';
const fd = new FormData();
fd.append('file', new Blob([csv], { type: 'text/csv' }), 'x.csv');
const imp = await (await fetch(BASE + '/data/lead/import', { method: 'POST', headers: { Authorization: 'Bearer ' + A }, body: fd })).json().catch(() => ({}));
check('import: all four rows come in', imp.imported === 4, JSON.stringify(imp));
const byEmail = async (n) => ((await call('GET', '/data/lead', A)).j || []).find(x => x.email === `imp${n}.${tag}@example.com`) || {};
check('a label in the file is saved as its code (UPI → 10002)', (await byEmail(1)).lb_method === '10002');
check('a code in the file stays a code', (await byEmail(2)).lb_method === '10001');
check('a label in another letter case still maps', (await byEmail(3)).lb_method === '10001');
check('an unknown value is kept as typed (nothing silently dropped)', (await byEmail(4)).lb_method === 'Cash');

sec('6. Messages say Credit Card; field mapping copies the code');
const me = ((await call('GET', '/users', A)).j || []).find(u => u.email === (process.env.E2E_EMAIL || 'admin@flowcrm.com'));
const G = (op, ...children) => ({ type: 'group', op, children });
const R1 = (field, operator, value) => ({ type: 'rule', field, operator, value });
const jr = await call('POST', '/journeys', A, {
    name: 'Labels ' + tag,
    nodes: [
        { id: 't', type: 'trigger', data: { type: 'trigger', label: 'Start', config: { entityType: 'lead', triggerType: 'create', conditions: G('and', R1('company', '==', 'LblCo' + tag)) } } },
        { id: 'a', type: 'action', data: { type: 'action', label: 'Copy', config: { type: 'update_record', fields: { lb_copy: '{lb_method}' } } } },
        { id: 'n', type: 'action', data: { type: 'action', label: 'Tell', config: { type: 'notify', userId: me.id, title: 'Payment', message: 'Paid by {lb_method}' } } },
    ],
    edges: [{ id: 'e1', source: 't', target: 'a' }, { id: 'e2', source: 'a', target: 'n' }],
});
check('journey with a lookup token saves', jr.s < 300, JSON.stringify(jr.j));
const l3 = await mkLead({ company: 'LblCo' + tag, lb_method: '10002' });
check('mapping a lookup into another field copies the code', (await getLead(l3)).lb_copy === '10002');
const notes = (await call('GET', '/notifications', A)).j || [];
check('the notification text uses the label, not the code', notes.some(n => n.title === 'Payment' && n.body === 'Paid by UPI'), JSON.stringify(notes.filter(n => n.title === 'Payment').map(n => n.body)));
const dry = (await call('POST', `/journeys/${jr.j?.id}/test`, A, { recordId: l3 })).j;
check('test run describes steps with labels', (dry?.steps || []).some(s => /Paid by UPI/.test(s.note || '')), JSON.stringify(dry?.steps?.map(s => s.note)));
if (jr.j?.id) await call('DELETE', `/journeys/${jr.j.id}`, A);

await call('POST', '/metadata/schemas', A, { entityType: 'lead', config: lead0 });
console.log(`\n=========== ${pass} passed, ${fails.length} failed ===========`);
process.exit(fails.length ? 1 : 0);
