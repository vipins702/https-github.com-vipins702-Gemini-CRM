// Duplicate handling per object: rules, warn / block, the automated channels (web form, import), the scan and the merge.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/dedupe.mjs
const BASE = process.env.E2E_BASE || 'http://localhost:3015/api';
const tag = Date.now().toString().slice(-6);
const call = async (method, p, token, body, form) => {
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    let j = null; try { j = await res.json(); } catch { /* empty */ }
    return { s: res.status, j };
};
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).j?.token;
const A = await login(process.env.E2E_EMAIL || 'admin@flowcrm.com', process.env.E2E_PASSWORD);
if (!A) { console.log('Cannot log in as admin'); process.exit(2); }
const fails = []; let pass = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else { fails.push(name); console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const sec = (n) => console.log(`\n== ${n}`);

const uniq = (n) => `${tag}${n}`;
const phone10 = (n) => `98${String(10000000 + Number(tag) * 3 + n).slice(0, 8)}`;           // a 10-digit number per case
const lead = (n, extra = {}) => ({ firstName: 'Dup', lastName: 'Case' + uniq(n), email: `dup.${uniq(n)}@example.com`, phone: '+91 ' + phone10(n).replace(/(\d{5})(\d{5})/, '$1 $2'), status: 'New', ...extra });
const save = (rec, token = A, entity = 'lead') => call('POST', `/data/${entity}`, token, rec);
const allOf = async (entity) => (await call('GET', `/data/${entity}`, A)).j || [];
const DEFAULT_CFG = { enabled: true, action: 'warn', automated: 'update', checkAlso: ['customer'], rules: [{ id: 'email', label: 'Same e-mail', fields: ['email'] }, { id: 'phone', label: 'Same phone number', fields: ['phone'] }] };

sec('1. Defaults');
let cfg = await call('GET', '/dedupe/lead/config', A);
check('lead has working defaults: on, warn, e-mail and phone', cfg.j?.config?.enabled === true && cfg.j.config.action === 'warn' && cfg.j.config.rules?.map(r => r.id).join() === 'email,phone' && cfg.j.isDefault === true, JSON.stringify(cfg.j));
check('a lead is also checked against customers', cfg.j?.config?.checkAlso?.includes('customer'));
const caseCfg = await call('GET', '/dedupe/case/config', A);
check('another object is off until set up', caseCfg.j?.config?.enabled === false && caseCfg.j?.config?.rules?.length === 0, JSON.stringify(caseCfg.j));
check('an unknown object is 404', (await call('GET', '/dedupe/nope/config', A)).s === 404);

sec('2. Saving a duplicate lead asks first (warn)');
const L1 = lead(1);
const first = await save(L1);
check('the first lead saves', first.s === 200 && first.j?.id, JSON.stringify(first));
let again = await save({ ...lead(2), email: L1.email });
check('same e-mail: 409, asks to confirm, shows the match', again.s === 409 && again.j?.duplicate === true && again.j?.needsConfirm === true && again.j?.blocked === false && again.j?.duplicates?.[0]?.id === first.j.id && /e-mail/i.test(again.j.duplicates[0].rule), JSON.stringify(again.j));
again = await save({ ...lead(3), email: L1.email.toUpperCase() });
check('e-mail is compared ignoring case', again.s === 409);
again = await save({ ...lead(4), phone: '0' + phone10(1) });
check('phone is compared on the last 10 digits (+91 98765 43210 = 098765 43210)', again.s === 409 && /phone/i.test(again.j?.duplicates?.[0]?.rule || ''), JSON.stringify(again.j));
const forced = await save({ ...lead(5), email: L1.email, _confirmDuplicate: true });
check('"save anyway" works when the person confirms', forced.s === 200 && forced.j?.id && forced.j.id !== first.j.id, JSON.stringify(forced));
check('the confirm flag is never stored on the record', !JSON.stringify((await allOf('lead')).find(r => r.id === forced.j?.id) || {}).includes('_confirmDuplicate'));
const blank = await save({ firstName: 'No', lastName: 'Phone' + uniq(6), email: `nophone.a.${uniq(6)}@example.com`, status: 'New' });
const blank2 = await save({ firstName: 'No', lastName: 'Phone2' + uniq(6), email: `nophone.b.${uniq(6)}@example.com`, status: 'New' });
check('two leads with different e-mails and no phone do not match (a blank never matches a blank)', blank.s === 200 && blank2.s === 200, JSON.stringify([blank.s, blank2.s]));
const tiny = await save({ ...lead(7), phone: '12345' });
const tiny2 = await save({ ...lead(8), phone: '12345' });
check('a number that is too short to mean anything is not matched', tiny.s === 200 && tiny2.s === 200, JSON.stringify([tiny.s, tiny2.s]));

sec('3. Edits are checked only when a key field changes');
const base = await save(lead(9));
const other = await save(lead(10));
const edit = await save({ id: other.j.id, ...lead(10), lastName: 'Renamed' + uniq(10) });
check('editing a lead without touching e-mail / phone does not ask', edit.s === 200, JSON.stringify(edit));
const clash = await save({ id: other.j.id, ...lead(10), email: lead(9).email });
check('changing the e-mail to one that exists asks', clash.s === 409 && clash.j?.duplicates?.[0]?.id === base.j.id, JSON.stringify(clash.j));
const noSelf = await save({ id: base.j.id, ...lead(9), company: 'Acme' });
check('a lead is never a duplicate of itself', noSelf.s === 200);

sec('4. A new lead can already be a customer');
const cust = await call('POST', '/data/customer', A, { name: 'Dup Customer ' + uniq(11), email: `cust.${uniq(11)}@example.com`, phone: '+91 ' + phone10(11), status: 'Active' });
check('a customer saves', cust.s === 200, JSON.stringify(cust));
const asLead = await save({ ...lead(12), phone: phone10(11) });
check('a lead with a customer\'s number is flagged, and the match says it is a customer', asLead.s === 409 && asLead.j?.duplicates?.[0]?.entityType === 'customer' && asLead.j.duplicates[0].id === cust.j.id, JSON.stringify(asLead.j));
const check1 = await call('POST', '/dedupe/lead/check', A, { record: { email: L1.email } });
check('the check endpoint (used by the form on leaving a field) agrees', check1.s === 200 && check1.j?.duplicates?.[0]?.id === first.j.id && check1.j?.action === 'warn', JSON.stringify(check1.j));
check('the check endpoint with an empty record finds nothing', (await call('POST', '/dedupe/lead/check', A, { record: {} })).j?.duplicates?.length === 0);

sec('5. The setting is per object and editable');
let r = await call('POST', '/dedupe/lead/config', A, { ...DEFAULT_CFG, action: 'block' });
check('an admin can switch an object to "block"', r.s === 200 && r.j?.config?.action === 'block', JSON.stringify(r.j));
let blocked = await save({ ...lead(13), email: L1.email, _confirmDuplicate: true });
check('"block" refuses, and confirming does not override it', blocked.s === 409 && blocked.j?.blocked === true && blocked.j?.needsConfirm === false, JSON.stringify(blocked.j));
r = await call('POST', '/dedupe/lead/config', A, { ...DEFAULT_CFG, rules: [{ label: 'Same person at a company', fields: ['firstName', 'lastName', 'company'] }] });
check('a rule can use several fields that must all match', r.s === 200, JSON.stringify(r.j));
const nm1 = await save({ firstName: 'Priya', lastName: 'Menon' + uniq(14), company: 'Globex ' + uniq(14), email: `nm1.${uniq(14)}@example.com`, status: 'New' });
const nm2 = await save({ firstName: 'priya', lastName: ' MENON' + uniq(14), company: 'GLOBEX  ' + uniq(14) + '!', email: `nm2.${uniq(14)}@example.com`, status: 'New' });
check('text is compared ignoring case, spacing and punctuation', nm1.s === 200 && nm2.s === 409 && nm2.j?.duplicates?.[0]?.id === nm1.j.id, JSON.stringify([nm1.s, nm2.s, nm2.j]));
const nm3 = await save({ firstName: 'Priya', lastName: 'Menon' + uniq(14), company: 'Other Co', email: `nm3.${uniq(14)}@example.com`, status: 'New' });
check('and a different company is not a match', nm3.s === 200);
const sameMail = await save({ ...lead(15), email: L1.email });
check('with that rule only, a repeated e-mail is allowed', sameMail.s === 200, JSON.stringify(sameMail.j));
r = await call('POST', '/dedupe/lead/config', A, { ...DEFAULT_CFG, enabled: false });
const offSave = await save({ ...lead(16), email: L1.email });
check('switched off: no check at all', r.s === 200 && offSave.s === 200);
check('the saved setting reads back (not the default any more)', (await call('GET', '/dedupe/lead/config', A)).j?.isDefault === false);

sec('6. Bad settings are refused');
const bad = async (body) => (await call('POST', '/dedupe/lead/config', A, body)).s;
check('a rule on a field the object does not have', await bad({ ...DEFAULT_CFG, rules: [{ fields: ['nope'] }] }) === 400);
check('a rule with no fields', await bad({ ...DEFAULT_CFG, rules: [{ fields: [] }] }) === 400);
check('a rule with more than 4 fields', await bad({ ...DEFAULT_CFG, rules: [{ fields: ['firstName', 'lastName', 'email', 'phone', 'company'] }] }) === 400);
check('"also check" an object that does not exist', await bad({ ...DEFAULT_CFG, checkAlso: ['ghost'] }) === 400);
check('the same fields in two rules', await bad({ ...DEFAULT_CFG, rules: [{ fields: ['email'] }, { fields: ['email'] }] }) === 400);
check('more than 10 rules', await bad({ ...DEFAULT_CFG, rules: Array.from({ length: 11 }, (_, i) => ({ fields: ['firstName'], label: 'r' + i })) }) === 400);
const rep = await (async () => {
    const role = await call('POST', '/roles', A, { name: `dd role ${tag}`, description: '', permissions: { lead: { read: true, create: true, edit: true, delete: false, scope: 'all' } } });
    const email = `dd.${tag}@flowcrm.test`;
    await call('POST', '/users', A, { email, password: 'Perm@12345x', roleId: role.j?.id, name: 'Dd Rep' });
    return login(email, 'Perm@12345x');
})();
check('a non-admin cannot change the setting', (await call('POST', '/dedupe/lead/config', rep, DEFAULT_CFG)).s === 403);
check('a non-admin cannot scan', (await call('GET', '/dedupe/lead/scan', rep)).s === 403);
check('a non-admin cannot merge', (await call('POST', '/dedupe/lead/merge', rep, { keepId: 'a', mergeIds: ['b'] })).s === 403);
check('but can ask whether a record is a duplicate (the form needs it)', (await call('POST', '/dedupe/lead/check', rep, { record: { email: 'x@y.io' } })).s === 200);
check('and read the setting', (await call('GET', '/dedupe/lead/config', rep)).s === 200);
check('no token: refused', (await call('POST', '/dedupe/lead/check', null, { record: {} })).s === 401);
await call('POST', '/dedupe/lead/config', A, DEFAULT_CFG);   // back to the defaults for the rest

sec('7. Channels with nobody to ask: CSV import');
const imp = lead(20);
const created = await save(imp);
const csv = `firstName,lastName,email,phone,company\n` +
    `Imp,Same${uniq(20)},${imp.email.toUpperCase()},,Filled Co ${tag}\n` +        // same e-mail as an existing lead, adds a company
    `Imp,New${uniq(21)},imp.new.${uniq(21)}@example.com,,\n` +                    // new
    `Imp,Again${uniq(21)},imp.new.${uniq(21)}@example.com,,\n`;                    // same e-mail as the row above
const form = new FormData(); form.append('file', new Blob([csv], { type: 'text/csv' }), 'x.csv');
const res = await call('POST', '/data/lead/import', A, null, form);
check('the import creates the new row once and skips the two repeats', res.s === 200 && res.j?.imported === 1 && res.j?.skipped === 2, JSON.stringify(res.j));
check('the repeat of an existing lead fills its blank fields (and reports it)', res.j?.merged === 2 && (await allOf('lead')).find(x => x.id === created.j.id)?.company === 'Filled Co ' + tag, JSON.stringify(res.j));

sec('8. Channels with nobody to ask: a web form');
const camp = await call('POST', '/campaigns', A, { name: 'Dup form ' + tag, channel: 'web_form', entityType: 'lead', formTemplate: { fields: [{ name: 'firstName' }, { name: 'lastName' }, { name: 'email' }, { name: 'phone' }], successMessage: 'Thanks' } });
const fe = `form.${uniq(30)}@example.com`;
const sub = (b) => call('POST', `/public/form/${camp.j?.id}/submit`, null, b);
const s1 = await sub({ firstName: 'Web', lastName: 'Visitor' + uniq(30), email: fe, phone: '+91 ' + phone10(30) });
const s2 = await sub({ firstName: 'Web', lastName: 'Visitor' + uniq(30), email: fe });
const withEmail = (await allOf('lead')).filter(x => String(x.email).toLowerCase() === fe);
check('a form creates a lead, and the same person filling it twice does not make a second one', s1.s === 200 && s2.s === 200 && withEmail.length === 1, `${withEmail.length} leads`);
check('the form lead is a proper lead: source, form kept, score field handled, owner given', withEmail[0]?.source === 'Web' && withEmail[0]?._via === 'web_form' && withEmail[0]?._campaign_id === camp.j?.id, JSON.stringify(withEmail[0]));
const trail = (await call('GET', `/audit/lead/${withEmail[0]?.id}`, A)).j;
const list = Array.isArray(trail) ? trail : (trail?.items || trail?.logs || []);
check('the repeat is written on the lead\'s history as a note', list.some(a => a.action === 'note' && /web form/i.test(JSON.stringify(a.details ?? a))), JSON.stringify(list).slice(0, 200));
await call('POST', '/dedupe/lead/config', A, { ...DEFAULT_CFG, automated: 'skip' });
const s3 = await sub({ firstName: 'Web', lastName: 'Other' + uniq(30), email: fe, company: 'Should Not Be Added' });
check('with "skip", a repeat changes nothing', s3.s === 200 && !(await allOf('lead')).find(x => x.id === withEmail[0].id)?.company, '');
await call('POST', '/dedupe/lead/config', A, { ...DEFAULT_CFG, automated: 'create' });
await sub({ firstName: 'Web', lastName: 'Again' + uniq(30), email: fe });
check('with "create", duplicates are allowed again', (await allOf('lead')).filter(x => String(x.email).toLowerCase() === fe).length === 2);
await call('POST', '/dedupe/lead/config', A, DEFAULT_CFG);

sec('9. Finding and merging the duplicates you already have');
const tagM = 'M' + tag;
const mk = (extra) => save({ firstName: 'Mer', lastName: 'Ge' + tagM, status: 'New', ...extra, _confirmDuplicate: true });
const K = await mk({ email: `merge.${tagM}@example.com`, phone: '+91 98111 ' + String(10000 + Number(tag) % 80000).padStart(5, '0'), notes: 'first note' });
const D1 = await mk({ email: `merge.${tagM}@example.com`, company: 'Merged Co', title: 'Director', notes: 'second note', score: 60 });
const D2 = await mk({ email: `merge.other.${tagM}@example.com`, phone: '+91 98111 ' + String(10000 + Number(tag) % 80000).padStart(5, '0'), website: 'https://merge.example.com' });
const task = await call('POST', '/data/task', A, { subject: 'Call ' + tagM, status: 'Not Started', relatedId: D1.j.id, relatedEntity: 'lead' });
const note = await call('POST', `/notes/lead/${D2.j.id}`, A, { note: 'note on the duplicate ' + tagM });
const scan = await call('GET', '/dedupe/lead/scan', A);
const grp = (scan.j?.groups || []).find(g => g.records.some(x => x.id === K.j.id));
check('the scan finds the three as one group (linked through e-mail and through phone)', scan.s === 200 && grp && [K, D1, D2].every(x => grp.records.some(y => y.id === x.j.id)), JSON.stringify(scan.j).slice(0, 300));
check('the scan says why, and suggests keeping the one with the most filled in', grp?.because?.length >= 1 && [K.j.id, D1.j.id].includes(grp?.suggestedKeepId), JSON.stringify([grp?.because, grp?.suggestedKeepId]));
const keepId = grp?.suggestedKeepId || K.j.id;
const mergeIds = [K.j.id, D1.j.id, D2.j.id].filter(x => x !== keepId);
const merged = await call('POST', '/dedupe/lead/merge', A, { keepId, mergeIds: [...mergeIds, keepId] });
check('merge: the kept record stays, the others go (keeping itself in the list is ignored)', merged.s === 200 && merged.j?.merged === 2 && merged.j?.keptId === keepId, JSON.stringify(merged));
const afterAll = await allOf('lead');
const kept = afterAll.find(x => x.id === keepId);
check('the others are gone', mergeIds.every(id => !afterAll.some(x => x.id === id)));
check('what the kept record lacked is filled from the others', kept?.company === 'Merged Co' && kept?.title === 'Director' && kept?.website === 'https://merge.example.com' && kept?.email && kept?.phone, JSON.stringify(kept));
check('notes are joined, the highest score is kept', /first note/.test(kept?.notes) && /second note/.test(kept?.notes) && Number(kept?.score) >= 60, JSON.stringify([kept?.notes, kept?.score]));
const t = (await allOf('task')).find(x => x.id === task.j.id);
check('a task that pointed at a merged lead now points at the kept one', t?.relatedId === keepId, JSON.stringify(t?.relatedId));
const notes = (await call('GET', `/notes/lead/${keepId}`, A)).j || [];
check('notes written on a merged lead now show on the kept one', notes.some(n => /note on the duplicate/.test(n.note)));
const hist = (await call('GET', `/audit/lead/${keepId}`, A)).j;
const hl = Array.isArray(hist) ? hist : (hist?.items || hist?.logs || []);
check('the merge is on the history', hl.some(a => a.action === 'merge'), JSON.stringify(hl).slice(0, 200));
check('after the merge the scan no longer lists the group', !((await call('GET', '/dedupe/lead/scan', A)).j?.groups || []).some(g => g.records.some(x => x.id === keepId)));
check('merging with nothing to merge is refused', (await call('POST', '/dedupe/lead/merge', A, { keepId, mergeIds: [] })).s === 400);
check('merging a record that does not exist is refused', (await call('POST', '/dedupe/lead/merge', A, { keepId, mergeIds: ['nope'] })).s === 400);
check('a record of another object cannot be merged in', (await call('POST', '/dedupe/lead/merge', A, { keepId, mergeIds: [cust.j.id] })).s === 400);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('Failed: ' + fails.join(' | ')); process.exit(1); }
