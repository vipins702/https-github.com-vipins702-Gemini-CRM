// Object keys and joins (confirmation before changing an object that has records), date tokens, field-mapping checks.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/keys.mjs
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
const keysOf = async (id) => ((await call('GET', '/metadata/keys', A)).j || []).find(x => x.id === id) || {};
const schemas0 = (await call('GET', '/metadata/schemas', A)).j;
const restore = async (t) => call('POST', '/metadata/schemas', A, { entityType: t, config: schemas0[t] });
const mkProduct = (extra) => call('POST', '/data/product', A, { name: 'Key P ' + rnd(), sku: 'S-' + rnd(), status: 'Active', price: 10, ...extra });

sec('1. What the screen shows');
let lead = await keysOf('lead');
check('every object lists id as its primary key', lead.primaryKey === 'id');
check('joins are listed with their target', (lead.joins || []).some(j => j.field === 'customerId' && j.target === 'customer' && j.targetLabel === 'Customer'), JSON.stringify(lead.joins));
check('incoming joins are listed on the target', ((await keysOf('customer')).joinedFrom || []).some(j => j.entity === 'lead' && j.field === 'customerId'));
check('only sensible field types can be keys', (lead.eligible || []).every(f => ['text', 'email', 'phone', 'number', 'autonumber', 'url'].includes(f.type)) && lead.eligible.some(f => f.name === 'email'));

sec('2. Record key');
check('a key on an object with no records is set straight away', (await call('POST', '/metadata/keys/product', A, { keyField: 'sku' })).s === 200 || (await keysOf('product')).records > 0);
await restore('product');
const K = 'stockQuantity', dupVal = 7000 + Number(tag.slice(-3));   // an optional number field, so blanks can exist
await mkProduct({ [K]: dupVal });
await mkProduct({ [K]: dupVal });
await mkProduct({});
let r = await call('POST', '/metadata/keys/product', A, { keyField: K });
check('with records it asks first, with the numbers', r.s === 409 && r.j?.needsConfirm && r.j.stats?.duplicates >= 1 && r.j.stats?.blank >= 1 && /already has/.test(r.j.message), JSON.stringify(r.j));
check('nothing changed before confirming', !(await keysOf('product')).keyField);
r = await call('POST', '/metadata/keys/product', A, { keyField: K, confirm: true });
check('confirming sets the key', r.s === 200 && (await keysOf('product')).keyField === K);
const ks = (await keysOf('product')).keyStats;
check('the screen reports blanks and duplicates on existing records', ks?.duplicates >= 1 && ks?.blank >= 1, JSON.stringify(ks));
check('from now on a duplicate key value is refused', (await mkProduct({ [K]: dupVal })).s === 400);
check('a new value is accepted', (await mkProduct({ [K]: dupVal + 1 })).s < 300);
check('blank existing records keep the field optional (not forced on old data)', (await mkProduct({})).s < 300);
check('setting the same key again is refused', (await call('POST', '/metadata/keys/product', A, { keyField: K, confirm: true })).s === 400);
check('a text-area field cannot be a key', (await call('POST', '/metadata/keys/product', A, { keyField: 'description', confirm: true })).s === 400);
check('an unknown field is refused', (await call('POST', '/metadata/keys/product', A, { keyField: 'nope', confirm: true })).s === 400);
check('an unknown object is 404', (await call('POST', '/metadata/keys/nope', A, { keyField: 'sku' })).s === 404);
check('junk body is refused', (await call('POST', '/metadata/keys/product', A, { keyField: 5 })).s === 400);
r = await call('POST', '/metadata/keys/product', A, { keyField: null });
check('removing a key also asks first', r.s === 409);
check('and is applied on confirm', (await call('POST', '/metadata/keys/product', A, { keyField: null, confirm: true })).s === 200 && !(await keysOf('product')).keyField);

sec('3. Re-pointing a join');
const cust = (await call('POST', '/data/customer', A, { name: 'Join Co ' + tag, email: `jc.${rnd()}@example.com`, status: 'Active' })).j?.id;
const ids = [];
for (let i = 0; i < 2; i++) ids.push((await call('POST', '/data/lead', A, { firstName: 'Join', lastName: 'L' + rnd(), email: `jl.${rnd()}@example.com`, status: 'New', customerId: cust })).j?.id);
const before = (await keysOf('lead')).joins.find(j => j.field === 'customerId');
check('linked count includes the new links, none broken', before.linked >= 2 && before.broken === 0, JSON.stringify(before));
r = await call('POST', '/metadata/joins/lead/customerId', A, { target: 'product' });
check('with linked records it asks first and says how many', r.s === 409 && r.j?.needsConfirm && r.j.linked >= 2, JSON.stringify(r.j));
check('the join is unchanged before confirming', (await keysOf('lead')).joins.find(j => j.field === 'customerId').target === 'customer');
r = await call('POST', '/metadata/joins/lead/customerId', A, { target: 'product', confirm: true, existing: 'keep' });
const kept = (await keysOf('lead')).joins.find(j => j.field === 'customerId');
check('keep: the join points at the new object and the old links show as broken', r.s === 200 && kept.target === 'product' && kept.broken >= 2, JSON.stringify(kept));
r = await call('POST', '/metadata/joins/lead/customerId', A, { target: 'case', confirm: true, existing: 'clear' });
const cleared = (await keysOf('lead')).joins.find(j => j.field === 'customerId');
check('clear: the old links are removed', r.s === 200 && r.j.cleared >= 2 && cleared.linked === 0 && cleared.target === 'case', JSON.stringify([r.j, cleared]));
check('the cleared records no longer hold the old id', !((await call('GET', '/data/lead', A)).j || []).find(x => x.id === ids[0])?.customerId);
check('same target again is refused', (await call('POST', '/metadata/joins/lead/customerId', A, { target: 'case' })).s === 400);
check('an unknown target is refused', (await call('POST', '/metadata/joins/lead/customerId', A, { target: 'nope' })).s === 400);
check('a field that is not a join is 404', (await call('POST', '/metadata/joins/lead/email', A, { target: 'case' })).s === 404);
check('a bad "existing" choice is refused', (await call('POST', '/metadata/joins/lead/customerId', A, { target: 'customer', confirm: true, existing: 'burn' })).s === 400);
await restore('lead');

sec('4. Only admins');
const roleId = (await call('POST', '/roles', A, { name: 'Keys RM ' + tag, description: 'x', permissions: { lead: { read: true, create: true, edit: true } } })).j?.id;
await call('POST', '/users', A, { email: `keys.rm.${tag}@flowcrm.test`, password: 'Keys@12345xx', roleId, name: 'Keys RM' });
const RM = await login(`keys.rm.${tag}@flowcrm.test`, 'Keys@12345xx');
check('a non-admin cannot see keys', (await call('GET', '/metadata/keys', RM)).s === 403);
check('a non-admin cannot change a key', (await call('POST', '/metadata/keys/lead', RM, { keyField: 'email', confirm: true })).s === 403);
check('a non-admin cannot re-point a join', (await call('POST', '/metadata/joins/lead/customerId', RM, { target: 'case', confirm: true })).s === 403);

sec('5. Date tokens and field-mapping checks');
const leadDef = schemas0.lead;
await call('POST', '/metadata/schemas', A, { entityType: 'lead', config: { ...leadDef, fields: [...leadDef.fields.filter(f => !f.name.startsWith('kt_')), { name: 'kt_follow', label: 'Follow up on', type: 'date' }, { name: 'kt_src', label: 'Src copy', type: 'text' }] } });
const rule = await call('POST', '/field-rules/lead', A, { name: 'Dates ' + tag, conditions: { type: 'group', op: 'and', children: [{ type: 'rule', field: 'company', operator: '==', value: 'TokCo' + tag }] }, actions: [{ field: 'kt_follow', value: '{today+3}' }, { field: 'kt_src', value: 'From {source} on {today}' }] });
check('a trigger with date tokens saves', rule.s < 300, JSON.stringify(rule.j));
const lid = (await call('POST', '/data/lead', A, { firstName: 'Tok', lastName: 'En', email: `tk.${rnd()}@example.com`, status: 'New', company: 'TokCo' + tag, source: 'Web' })).j?.id;
const got = ((await call('GET', '/data/lead', A)).j || []).find(x => x.id === lid) || {};
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
check('{today+3} becomes the date three days from now', got.kt_follow === day(3), JSON.stringify(got.kt_follow));
check('{today} and {field} fill in inside text', got.kt_src === `From Web on ${day(0)}`, JSON.stringify(got.kt_src));
if (rule.j?.id) await call('DELETE', `/field-rules/lead/${rule.j.id}`, A);
const jr = (fields, type = 'update_record', extra = {}) => call('POST', '/journeys', A, { name: 'Map ' + tag + rnd(), nodes: [{ id: 't', type: 'trigger', data: { type: 'trigger', label: 's', config: { entityType: 'lead', triggerType: 'create', conditions: { type: 'group', op: 'and', children: [{ type: 'rule', field: 'company', operator: '==', value: 'never' + tag }] } } } }, { id: 'a', type: 'action', data: { type: 'action', label: 'Map', config: { type, fields, ...extra } } }], edges: [{ id: 'e', source: 't', target: 'a' }] });
const okMap = await jr({ status: 'Contacted', kt_src: '{company}', kt_follow: '{today+7}' });
check('a valid mapping saves', okMap.s < 300, JSON.stringify(okMap.j));
check('mapping to a field that does not exist is refused', (await jr({ nope_field: 'x' })).s === 400);
check('copying from a field that does not exist is refused', (await jr({ kt_src: '{ghost}' })).s === 400);
check('an empty target field is refused', (await jr({ '': 'x' })).s === 400);
check('create-record mapping is checked against the new record type', (await jr({ subject: 'Call {firstName}' }, 'create_record', { entityType: 'task' })).s < 300 && (await jr({ firstName: 'x' }, 'create_record', { entityType: 'task' })).s === 400);
for (const j of (await call('GET', '/journeys', A)).j || []) if (j.name.startsWith('Map ' + tag)) await call('DELETE', `/journeys/${j.id}`, A);

await restore('lead'); await restore('product');
console.log(`\n=========== ${pass} passed, ${fails.length} failed ===========`);
process.exit(fails.length ? 1 : 0);
