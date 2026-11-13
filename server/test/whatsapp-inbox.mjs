// WhatsApp Inbox: a message from a number nobody has saved becomes a proper lead with a proper name,
// the inbox shows real names / "needs reply", and a chat can create a lead, a note and a task.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/whatsapp-inbox.mjs
// Run it BEFORE whatsapp-webhook.mjs (that suite saves a fake WhatsApp token, which makes replies try the real network).
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

// Twelve-digit Indian numbers that belong to this run only, and how the CRM writes them.
const num = (n) => `91${String(7000000000 + Number(tag) * 10 + n).slice(0, 10)}`;
const fmt = (d) => `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
const incoming = (phone, profileName, body) => call('POST', '/whatsapp/simulate-incoming', A, { from: '+' + phone, profileName, body });
const convs = async () => (await call('GET', '/whatsapp/conversations', A)).j || [];
const conv = async (phone) => (await convs()).find(c => c.phone === phone);
const pick = async (entity, id) => ((await call('GET', `/data/${entity}`, A)).j || []).find(x => x.id === id);
const lead = (id) => pick('lead', id);

sec('1. The reported chat: profile name is "~", the message says who they are');
const P1 = num(1);
let r = await incoming(P1, '~', 'Hi My name is Chad n looking for Product credit card i am from. Usa new jersey');
check('the message is accepted and a new lead is made', r.s === 200 && r.j?.isNewLead === true && r.j?.matchedEntity === 'lead', JSON.stringify(r.j));
let l = await lead(r.j?.matchedId);
check('the lead is named from the message ("Chad"), not "~"', l?.firstName === 'Chad' && !/~/.test(l?.name || ''), JSON.stringify([l?.firstName, l?.lastName, l?.name]));
check('a one-word name gets the number as last name, so two Chads stay apart', l?.lastName === fmt(P1), l?.lastName);
check('the lead says where it came from and keeps the first message', l?.source === 'WhatsApp' && /credit card/.test(l?.notes || '') && l?._via === 'whatsapp', JSON.stringify([l?.source, l?.notes]));
check('the phone is saved readably', l?.phone === fmt(P1), l?.phone);
let c = await conv(P1);
check('the inbox shows the name, the formatted number and the lead type', c?.display_name === 'Chad' && c?.phone_display === fmt(P1) && c?.matched_entity === 'lead' && c?.record_status === 'New', JSON.stringify(c));
check('the chat needs a reply', c?.needs_reply === true && c?.unreplied === 1, JSON.stringify([c?.needs_reply, c?.unreplied]));

sec('2. Other names');
const P2 = num(2);
r = await incoming(P2, '~', 'hello');
l = await lead(r.j?.matchedId);
check('no usable name anywhere: "WhatsApp +91 ..." (never "~", never blank)', l?.name === `WhatsApp ${fmt(P2)}` && l?._name_source === 'phone', JSON.stringify([l?.name, l?._name_source]));
const P3 = num(3);
r = await incoming(P3, 'Priya Sharma', 'is the premium plan available?');
l = await lead(r.j?.matchedId);
check('a real profile name is used and split into first and last', l?.firstName === 'Priya' && l?.lastName === 'Sharma', JSON.stringify([l?.firstName, l?.lastName]));
const P4 = num(4);
r = await incoming(P4, '🔥', 'my name is rahul verma from delhi, need a loan');
l = await lead(r.j?.matchedId);
check('an emoji-only profile name is ignored; the name in the message is used', l?.firstName === 'Rahul' && l?.lastName === 'Verma', JSON.stringify([l?.firstName, l?.lastName]));
const P5 = num(5);
r = await incoming(P5, '', 'I am looking for a loan, I am interested in the gold plan');
l = await lead(r.j?.matchedId);
check('"I am looking for..." is not mistaken for a name', l?.name === `WhatsApp ${fmt(P5)}`, l?.name);
const P6 = num(6);
r = await incoming(P6, '+91 98765 43210', 'price?');
l = await lead(r.j?.matchedId);
check('a profile name that is only a phone number is ignored', l?.name === `WhatsApp ${fmt(P6)}`, l?.name);
const P7 = num(7);
r = await incoming(P7, 'Unknown', 'mera naam Anil Kumar hai, mujhe loan chahiye');
l = await lead(r.j?.matchedId);
check('a Hindi "mera naam ... hai" is understood', l?.firstName === 'Anil' && l?.lastName === 'Kumar', JSON.stringify([l?.firstName, l?.lastName]));

sec('3. A lead made from a number alone gets a real name once the person says it');
r = await incoming(P2, '~', 'sorry, my name is Anita Rao');
l = await lead((await conv(P2))?.matched_id);
check('"WhatsApp +91 ..." becomes "Anita Rao"', l?.firstName === 'Anita' && l?.lastName === 'Rao' && l?._name_source === 'message', JSON.stringify([l?.name, l?._name_source]));
check('the same lead is kept, no second lead is made', r.j?.isNewLead === false && (await convs()).filter(x => x.phone === P2).length === 1);
r = await incoming(P3, 'Priya Sharma', 'my name is Zed Zee');
l = await lead((await conv(P3))?.matched_id);
check('a lead that already has a real name is never renamed', l?.firstName === 'Priya' && l?.lastName === 'Sharma', JSON.stringify([l?.firstName, l?.lastName]));
c = await conv(P3);
check('two unanswered messages are counted', c?.unreplied === 2, JSON.stringify(c?.unreplied));

sec('4. Replying clears "needs reply"');
const sent = await call('POST', '/whatsapp/send', A, { to: '+' + P3, body: 'Yes, it is. Shall I call you?' });
if (sent.s === 200) {
    c = await conv(P3);
    check('after your reply the chat no longer needs a reply', c?.needs_reply === false && c?.unreplied === 0 && c?.last_direction === 'outbound', JSON.stringify([c?.needs_reply, c?.unreplied]));
} else {
    console.log('  (skipped: sending is not available here)', sent.s);
}

sec('5. A number you messaged first has no lead yet; make one from the chat');
const P8 = num(8);
const out = await call('POST', '/whatsapp/send', A, { to: '+' + P8, body: 'Hello from FlowCRM' });
if (out.s === 200) {
    c = await conv(P8);
    check('it is listed as not saved: named from its number, no lead attached', c?.display_name === `WhatsApp ${fmt(P8)}` && !c?.matched_id, JSON.stringify(c));
    const noNote = await call('POST', `/whatsapp/conversations/${P8}/note`, A, { text: 'hi' });
    check('a note cannot be added until it is a lead', noNote.s === 400 && /lead/i.test(noNote.j?.error || ''), JSON.stringify(noNote));
    const noTask = await call('POST', `/whatsapp/conversations/${P8}/task`, A, { subject: 'x' });
    check('nor a task', noTask.s === 400);
    const mk = await call('POST', `/whatsapp/conversations/${P8}/lead`, A, { name: 'Meera Shah' });
    check('create lead: made, with the name typed', mk.s === 200 && mk.j?.existing === false && mk.j?.entityType === 'lead' && mk.j?.name === 'Meera Shah', JSON.stringify(mk));
    c = await conv(P8);
    check('the whole chat is now linked to the new lead', c?.matched_id === mk.j?.recordId && c?.display_name === 'Meera Shah', JSON.stringify(c));
    const again = await call('POST', `/whatsapp/conversations/${P8}/lead`, A, {});
    check('asking again does not make a second lead', again.s === 200 && again.j?.existing === true && again.j?.recordId === mk.j?.recordId, JSON.stringify(again));
} else {
    console.log('  (skipped: sending is not available here)', out.s);
}

sec('6. Note and task from the chat');
const note = await call('POST', `/whatsapp/conversations/${P1}/note`, A, { text: 'Wants the premium credit card, call tomorrow morning' });
check('a note is added to the lead', note.s === 200 && note.j?.entityType === 'lead' && note.j?.recordId === (await conv(P1))?.matched_id, JSON.stringify(note));
check('an empty note is refused', (await call('POST', `/whatsapp/conversations/${P1}/note`, A, { text: '  ' })).s === 400);
const trail = (await call('GET', `/audit/lead/${note.j?.recordId}`, A)).j;
const list = Array.isArray(trail) ? trail : (trail?.items || trail?.logs || []);
check('the note shows on the lead timeline', list.some(a => a.action === 'note' && /premium credit card/.test(JSON.stringify(a.details ?? a))), JSON.stringify(list).slice(0, 200));
const today = new Date(); today.setDate(today.getDate() + 3);
const tk = await call('POST', `/whatsapp/conversations/${P1}/task`, A, { subject: 'Call Chad about the credit card', dueInDays: 3, priority: 'High' });
check('a task is created for the lead', tk.s === 200 && tk.j?.subject === 'Call Chad about the credit card' && tk.j?.dueDate === today.toISOString().slice(0, 10), JSON.stringify(tk));
const t = await pick('task', tk.j?.id);
check('the task is linked to the lead, with the priority and the last message', t?.relatedId === note.j?.recordId && t?.priority === 'High' && /credit card/.test(t?.description || '') && t?._via === 'whatsapp', JSON.stringify(t));
const tk2 = await call('POST', `/whatsapp/conversations/${P1}/task`, A, {});
check('with nothing typed the task still gets a sensible subject', tk2.s === 200 && /Chad/.test(tk2.j?.subject || ''), JSON.stringify(tk2));
const related = (await call('GET', `/records/lead/${note.j?.recordId}/related-activity`, A)).j;
check('the task appears among the lead\'s related items', JSON.stringify(related || {}).includes(tk.j?.id), JSON.stringify(related || {}).slice(0, 160));

sec('7. Sign-in is required');
check('no token: creating a lead is refused', (await call('POST', `/whatsapp/conversations/${P1}/lead`, null, {})).s === 401);
check('no token: a note is refused', (await call('POST', `/whatsapp/conversations/${P1}/note`, null, { text: 'x' })).s === 401);
check('no token: a task is refused', (await call('POST', `/whatsapp/conversations/${P1}/task`, null, {})).s === 401);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('Failed: ' + fails.join(' | ')); process.exit(1); }
