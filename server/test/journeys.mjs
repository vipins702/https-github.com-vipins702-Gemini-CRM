// Journeys: many per workspace, real waits, If / Else, exit conditions, status / field / date / inactivity triggers,
// failures and notifications, run history, test run, permissions. Time is moved with POST /journeys/process-due { asOf }.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... node server/test/journeys.mjs
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
const DAY = 86400000;
const later = (ms) => new Date(Date.now() + ms).toISOString();
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

// helpers: build a journey graph from a simple description
const R1 = (field, operator, value) => ({ type: 'rule', field, operator, value });
const G = (op, ...children) => ({ type: 'group', op, children });
let nid = 0;
const trig = (config) => ({ id: 't', type: 'trigger', data: { type: 'trigger', label: 'Start', config: { entityType: 'lead', triggerType: 'create', ...config } } });
const act = (config, id = 'a' + ++nid) => ({ id, type: 'action', data: { type: 'action', label: config.type, config } });
const setF = (fields) => ({ type: 'update_record', fields });
const wait = (amount, unit, id = 'w' + ++nid) => ({ id, type: 'wait', data: { type: 'wait', label: 'Wait', config: { amount, unit } } });
const cond = (conditions, id = 'c' + ++nid) => ({ id, type: 'condition', data: { type: 'condition', label: 'If', config: { conditions } } });
const chain = (...nodes) => ({ nodes, edges: nodes.slice(1).map((n, i) => ({ id: 'e' + i, source: nodes[i].id, target: n.id })) });
const save = (name, graph, extra = {}) => call('POST', '/journeys', A, { name: name + ' ' + tag, ...graph, ...extra });
const leadBody = (extra = {}) => ({ firstName: 'Jny', lastName: 'T' + rnd(), email: `jy.${rnd()}@example.com`, status: 'New', ...extra });
const getLead = async (id) => ((await call('GET', '/data/lead', A)).j || []).find(x => x.id === id) || {};
const mkLead = async (extra) => (await call('POST', '/data/lead', A, leadBody(extra))).j?.id;
const runsOf = async (jid, status) => (await call('GET', `/journeys/${jid}/runs${status ? '?status=' + status : ''}`, A)).j || [];
const tick = (asOf) => call('POST', '/journeys/process-due', A, asOf ? { asOf } : {});

// schema: a date field and a priority field on leads
const lead0 = (await call('GET', '/metadata/schemas', A)).j.lead;
await call('POST', '/metadata/schemas', A, { entityType: 'lead', config: { ...lead0, fields: [...lead0.fields.filter(f => !f.name.startsWith('jy_')), { name: 'jy_follow', label: 'Follow-up date', type: 'date' }, { name: 'jy_flag', label: 'Flag', type: 'text' }, { name: 'jy_step', label: 'Step', type: 'text' }] } });
const made = [];
const mk = async (name, graph, extra) => { const r = await save(name, graph, extra); if (r.j?.id) made.push(r.j.id); return r; };

sec('1. Many journeys per workspace');
const j1 = await mk('One', chain(trig({ conditions: G('and', R1('company', '==', 'JnyCo' + tag)) }), act(setF({ jy_flag: 'one' }))));
const j2 = await mk('Two', chain(trig({ conditions: G('and', R1('company', '==', 'JnyCo' + tag)) }), act(setF({ jy_step: 'two' }))));
check('first journey saves', j1.s < 300 && j1.j?.id, JSON.stringify(j1.j));
check('second journey saves (no longer one per workspace)', j2.s < 300 && j2.j?.id && j2.j.id !== j1.j?.id, JSON.stringify(j2.j));
let list = (await call('GET', '/journeys', A)).j || [];
check('both are listed with a trigger summary', list.filter(x => [j1.j?.id, j2.j?.id].includes(x.id)).length === 2 && list.find(x => x.id === j1.j.id)?.trigger.includes('is created'), JSON.stringify(list.map(x => x.trigger)));
let l = await getLead(await mkLead({ company: 'JnyCo' + tag }));
check('both journeys ran on one new record', l.jy_flag === 'one' && l.jy_step === 'two', JSON.stringify([l.jy_flag, l.jy_step]));
check('a record that does not match is left alone', (await getLead(await mkLead({ company: 'Other' }))).jy_flag === undefined);
await call('POST', `/journeys/${j1.j.id}/active`, A, { active: false });
l = await getLead(await mkLead({ company: 'JnyCo' + tag }));
check('a switched-off journey does not run (the other still does)', l.jy_flag === undefined && l.jy_step === 'two', JSON.stringify([l.jy_flag, l.jy_step]));
check('active flag is shown in the list', ((await call('GET', '/journeys', A)).j || []).find(x => x.id === j1.j.id)?.isActive === false);
check('old /workflows endpoint still answers with a graph', Array.isArray((await call('GET', '/workflows', A)).j?.nodes));
await call('POST', `/journeys/${j1.j.id}/active`, A, { active: false });
await call('POST', `/journeys/${j2.j.id}/active`, A, { active: false });

sec('2. Saving checks');
const bad = async (label, graph) => check(`refused: ${label}`, (await save('Bad', graph)).s === 400);
await bad('no start trigger', chain(act(setF({ a: 1 }))));
await bad('two start triggers', { nodes: [trig({}), { ...trig({}), id: 't2' }], edges: [] });
await bad('unknown record type', chain(trig({ entityType: 'nope' }), act(setF({}))));
await bad('field_change without a field', chain(trig({ triggerType: 'field_change' }), act(setF({}))));
await bad('date trigger on a non-date field', chain(trig({ triggerType: 'date_arrives', field: 'email', offsetDays: 1 }), act(setF({}))));
await bad('inactive with 0 days', chain(trig({ triggerType: 'inactive', days: 0 }), act(setF({}))));
await bad('e-mail without a subject', chain(trig({}), act({ type: 'email', to: '{email}', subject: '' })));
await bad('webhook with a bad address', chain(trig({}), act({ type: 'webhook', url: 'not a url' })));
await bad('assign without a person', chain(trig({}), act({ type: 'assign_owner' })));
await bad('wait with no unit', chain(trig({}), { id: 'w', type: 'wait', data: { type: 'wait', config: { amount: 2 } } }));
await bad('wait of 0', chain(trig({}), wait(0, 'days')));
await bad('If step with nothing to check', chain(trig({}), cond(G('and'))));
await bad('If step with an unknown field', chain(trig({}), cond(G('and', R1('nope', '==', 1)))));
await bad('a step with two ways out', { nodes: [trig({}), act(setF({}), 'x'), act(setF({}), 'y')], edges: [{ id: '1', source: 't', target: 'x' }, { id: '2', source: 't', target: 'y' }] });
await bad('a loop', { nodes: [trig({}), act(setF({}), 'x')], edges: [{ id: '1', source: 't', target: 'x' }, { id: '2', source: 'x', target: 't' }] });
await bad('a connection to nowhere', { nodes: [trig({})], edges: [{ id: '1', source: 't', target: 'ghost' }] });
await bad('an unknown step type', { nodes: [trig({}), { id: 'z', type: 'magic', data: { type: 'magic' } }], edges: [] });
check('editing a journey that is not yours (other id) answers 404', (await call('POST', '/journeys', A, { id: 'nope', ...chain(trig({}), act(setF({}))) })).s === 404);

sec('3. Waits really wait');
const jw = await mk('Wait', chain(trig({ conditions: G('and', R1('company', '==', 'WaitCo' + tag)) }), act(setF({ jy_step: 'before' })), wait(2, 'days'), act(setF({ jy_step: 'after' }))));
const lw = await mkLead({ company: 'WaitCo' + tag });
check('first step runs at once', (await getLead(lw)).jy_step === 'before');
let rw = (await runsOf(jw.j.id, 'waiting'))[0];
check('the run is waiting with a due time about 2 days away', !!rw && Math.abs(new Date(rw.dueAt).getTime() - (Date.now() + 2 * DAY)) < 5 * 60000, JSON.stringify(rw?.dueAt));
await tick(later(DAY));
check('after 1 day it is still waiting', (await getLead(lw)).jy_step === 'before' && (await runsOf(jw.j.id, 'waiting')).length === 1);
await tick(later(3 * DAY));
check('after 3 days the next step has run', (await getLead(lw)).jy_step === 'after');
rw = (await runsOf(jw.j.id))[0];
check('the run is done with a step log (start, action, wait, action)', rw?.status === 'done' && rw.steps.length === 4 && rw.steps[2].result === 'waiting', JSON.stringify(rw?.steps?.map(s => s.result)));
await tick(later(5 * DAY));
check('it does not run twice', (await runsOf(jw.j.id)).length === 1);

sec('4. If / Else');
const jb = await mk('Branch', {
    nodes: [trig({ conditions: G('and', R1('jy_flag', '==', 'br' + tag)) }), cond(G('or', R1('source', '==', 'Web'), R1('source', '==', 'Referral')), 'cb'), act(setF({ jy_step: 'YES-path' }), 'ay'), act(setF({ jy_step: 'NO-path' }), 'an')],
    edges: [{ id: 'e1', source: 't', target: 'cb' }, { id: 'e2', source: 'cb', sourceHandle: 'true', target: 'ay' }, { id: 'e3', source: 'cb', sourceHandle: 'false', target: 'an' }],
});
check('branching journey saves', jb.s < 300, JSON.stringify(jb.j));
check('YES path (source Web)', (await getLead(await mkLead({ jy_flag: 'br' + tag, source: 'Web' }))).jy_step === 'YES-path');
check('YES path through OR (source Referral)', (await getLead(await mkLead({ jy_flag: 'br' + tag, source: 'Referral' }))).jy_step === 'YES-path');
check('NO path (source Ads)', (await getLead(await mkLead({ jy_flag: 'br' + tag, source: 'Ads' }))).jy_step === 'NO-path');
const rb = (await runsOf(jb.j.id))[0];
check('the log says which way it went', rb?.steps?.some(s => s.type === 'condition' && s.note === 'NO'), JSON.stringify(rb?.steps?.map(s => s.note)));

sec('5. Stop when');
const jx = await mk('Stop', chain(trig({ conditions: G('and', R1('company', '==', 'StopCo' + tag)), exitConditions: G('and', R1('status', '==', 'Won')) }), wait(1, 'days'), act(setF({ jy_step: 'should-not-run' }))));
const lx = await mkLead({ company: 'StopCo' + tag });
await call('POST', `/data/lead/${lx}/status`, A, { status: 'Won' });
await tick(later(2 * DAY));
check('the stop condition cancels the wait', (await getLead(lx)).jy_step !== 'should-not-run' && (await runsOf(jx.j.id, 'cancelled')).length === 1);
const ly = await mkLead({ company: 'StopCo' + tag });
await tick(later(2 * DAY));
check('without the stop condition the journey carries on', (await getLead(ly)).jy_step === 'should-not-run');
const lz = await mkLead({ company: 'StopCo' + tag });
await call('DELETE', `/data/lead/${lz}`, A);
await tick(later(2 * DAY));
check('a deleted record cancels its waiting run', (await runsOf(jx.j.id, 'cancelled')).length === 2);

sec('6. Status, field, update and delete triggers');
const js = await mk('Status', chain(trig({ triggerType: 'status_change', to: 'Qualified', conditions: G('and', R1('company', '==', 'StCo' + tag)) }), act(setF({ jy_step: 'qualified-now' }))));
const ls = await mkLead({ company: 'StCo' + tag });
await call('POST', `/data/lead/${ls}/status`, A, { status: 'Contacted' });
check('status change to another stage does not fire', (await getLead(ls)).jy_step === undefined);
await call('POST', `/data/lead/${ls}/status`, A, { status: 'Qualified' });
check('status change to Qualified fires (pipeline move)', (await getLead(ls)).jy_step === 'qualified-now');
const lsf = await mkLead({ company: 'StCo' + tag });
await call('POST', '/data/lead', A, { ...(await getLead(lsf)), id: lsf, status: 'Qualified' });
check('status change through the edit form fires too', (await getLead(lsf)).jy_step === 'qualified-now');
const jf = await mk('Field', chain(trig({ triggerType: 'field_change', field: 'jy_flag', conditions: G('and', R1('company', '==', 'FcCo' + tag)) }), act(setF({ jy_step: 'flag-changed' }))));
const lf = await mkLead({ company: 'FcCo' + tag });
check('watching a field: creating does not fire', (await getLead(lf)).jy_step === undefined);
await call('POST', '/data/lead', A, { ...(await getLead(lf)), id: lf, firstName: 'Renamed' });
check('watching a field: editing something else does not fire', (await getLead(lf)).jy_step === undefined);
await call('POST', '/data/lead', A, { ...(await getLead(lf)), id: lf, jy_flag: 'new value' });
check('watching a field: changing it fires', (await getLead(lf)).jy_step === 'flag-changed');
const ju = await mk('Update', chain(trig({ triggerType: 'update', conditions: G('and', R1('company', '==', 'UpCo' + tag)) }), act(setF({ jy_flag: 'touched' }))));
const lu = await mkLead({ company: 'UpCo' + tag });
check('update trigger: not on create', (await getLead(lu)).jy_flag === undefined);
await call('POST', '/data/lead', A, { ...(await getLead(lu)), id: lu, firstName: 'Edit' });
check('update trigger: on edit', (await getLead(lu)).jy_flag === 'touched');
check('a journey whose own step edits the record does not loop (one run per edit)', (await runsOf(ju.j.id)).length === 1, JSON.stringify((await runsOf(ju.j.id)).length));
const jd = await mk('Delete', chain(trig({ triggerType: 'delete', conditions: G('and', R1('company', '==', 'DelCo' + tag)) }), act({ type: 'create_task', subject: 'Deleted {firstName}' })));
const ld = await mkLead({ company: 'DelCo' + tag });
await call('DELETE', `/data/lead/${ld}`, A);
check('delete trigger runs when a record is deleted', (await runsOf(jd.j.id, 'done')).length === 1);
check('delete trigger can still create a task from the deleted record', ((await call('GET', '/tasks', A)).j || []).some(t => /Deleted Jny/.test(t.subject)));

sec('7. A date arriving, and no activity');
const today = ymd(Date.now());
const jt = await mk('Date', chain(trig({ triggerType: 'date_arrives', field: 'jy_follow', offsetDays: -1, conditions: G('and', R1('company', '==', 'DtCo' + tag)) }), act(setF({ jy_step: 'follow-up-tomorrow' }))));
const lt1 = await mkLead({ company: 'DtCo' + tag, jy_follow: ymd(Date.now() + DAY) });
const lt2 = await mkLead({ company: 'DtCo' + tag, jy_follow: ymd(Date.now() + 9 * DAY) });
let t1 = (await tick()).j;
check('date trigger: fires the day before the date', (await getLead(lt1)).jy_step === 'follow-up-tomorrow', JSON.stringify(t1));
check('date trigger: not for a date further away', (await getLead(lt2)).jy_step === undefined);
await tick();
check('date trigger: only once per date', (await runsOf(jt.j.id)).length === 1);
await tick(later(8 * DAY));
check('date trigger: the later record fires on its own day', (await getLead(lt2)).jy_step === 'follow-up-tomorrow');
const ji = await mk('Quiet', chain(trig({ triggerType: 'inactive', days: 3, conditions: G('and', R1('company', '==', 'QtCo' + tag)) }), act(setF({ jy_flag: 'gone-quiet' }))));
const li = await mkLead({ company: 'QtCo' + tag });
await tick(later(2 * DAY));
check('inactivity: not after 2 quiet days', (await getLead(li)).jy_flag === undefined);
await tick(later(4 * DAY));
check('inactivity: fires after 4 quiet days', (await getLead(li)).jy_flag === 'gone-quiet');
await tick(later(5 * DAY));
check('inactivity: not again for the same quiet spell', (await runsOf(ji.j.id)).length === 1);

sec('8. Actions: notify, assign, failure and webhook safety');
const me = ((await call('GET', '/users', A)).j || []).find(u => u.email === (process.env.E2E_EMAIL || 'admin@flowcrm.com'));
const rmEmail = `jny.rm.${tag}@flowcrm.test`;
const roleId = (await call('POST', '/roles', A, { name: 'Jny RM ' + tag, description: 'x', permissions: { lead: { read: true, create: true, edit: true, scope: 'own' } } })).j?.id;
await call('POST', '/users', A, { email: rmEmail, password: 'Jny@12345xx', roleId, name: 'Jny RM' });
const rm = ((await call('GET', '/users', A)).j || []).find(u => u.email === rmEmail);
const RMT = await login(rmEmail, 'Jny@12345xx');
const ja = await mk('Assign', chain(trig({ conditions: G('and', R1('company', '==', 'AsCo' + tag)) }), act({ type: 'assign_owner', userId: rm.id }), act({ type: 'notify', userId: rm.id, title: 'New lead for you', message: 'Please call {firstName}' })));
const la = await mkLead({ company: 'AsCo' + tag, firstName: 'Meera' });
check('assign: the record now belongs to that person', (await getLead(la))._assigned_to === rm.id);
check('assign: they can open it (own scope) and see it in their list', ((await call('GET', '/data/lead', RMT)).j || []).some(x => x.id === la));
const notes = (await call('GET', '/notifications', RMT)).j || [];
check('notify: they got the notification with the record name filled in', notes.some(n => n.title === 'New lead for you' && /call Meera/.test(n.body)), JSON.stringify(notes.map(n => n.title)));
const jh = await mk('Hook', chain(trig({ conditions: G('and', R1('company', '==', 'HkCo' + tag)) }), act({ type: 'webhook', url: 'http://127.0.0.1:9/hook' }), act(setF({ jy_step: 'after-hook' }))));
const lh = await mkLead({ company: 'HkCo' + tag });
const rh = (await runsOf(jh.j.id))[0];
check('a webhook to an internal address is refused and the run fails', rh?.status === 'failed' && /private|internal/i.test(rh.error || ''), JSON.stringify(rh?.error));
check('the failed step is in the log and later steps did not run', rh?.steps?.[rh.steps.length - 1]?.result === 'failed' && (await getLead(lh)).jy_step !== 'after-hook');
check('the person who built it was notified', ((await call('GET', '/notifications', A)).j || []).some(n => n.title === `Journey failed: Hook ${tag}`));
const jna = await mk('NoOwner', chain(trig({ conditions: G('and', R1('company', '==', 'NoCo' + tag)) }), act({ type: 'assign_owner', userId: 'ghost' })));
await mkLead({ company: 'NoCo' + tag });
check('assigning to a stranger fails the run clearly', (await runsOf(jna.j.id))[0]?.status === 'failed');

sec('9. Test run and history');
const lt = await mkLead({ company: 'TestCo' + tag, source: 'Ads', jy_flag: 'br' + tag });
const before = JSON.stringify(await getLead(lt));
const tr = (await call('POST', `/journeys/${jb.j.id}/test`, A, { recordId: lt })).j;
check('test run shows the path: start, If, NO action', tr?.steps?.length === 3 && tr.steps[1].result === 'NO' && tr.steps[2].result === 'would run', JSON.stringify(tr?.steps?.map(s => s.result)));
check('test run changed nothing', JSON.stringify(await getLead(lt)) === before);
check('test run says when the start conditions do not match', (await call('POST', `/journeys/${jx.j.id}/test`, A, { recordId: lt })).j?.startsHere === false);
check('test run needs a record', (await call('POST', `/journeys/${jb.j.id}/test`, A, {})).s === 400);
check('test run of an unknown journey is 404', (await call('POST', `/journeys/nope/test`, A, { recordId: lt })).s === 404);
const hist = (await call('GET', `/journeys/records/lead/${la}/runs`, A)).j || [];
check('record history lists its runs', hist.length >= 1 && hist[0].journeyName === `Assign ${tag}` && Array.isArray(hist[0].steps));
check('an RM can read the history of their own record', (await call('GET', `/journeys/records/lead/${la}/runs`, RMT)).s === 200);
const others = await mkLead({ company: 'AsCo' + tag + 'x' });
check('an RM cannot read the history of someone else\'s record', (await call('GET', `/journeys/records/lead/${others}/runs`, RMT)).s === 403);
check('an RM cannot list or build journeys', (await call('GET', '/journeys', RMT)).s === 403 && (await call('POST', '/journeys', RMT, chain(trig({}), act(setF({})))) ).s === 403);
check('an RM cannot run the scheduler by hand', (await call('POST', '/journeys/process-due', RMT, {})).s === 403);
check('a bad asOf is refused', (await call('POST', '/journeys/process-due', A, { asOf: 'tomorrow-ish' })).s === 400);

sec('10. Editing and deleting do not disturb runs in progress');
const jv = await mk('Version', chain(trig({ conditions: G('and', R1('company', '==', 'VerCo' + tag)) }), wait(1, 'days'), act(setF({ jy_step: 'v1' }), 'step')));
const lv = await mkLead({ company: 'VerCo' + tag });
await call('POST', '/journeys', A, { id: jv.j.id, name: 'Version ' + tag, ...chain(trig({ conditions: G('and', R1('company', '==', 'VerCo' + tag)) }), wait(1, 'days'), act(setF({ jy_step: 'v2' }), 'step')) });
await tick(later(2 * DAY));
check('a run in progress finishes the version it started with', (await getLead(lv)).jy_step === 'v1');
const lv2 = await mkLead({ company: 'VerCo' + tag });
await tick(later(3 * DAY));
check('new runs use the edited journey', (await getLead(lv2)).jy_step === 'v2');
const lv3 = await mkLead({ company: 'VerCo' + tag });
check('the run is waiting before the journey is deleted', (await runsOf(jv.j.id, 'waiting')).length === 1);
check('deleting a journey works', (await call('DELETE', `/journeys/${jv.j.id}`, A)).s === 200 && (await call('GET', `/journeys/${jv.j.id}`, A)).s === 404);
await tick(later(9 * DAY));
check('deleting cancels its waiting runs (nothing runs later)', (await getLead(lv3)).jy_step !== 'v2');
const cw = await mk('Cancel', chain(trig({ conditions: G('and', R1('company', '==', 'CnCo' + tag)) }), wait(1, 'days'), act(setF({ jy_step: 'never' }))));
await mkLead({ company: 'CnCo' + tag });
const wrun = (await runsOf(cw.j.id, 'waiting'))[0];
check('a waiting run can be cancelled by hand', (await call('POST', `/journeys/runs/${wrun.id}/cancel`, A)).s === 200 && (await runsOf(cw.j.id, 'cancelled')).length === 1);
check('cancelling a finished run is refused', (await call('POST', `/journeys/runs/${wrun.id}/cancel`, A)).s === 404);

for (const id of made) await call('DELETE', `/journeys/${id}`, A);
await call('POST', '/metadata/schemas', A, { entityType: 'lead', config: lead0 });
console.log(`\n=========== ${pass} passed, ${fails.length} failed ===========`);
process.exit(fails.length ? 1 : 0);
