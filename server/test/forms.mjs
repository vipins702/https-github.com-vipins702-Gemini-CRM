// The structured address type, phone numbers with a country code, and the upgrade of the built-in address fields.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/forms.mjs
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
const lead = (n, extra = {}) => ({ firstName: 'Form', lastName: 'Case' + tag + n, email: `form.${tag}.${n}@example.com`, status: 'New', ...extra });
const save = (rec) => call('POST', '/data/lead', A, rec);
const read = async (id) => ((await call('GET', '/data/lead', A)).j || []).find(x => x.id === id);

sec('1. The built-in address fields');
const schemas = (await call('GET', '/metadata/schemas', A)).j || {};
check('lead address is the structured type', schemas.lead?.fields?.find(f => f.name === 'address')?.type === 'address', JSON.stringify(schemas.lead?.fields?.find(f => f.name === 'address')));
check('customer address is the structured type', schemas.customer?.fields?.find(f => f.name === 'address')?.type === 'address');

sec('2. Saving an address');
const full = { line1: '12 MG Road', line2: 'Near the metro', city: 'Pune', state: 'Maharashtra', postalCode: '411001', country: 'India', countryCode: 'IN' };
const a1 = await save(lead(1, { address: full }));
check('a full address saves', a1.s === 200, JSON.stringify(a1.j));
check('and is stored as its parts', JSON.stringify((await read(a1.j?.id))?.address) === JSON.stringify(full), JSON.stringify((await read(a1.j?.id))?.address));
const a2 = await save(lead(2, { address: '221B Baker Street, London' }));
check('an address typed as one piece of text (older records, imports) still saves', a2.s === 200 && (await read(a2.j?.id))?.address === '221B Baker Street, London');
const a3 = await save(lead(3, { address: { line1: 'Only a street' } }));
check('a partial address saves', a3.s === 200);
const a4 = await save(lead(4, { address: { line1: 'x', planet: 'Mars' } }));
check('an unknown part is refused (nothing odd is stored)', a4.s === 400, JSON.stringify(a4));
const a5 = await save(lead(5, { address: 12345 }));
check('a number is not an address', a5.s === 400);
const a6 = await save(lead(6, { address: { city: 'x'.repeat(300) } }));
check('a part that is far too long is refused', a6.s === 400);
const a7 = await save(lead(7, { address: '' }));
check('an empty address is fine', a7.s === 200);

sec('3. A custom object can use the type; it cannot be unique');
const obj = 'site' + tag;
const def = (extra = {}) => ({ id: obj, label: 'Site', pluralLabel: 'Sites', fields: [{ name: 'name', label: 'Name', type: 'text', required: true, system: true }, { name: 'where', label: 'Where', type: 'address', ...extra }] });
check('an object with an address field saves', (await call('POST', '/metadata/schemas', A, { entityType: obj, config: def() })).s === 200);
check('an address field cannot be marked unique', (await call('POST', '/metadata/schemas', A, { entityType: obj, config: def({ unique: true }) })).s === 400);
const req = await call('POST', '/metadata/schemas', A, { entityType: obj, config: def({ required: true }) });
check('a required address can be set', req.s === 200);
const noAddr = await call('POST', `/data/${obj}`, A, { name: 'No address' });
check('a required address must have something in it', noAddr.s === 400, JSON.stringify(noAddr));
const emptyAddr = await call('POST', `/data/${obj}`, A, { name: 'Empty address', where: { line1: '  ' } });
check('an address of only blanks does not count', emptyAddr.s === 400);
const okAddr = await call('POST', `/data/${obj}`, A, { name: 'With address', where: { city: 'Pune' } });
check('and with one part filled in it saves', okAddr.s === 200, JSON.stringify(okAddr));

sec('4. Phone numbers');
const p1 = await save(lead(11, { phone: '+917004528659' }));
check('+<dial code><number> saves', p1.s === 200 && (await read(p1.j?.id))?.phone === '+917004528659');
check('a number written with spaces and dashes still saves', (await save(lead(12, { phone: '+91 70046-28659' }))).s === 200);
check('letters are not a phone number', (await save(lead(13, { phone: 'call me' }))).s === 400);
check('too short is refused', (await save(lead(14, { phone: '123' }))).s === 400);
check('too long is refused', (await save(lead(15, { phone: '+' + '9'.repeat(45) }))).s === 400);
const dup = await save(lead(16, { phone: '07004528659' }));
check('the same number written with a leading 0 is still recognised as a duplicate', dup.s === 409, JSON.stringify(dup.j));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('Failed: ' + fails.join(' | ')); process.exit(1); }
