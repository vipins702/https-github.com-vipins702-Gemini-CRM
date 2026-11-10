// Password reset by e-mail, public demo requests, the default dashboard, and the marketing pages.
//   JWT_SECRET=x ADMIN_PASSWORD=... node server/index.js > server.log
//   E2E_EMAIL=admin@flowcrm.com E2E_PASSWORD=... RESET_LOG=server.log node server/test/reset-and-site.mjs
// RESET_LOG (optional) is the server's output: without SMTP in development the reset link is printed there,
// which is how the "use the link" checks read it. Without it those checks are reported as skipped.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.E2E_BASE || 'http://localhost:3015/api';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tag = Date.now().toString().slice(-6) + Math.random().toString(36).slice(2, 5);
const call = async (method, p, token, body) => {
    const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch { /* */ }
    return { s: res.status, j, text };
};
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).j;
let pass = 0, skipped = 0; const fails = [];
const check = (name, ok, detail = '') => { if (ok) pass++; else { fails.push(name); console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const skip = (name) => { skipped++; console.log(`SKIP  ${name}`); };
const sec = (t) => console.log(`\n== ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const A = (await login(process.env.E2E_EMAIL || 'admin@flowcrm.com', process.env.E2E_PASSWORD))?.token;
if (!A) { console.log('Cannot log in as admin'); process.exit(2); }

sec('1. Forgot password');
const role = await call('POST', '/roles', A, { name: `Reset role ${tag}`, description: '', permissions: { lead: { read: true } } });
const email = `reset.${tag}@example.com`;
await call('POST', '/users', A, { email, name: 'Reset User', roleId: role.j.id, password: 'First!Pass#1234' });
const known = await call('POST', '/auth/forgot-password', null, { email });
const unknown = await call('POST', '/auth/forgot-password', null, { email: `nobody.${tag}@example.com` });
check('known and unknown addresses get the same answer', known.s === 200 && JSON.stringify(known.j) === JSON.stringify(unknown.j), `${known.s} ${known.text} vs ${unknown.s} ${unknown.text}`);
check('a malformed address is refused (400)', (await call('POST', '/auth/forgot-password', null, { email: 'not-an-address' })).s === 400);
check('a missing address is refused (400)', (await call('POST', '/auth/forgot-password', null, {})).s === 400);

sec('2. Reset links');
const bad = await call('POST', '/auth/reset-password/check', null, { token: 'x'.repeat(43) });
check('an invented token is not valid', bad.s === 200 && bad.j?.valid === false);
const badUse = await call('POST', '/auth/reset-password', null, { token: 'x'.repeat(43), newPassword: 'Whatever!Pass#1' });
check('an invented token cannot reset a password (400)', badUse.s === 400, `HTTP ${badUse.s}`);
check('a short token is refused', (await call('POST', '/auth/reset-password', null, { token: 'abc', newPassword: 'Whatever!Pass#1' })).s === 400);

const linkFor = (addr) => {
    if (!process.env.RESET_LOG || !fs.existsSync(process.env.RESET_LOG)) return null;
    const hits = [...fs.readFileSync(process.env.RESET_LOG, 'utf8').matchAll(new RegExp(`Reset link for ${addr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: \\S*token=([A-Za-z0-9_-]+)`, 'g'))];
    return hits.length ? hits[hits.length - 1][1] : null;
};
if (!process.env.RESET_LOG) {
    for (const n of ['valid link is accepted', 'weak password refused', 'reset works and ends sessions', 'link is single use', 'newest link replaces the older one']) skip(n);
} else {
    await sleep(600);
    const t1 = linkFor(email);
    check('the server produced a reset link for the real account', !!t1);
    check('and none for the unknown address', linkFor(`nobody.${tag}@example.com`) === null);
    if (t1) {
        const oldSession = (await login(email, 'First!Pass#1234'))?.token;
        check('before the reset the old password signs in', !!oldSession);
        check('the link is valid', (await call('POST', '/auth/reset-password/check', null, { token: t1 })).j?.valid === true);
        const weak = await call('POST', '/auth/reset-password', null, { token: t1, newPassword: 'weak' });
        check('a weak password is refused (400) and the link survives', weak.s === 400 && (await call('POST', '/auth/reset-password/check', null, { token: t1 })).j?.valid === true);
        const ok = await call('POST', '/auth/reset-password', null, { token: t1, newPassword: 'Second!Pass#5678' });
        check('a valid password is accepted', ok.s === 200, `HTTP ${ok.s} ${ok.text}`);
        check('the old password no longer works', !(await login(email, 'First!Pass#1234'))?.token);
        const fresh = await login(email, 'Second!Pass#5678');
        check('the new password works and no forced change is pending', !!fresh?.token && fresh.user.mustChangePassword === false);
        check('sessions opened before the reset are ended (401)', (await call('GET', '/data/lead', oldSession)).s === 401);
        check('the link cannot be used twice', (await call('POST', '/auth/reset-password', null, { token: t1, newPassword: 'Third!Pass#9012' })).s === 400);
        check('and no longer checks as valid', (await call('POST', '/auth/reset-password/check', null, { token: t1 })).j?.valid === false);

        await call('POST', '/auth/forgot-password', null, { email }); await sleep(500);
        const t2 = linkFor(email);
        await call('POST', '/auth/forgot-password', null, { email }); await sleep(500);
        const t3 = linkFor(email);
        check('asking again cancels the previous link', t2 && t3 && t2 !== t3 && (await call('POST', '/auth/reset-password/check', null, { token: t2 })).j?.valid === false && (await call('POST', '/auth/reset-password/check', null, { token: t3 })).j?.valid === true);
    }
}
const limitMail = `limit.${tag}@example.com`;
const codes = []; for (let i = 0; i < 4; i++) codes.push((await call('POST', '/auth/forgot-password', null, { email: limitMail })).s);
if (codes[0] === 429) skip('per-address limit (the IP budget from an earlier run is not spent yet)');
else check('the fourth request for one address within 15 minutes is limited (429)', codes[3] === 429 && codes.slice(0, 3).every(c => c === 200), codes.join(','));

sec('3. Demo requests from the public site');
const demo = (b) => call('POST', '/public/demo-request', null, b);
check('a missing name is refused (400)', (await demo({ email: 'a@b.co' })).s === 400);
check('a bad e-mail is refused (400)', (await demo({ name: 'A B', email: 'nope' })).s === 400);
check('a bad phone is refused (400)', (await demo({ name: 'A B', email: 'ab@b.co', phone: 'abc' })).s === 400);
const hp = await demo({ name: 'Bot Bot', email: `bot.${tag}@example.com`, website: 'http://spam.example' });
const leads0 = ((await call('GET', '/data/lead', A)).j || []);
check('the hidden "website" field is answered as success but creates nothing', hp.s === 200 && !leads0.some(l => l.email === `bot.${tag}@example.com`));
const good = await demo({ name: 'Priya Nair', email: `priya.${tag}@example.com`, company: 'Nair Studio', phone: '+91 98765 43210', industry: 'Agencies', message: 'Leads arrive on Instagram.' });
check('a valid request is accepted', good.s === 200 && good.j?.success === true, `HTTP ${good.s} ${good.text}`);
const lead = ((await call('GET', '/data/lead', A)).j || []).find(l => l.email === `priya.${tag}@example.com`);
check('it becomes a lead with company, phone, industry and source', lead?.company === 'Nair Studio' && lead?.industry === 'Agencies' && lead?.source === 'Web' && lead?.status === 'New' && lead?.firstName === 'Priya' && lead?.lastName === 'Nair', JSON.stringify(lead));
check('it is marked as coming from the website', lead?._via === 'website_demo_request');
const tricky = await demo({ name: 'X Y', email: `x.${tag}@example.com`, message: '<script>alert(1)</script>' });
check('markup in the message is stored as text, not run (accepted)', tricky.s === 200);

sec('4. Default dashboard');
const widgets = (await call('GET', '/dashboard/widgets', A)).j || [];
check('a workspace always gets widgets the dashboard can draw', Array.isArray(widgets) && widgets.length > 0 && widgets.every(w => w.type === 'pack' && w.packId && w.datasetId), JSON.stringify(widgets).slice(0, 160));
const packs = (await call('GET', '/reports/packs', A)).j || [];
const summary = packs.find(p => p.id === 'dashboard_summary');
check('every default widget points at a real dataset', widgets.every(w => w.packId !== 'dashboard_summary' || (summary?.datasets || []).some(d => d.id === w.datasetId)));

sec('5. Marketing pages (static files)');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pages = ['index.html', ...fs.readdirSync(path.join(ROOT, 'public')).filter(f => f.endsWith('.html')).map(f => 'public/' + f)];
check('home plus eight industry pages exist', pages.length === 9, `${pages.length} pages`);
const titles = new Set(), descs = new Set();
for (const f of pages) {
    const h = read(f);
    const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    check(`${f}: title is 25-70 characters`, title.length >= 25 && title.length <= 70, `${title.length}: ${title}`);
    check(`${f}: description is 70-160 characters`, desc.length >= 70 && desc.length <= 160, `${desc.length}`);
    check(`${f}: exactly one h1`, (h.match(/<h1[ >]/g) || []).length === 1);
    check(`${f}: has a main landmark and a skip link`, /<main id="main"/.test(h) && /class="skip"/.test(h));
    check(`${f}: every image has alt text`, (h.match(/<img\b(?![^>]*\balt=)[^>]*>/g) || []).length === 0);
    check(`${f}: lang is set and the viewport meta exists`, /<html lang="en">/.test(h) && /name="viewport"/.test(h));
    check(`${f}: unique title and description`, !titles.has(title) && !descs.has(desc)); titles.add(title); descs.add(desc);
    for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { let ok = true; try { JSON.parse(m[1]); } catch { ok = false; } check(`${f}: structured data is valid JSON`, ok); }
    check(`${f}: FAQ structured data matches the visible questions`, (h.match(/<details>/g) || []).length === (h.match(/"@type":"Question"/g) || []).length);
    check(`${f}: no inline event handlers`, !/\son[a-z]+="/i.test(h));
    check(`${f}: no empty links`, !/href="#"/.test(h));
    for (const m of h.matchAll(/href="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
        const target = m[1];
        const known = target === '/' || ['/login', '/app'].includes(target) || fs.existsSync(path.join(ROOT, 'public', target.slice(1) + '.html')) || fs.existsSync(path.join(ROOT, 'public', target.slice(1)));
        if (!known) check(`${f}: internal link ${target} points at a real page`, false);
    }
}
const robots = read('public/robots.txt');
check('robots.txt keeps the app and forms out of search', /Disallow: \/login/.test(robots) && /Disallow: \/app/.test(robots) && /Disallow: \/reset-password/.test(robots));
check('the app shell is marked noindex', /name="robots" content="noindex"/.test(read('app.html')));
const home = read('index.html');
check('home links to every industry page', fs.readdirSync(path.join(ROOT, 'public')).filter(f => f.endsWith('.html')).every(f => home.includes(`href="/${f.replace('.html', '')}"`)));

console.log(`\n=========== ${pass} passed, ${fails.length} failed, ${skipped} skipped ===========`);
process.exit(fails.length ? 1 : 0);
