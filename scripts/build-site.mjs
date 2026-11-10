// Builds the public marketing site as plain static HTML (crawlable, no JavaScript needed to read it).
//   node scripts/build-site.mjs                      -> pages without canonical URLs or sitemap
//   SITE_URL=https://www.example.com node scripts/build-site.mjs   -> adds canonical tags, sitemap.xml
// Outputs: index.html (home, a Vite entry), public/<industry>.html, public/site/*, public/robots.txt, public/sitemap.xml
// Rename the product by changing BRAND below (or BRAND_NAME in the environment) and running this again.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = process.env.BRAND_NAME || 'FlowCRM';
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Industry pages: one search phrase each, with the pipeline that business really runs ─────────────
const INDUSTRIES = [
    {
        slug: 'crm-for-agencies', name: 'Agencies', keyword: 'CRM for agencies',
        title: `CRM for Agencies: Leads, Clients and Pipelines | ${BRAND}`,
        description: 'A CRM for marketing and digital agencies. Capture WhatsApp, Instagram and web leads, run a pipeline per client, and control what each person sees.',
        h1: 'The CRM for agencies that sell for many clients at once',
        intro: 'Agencies juggle leads for their own new business and for every client they run campaigns for. Keep each client separate, keep your team on the right accounts, and show clients the results without exporting spreadsheets.',
        stages: ['Enquiry', 'Discovery call', 'Proposal sent', 'Negotiation', 'Won', 'Lost'],
        points: [
            ['Campaign leads land in the right place', 'Instagram, Facebook and website forms post leads straight into the client’s workspace, tagged with where they came from, and round-robin hands them to the next free person.'],
            ['Each client stays separate', 'Give every client its own workspace with its own pipeline, fields and branding, or keep them in one workspace and limit each account manager to their own records.'],
            ['Proposals without a second tool', 'Build a quote with line items and tax, e-mail it, and turn it into a won deal when the client says yes.'],
        ],
        faq: [
            ['Can each client have a different pipeline?', 'Yes. Every workspace has its own stages, required fields and stage actions, so a lead-gen client and a retainer client can follow different steps.'],
            ['Can clients see their own leads?', 'You can give a client a login with a read-only role limited to their workspace, so they see their leads and nothing else.'],
            ['Does it capture Instagram and Facebook leads?', 'Yes. Leads sent to the ingest endpoint from Instagram, Facebook or any form tool are created as leads with the source recorded, and duplicates are matched by e-mail.'],
        ],
    },
    {
        slug: 'real-estate-crm', name: 'Real estate', keyword: 'real estate CRM',
        title: `Real Estate CRM with WhatsApp Lead Capture | ${BRAND}`,
        description: 'A real estate CRM for brokers and developers. Capture enquiries from WhatsApp and portals, schedule site visits, and track every buyer to booking.',
        h1: 'A real estate CRM that keeps up with every enquiry',
        intro: 'Property enquiries arrive at all hours, mostly on WhatsApp. Answer them from one shared inbox, route them to the right sales person, and see which listings and campaigns actually bring buyers.',
        stages: ['New enquiry', 'Contacted', 'Site visit booked', 'Site visit done', 'Negotiation', 'Booked', 'Lost'],
        points: [
            ['Enquiries become leads automatically', 'A first WhatsApp message creates a lead with the phone number already matched, so no enquiry sits unanswered in someone’s personal phone.'],
            ['Site visits never slip', 'Moving a buyer to “Site visit booked” can create the follow-up task for the right agent, and the calendar shows every visit for the day.'],
            ['Brokers see only their buyers', 'Give each broker a role limited to their own leads, while managers see the whole pipeline and the source of every booking.'],
        ],
        faq: [
            ['Can I import leads from property portals?', 'Yes. Import a CSV export, or post leads from any portal or form tool to the ingest endpoint so they arrive as they come in.'],
            ['Can I track which project a buyer is interested in?', 'Add your own fields, such as project, budget and configuration, to the lead form without writing code.'],
        ],
    },
    {
        slug: 'crm-for-education', name: 'Education & admissions', keyword: 'CRM for education',
        title: `CRM for Education and Admissions Teams | ${BRAND}`,
        description: 'An admissions CRM for coaching institutes, schools and study-abroad consultants. Capture enquiries, follow up on WhatsApp, and track every student to enrolment.',
        h1: 'An admissions CRM from first enquiry to enrolment',
        intro: 'Counsellors lose students when follow-ups depend on memory. Put every enquiry, call and WhatsApp conversation on the student’s record and let the pipeline tell each counsellor who to call next.',
        stages: ['Enquiry', 'Counselling call', 'Demo class', 'Application', 'Fee paid', 'Enrolled', 'Dropped'],
        points: [
            ['Every enquiry gets a counsellor', 'Website and social enquiries are shared out by round-robin or by rules, such as course or city, so nobody waits for a callback.'],
            ['Follow-ups happen on time', 'Drip e-mail sequences and stage tasks remind students and counsellors about deadlines, demo classes and pending documents.'],
            ['See what fills batches', 'Reports show enquiries by source, course and counsellor, so you know which campaigns bring students who actually enrol.'],
        ],
        faq: [
            ['Can parents and students be on one record?', 'Yes. Add custom fields for the parent’s name and contact, or link a separate contact record.'],
            ['Can we run different steps for different courses?', 'Yes. Make a workspace per course or branch, each with its own pipeline and required fields.'],
        ],
    },
    {
        slug: 'clinic-crm', name: 'Clinics', keyword: 'clinic CRM',
        title: `Clinic CRM for Patient Enquiries and Follow-ups | ${BRAND}`,
        description: 'A clinic CRM that turns calls, WhatsApp messages and web enquiries into booked appointments, with follow-up reminders and front-desk roles.',
        h1: 'A clinic CRM that turns enquiries into appointments',
        intro: 'Front desks juggle calls, WhatsApp messages and website forms. Keep every enquiry in one list, book the appointment, and make sure follow-ups and treatment reminders go out.',
        stages: ['Enquiry', 'Called back', 'Appointment booked', 'Visited', 'Treatment plan', 'Follow-up due'],
        points: [
            ['One list for every enquiry', 'Calls, WhatsApp messages and form submissions land in one place with the patient’s number matched to their existing record.'],
            ['Reminders that go out on their own', 'Stage actions and e-mail sequences send appointment and follow-up reminders and create tasks for the front desk.'],
            ['Each person sees what they need', 'Field-level permissions let the front desk handle bookings without seeing fields you mark as private.'],
        ],
        faq: [
            ['Is this an electronic medical record system?', 'No. It manages enquiries, appointments and follow-ups. Keep clinical records in your medical records system.'],
            ['Can we hide sensitive fields from some staff?', 'Yes. Roles can hide or lock individual fields, and every change is recorded in the audit log.'],
        ],
    },
    {
        slug: 'insurance-crm', name: 'Insurance & finance', keyword: 'insurance CRM',
        title: `Insurance CRM for Agents and Advisors | ${BRAND}`,
        description: 'A CRM for insurance agents and advisors. Track prospects, quotes and renewals, follow up on WhatsApp, and keep every client conversation in one place.',
        h1: 'An insurance CRM built around renewals and referrals',
        intro: 'Advisors earn on follow-through: the quote that gets chased, the renewal that gets called, the referral that gets thanked. Keep every policy conversation on the client’s record and let the pipeline do the remembering.',
        stages: ['Prospect', 'Needs analysis', 'Quote sent', 'Documents pending', 'Issued', 'Renewal due', 'Lost'],
        points: [
            ['Quotes with line items and tax', 'Prepare a quote, send it by e-mail, and convert it into a won deal linked to the customer when it is accepted.'],
            ['Every conversation in one timeline', 'Calls, e-mails, WhatsApp messages, notes and stage changes appear on the customer’s 360 view.'],
            ['A clear trail for compliance reviews', 'The audit log records who changed what and when, including sign-ins and permission changes.'],
        ],
        faq: [
            ['Can I track renewal dates?', 'Yes. Add a renewal date field and use reports or stage tasks to see which policies are due.'],
            ['Can I separate my team’s clients?', 'Give each advisor a role limited to their own records while managers see everything.'],
        ],
    },
    {
        slug: 'recruitment-crm', name: 'Recruitment', keyword: 'recruitment CRM',
        title: `Recruitment CRM for Staffing Agencies | ${BRAND}`,
        description: 'A recruitment CRM for staffing agencies. Manage clients, openings and candidates in custom pipelines, with WhatsApp and e-mail follow-up in one place.',
        h1: 'A recruitment CRM for agencies placing people every week',
        intro: 'Staffing agencies run two pipelines at once: clients with openings and candidates moving through interviews. Model both with custom objects and fields, and keep every message on the right record.',
        stages: ['Sourced', 'Screened', 'Submitted to client', 'Interview', 'Offer', 'Placed', 'Rejected'],
        points: [
            ['Build the objects you need', 'Add job openings or placements as their own record types with custom fields and layouts, linked to companies and candidates.'],
            ['Candidates answer on WhatsApp', 'Message candidates from a shared inbox, and see the whole conversation on their record.'],
            ['Recruiters keep their desks', 'Limit each recruiter to their own candidates and clients while leadership sees placements across the team.'],
        ],
        faq: [
            ['Can I add a separate candidate object?', 'Yes. The object manager lets an admin add new record types, fields and form layouts without code.'],
            ['Can I import my existing candidate database?', 'Yes. Import a CSV and map its columns to your fields.'],
        ],
    },
    {
        slug: 'travel-agency-crm', name: 'Travel', keyword: 'travel agency CRM',
        title: `Travel Agency CRM for Enquiries and Bookings | ${BRAND}`,
        description: 'A travel agency CRM that captures trip enquiries from WhatsApp, Instagram and your website, sends itinerary quotes, and tracks every booking and follow-up.',
        h1: 'A travel agency CRM from trip enquiry to booking',
        intro: 'Travellers ask on WhatsApp and Instagram and expect a quick, personal reply. Answer from one inbox, send a quote, and keep the whole trip conversation on the traveller’s record.',
        stages: ['Enquiry', 'Itinerary shared', 'Quote sent', 'Advance paid', 'Booked', 'Travelled', 'Lost'],
        points: [
            ['Instagram and WhatsApp in one place', 'Enquiries from social posts and chats arrive as leads with the source recorded, so you know which posts sell trips.'],
            ['Quotes in any currency', 'Send a quote with line items and tax in the traveller’s currency and convert it to a booking when accepted.'],
            ['Follow-ups that turn into repeat trips', 'Sequences and stage tasks remind your team about payments, documents and the next holiday.'],
        ],
        faq: [
            ['Can I send quotes in different currencies?', 'Yes. Each quote carries its own currency.'],
            ['Can I see which campaigns bring bookings?', 'Reports show leads and won bookings by source, so you can compare Instagram, WhatsApp and website enquiries.'],
        ],
    },
    {
        slug: 'b2b-sales-crm', name: 'B2B services', keyword: 'B2B sales CRM',
        title: `B2B Sales CRM for Service Companies | ${BRAND}`,
        description: 'A B2B sales CRM for service companies. Configurable pipelines with stage rules, quotes, lead scoring, assignment rules and reports that show where deals stall.',
        h1: 'A B2B sales CRM that shows where deals stall',
        intro: 'Service companies sell through calls, demos and proposals. Set the rules each stage needs, score leads automatically, and see in reports exactly where deals slow down.',
        stages: ['Lead', 'Qualified', 'Demo', 'Proposal', 'Negotiation', 'Won', 'Lost'],
        points: [
            ['Stages with rules', 'Require fields or a note before a deal moves on, and run actions such as tasks, e-mails or webhooks when it enters a stage.'],
            ['Leads scored and routed', 'Scoring rules rank leads by the fields you care about, and assignment rules send them to the right person.'],
            ['Reports for the weekly review', 'Pipeline by stage, source mix and win rate are ready to run, and you can save your own.'],
        ],
        faq: [
            ['Can I connect it to other tools?', 'Yes. Stage actions can call a webhook, and leads can be created from any tool through the ingest endpoint.'],
            ['Does it support custom fields and objects?', 'Yes. Admins can add fields, objects and form layouts without code.'],
        ],
    },
];

const HOME_FAQ = [
    ['Does it work with WhatsApp?', 'Yes. Connect the WhatsApp Business Cloud API and incoming messages create or update leads. Your team replies from a shared inbox and every message stays on the lead’s record.'],
    ['Can I run a separate pipeline for each client?', 'Yes. Each workspace has its own stages, fields, layouts and branding, so every client can follow their own process.'],
    ['Can I control what each person sees?', 'Roles set read, create, edit and delete rights per record type, can limit a person to their own records, and can hide or lock single fields. Admins can preview the app as any role before giving it out.'],
    ['Can I bring in my existing leads?', 'Yes. Import a CSV and map its columns to your fields, or send leads from other tools to the ingest endpoint.'],
    ['Is there an audit trail?', 'Every record change, sign-in, failed sign-in and permission change is logged with who did it and when.'],
];

const FEATURES = [
    ['Shared WhatsApp inbox', 'Reply from one place and keep every chat on the right lead.'],
    ['Instagram, Facebook and form capture', 'Leads arrive with their source, matched to existing records.'],
    ['Pipelines with stage rules', 'Required fields, required notes and automatic tasks, e-mails or webhooks per stage.'],
    ['Assignment and scoring', 'Round-robin or rule-based routing, and automatic lead scores.'],
    ['Customer 360', 'Calls, e-mails, chats, notes, tasks, quotes and stage history on one page.'],
    ['Quotes', 'Line items, tax and currency, e-mailed and converted into won deals.'],
    ['Roles and field permissions', 'Own-records scope, hidden or read-only fields, and preview-as-role.'],
    ['Custom objects and layouts', 'Add record types, fields and forms without writing code.'],
    ['Reports and dashboards', 'Ready-made packs for sales and service, plus your own saved reports.'],
    ['Workspaces and branding', 'A workspace per client or business unit, each with its own look.'],
];

// ── Shared chrome ────────────────────────────────────────────────────────────────────────────────
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800&family=Figtree:wght@400;500;600&display=swap" rel="stylesheet">';
const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'">`;

const head = ({ title, description, urlPath, jsonLd }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${csp}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0d2b3e">
${SITE_URL ? `<link rel="canonical" href="${SITE_URL}${urlPath}">\n<meta property="og:url" content="${SITE_URL}${urlPath}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(BRAND)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/site/mark.svg" type="image/svg+xml">
${fonts}
<link rel="stylesheet" href="/site/site.css">
${(jsonLd || []).map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>`;

const nav = () => `
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <div class="wrap nav-inner">
    <a class="brand" href="/" aria-label="${esc(BRAND)} home"><img src="/site/mark.svg" alt="" width="28" height="28"><span>${esc(BRAND)}</span></a>
    <nav aria-label="Main">
      <a href="/#industries">Industries</a>
      <a href="/#features">Features</a>
      <a href="/#faq">Questions</a>
    </nav>
    <div class="nav-cta">
      <a class="link-quiet" href="/login" data-app-link>Sign in</a>
      <a class="btn btn-accent" href="/#demo">Book a demo</a>
    </div>
  </div>
</header>`;

const footer = () => `
<footer class="footer">
  <div class="wrap footer-inner">
    <div>
      <a class="brand brand-light" href="/"><img src="/site/mark.svg" alt="" width="24" height="24"><span>${esc(BRAND)}</span></a>
      <p class="footer-note">The CRM for agencies and service businesses that sell on WhatsApp, Instagram and the web.</p>
    </div>
    <nav aria-label="Industries" class="footer-links">
      ${INDUSTRIES.map(i => `<a href="/${i.slug}">${esc(cap(i.keyword))}</a>`).join('\n      ')}
    </nav>
    <nav aria-label="Account" class="footer-links">
      <a href="/login" data-app-link>Sign in</a>
      <a href="/#demo">Book a demo</a>
      ${CONTACT_EMAIL ? `<a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>` : ''}
    </nav>
  </div>
  <div class="wrap footer-base">© ${new Date().getFullYear()} ${esc(BRAND)}</div>
</footer>
<script src="/site/site.js" defer></script>
</body>
</html>`;

const faqBlock = (items, id = 'faq', heading = 'Questions people ask') => `
<section class="section" id="${id}" aria-labelledby="${id}-h">
  <div class="wrap narrow">
    <h2 id="${id}-h">${esc(heading)}</h2>
    <div class="faq">
      ${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n      ')}
    </div>
  </div>
</section>`;

const industryOptions = INDUSTRIES.map(i => `<option>${esc(i.name)}</option>`).join('') + '<option>Something else</option>';
const demoForm = (preset = '') => `
<section class="section demo" id="demo" aria-labelledby="demo-h">
  <div class="wrap demo-inner">
    <div class="demo-copy">
      <h2 id="demo-h">See it with your own pipeline</h2>
      <p>Tell us how you sell today. We will set up a workspace with your stages and fields and walk you through it in thirty minutes.</p>
    </div>
    <form class="demo-form" data-demo-form novalidate>
      <div class="field"><label for="d-name">Your name</label><input id="d-name" name="name" autocomplete="name" required maxlength="120"></div>
      <div class="field"><label for="d-email">Work e-mail</label><input id="d-email" name="email" type="email" autocomplete="email" required maxlength="320"></div>
      <div class="field"><label for="d-company">Company</label><input id="d-company" name="company" autocomplete="organization" maxlength="160"></div>
      <div class="field"><label for="d-phone">Phone or WhatsApp</label><input id="d-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
      <div class="field field-wide"><label for="d-industry">What kind of business?</label><select id="d-industry" name="industry">${industryOptions.replace(`<option>${esc(preset)}</option>`, `<option selected>${esc(preset)}</option>`)}</select></div>
      <div class="field field-wide"><label for="d-message">How do leads reach you today? <span class="opt">(optional)</span></label><textarea id="d-message" name="message" rows="3" maxlength="2000"></textarea></div>
      <div class="hp" aria-hidden="true"><label for="d-website">Website</label><input id="d-website" name="website" tabindex="-1" autocomplete="off"></div>
      <div class="field-wide form-foot">
        <button class="btn btn-accent btn-lg" type="submit">Request a demo</button>
        <p class="form-status" role="status" aria-live="polite"></p>
      </div>
    </form>
  </div>
</section>`;

// The hero board: the one moving element on the site. Three leads arrive in "New" as the page loads.
const board = (stages, arrivals) => {
    const cols = stages.slice(0, 4);
    const sample = {
        1: [['Kite & Co.', 'Instagram ads', '₹1.8L']],
        2: [['Nova Dental', 'SEO retainer', '₹60k/mo'], ['Sharma Interiors', 'Website rebuild', '₹3.2L']],
        3: [['Brightline Tutors', 'Lead-gen campaign', '₹90k']],
    };
    return `<div class="board" aria-label="Example pipeline: three new leads arriving from WhatsApp, Instagram and a web form" role="img">
  ${cols.map((c, i) => `<div class="col">
    <div class="col-head"><span>${esc(c)}</span><span class="count">${i === 0 ? arrivals.length : (sample[i] || []).length}</span></div>
    ${i === 0 ? arrivals.map(([src, who, what], k) => `<div class="card arrive" style="--d:${0.35 + k * 0.55}s"><span class="src src-${src.toLowerCase().replace(/\s+/g, '')}">${esc(src)}</span><b>${esc(who)}</b><span>${esc(what)}</span></div>`).join('') : (sample[i] || []).map(([who, what, val]) => `<div class="card"><b>${esc(who)}</b><span>${esc(what)}</span><span class="val">${esc(val)}</span></div>`).join('')}
  </div>`).join('\n  ')}
</div>`;
};

const softwareLd = (description) => ({
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: BRAND, applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web', description,
});
const faqLd = (items) => ({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

// ── Home ─────────────────────────────────────────────────────────────────────────────────────────
function homePage() {
    const description = `${BRAND} is a CRM for agencies and service businesses. Capture WhatsApp, Instagram and web leads, run a pipeline per client, and control who sees what.`;
    return `${head({ title: `CRM for Agencies with WhatsApp and Instagram Leads | ${BRAND}`, description, urlPath: '/', jsonLd: [softwareLd(description), faqLd(HOME_FAQ)] })}
<body>
${nav()}
<main id="main">
<section class="hero" aria-labelledby="hero-h">
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <h1 id="hero-h">The CRM for agencies. Every lead from every client in one pipeline.</h1>
      <p class="lede">WhatsApp chats, Instagram and Facebook leads and website forms arrive as leads, go to the right person, and move through stages you define for each client.</p>
      <div class="hero-cta">
        <a class="btn btn-accent btn-lg" href="#demo">Book a demo</a>
        <a class="btn btn-ghost btn-lg" href="/login" data-app-link>Sign in</a>
      </div>
    </div>
    ${board(['New', 'Contacted', 'Proposal', 'Won'], [['WhatsApp', 'Meera Kapoor', '“Need a quote for reels”'], ['Instagram', 'Urban Brew Café', 'Launch campaign'], ['Web form', 'Alpine Realty', 'Lead-gen for 2 projects']])}
  </div>
</section>

<section class="channels" aria-label="Where leads come from">
  <div class="wrap channels-inner">
    <p>Leads arrive from</p>
    <ul>
      <li><span class="dot" style="--c:#25d366"></span>WhatsApp</li>
      <li><span class="dot" style="--c:#d6249f"></span>Instagram</li>
      <li><span class="dot" style="--c:#1877f2"></span>Facebook</li>
      <li><span class="dot" style="--c:#f4a621"></span>Website forms</li>
      <li><span class="dot" style="--c:#6a7886"></span>Calls</li>
      <li><span class="dot" style="--c:#0d2b3e"></span>E-mail</li>
    </ul>
  </div>
</section>

<section class="section" aria-labelledby="why-h">
  <div class="wrap">
    <h2 id="why-h" class="h-wide">Built for teams that sell for other people</h2>
    <div class="rows">
      <div class="row">
        <h3>Keep every client apart</h3>
        <p>Give each client a workspace with its own pipeline, fields, forms and colours. Your team switches between them; clients never see each other.</p>
      </div>
      <div class="row">
        <h3>Decide who sees what</h3>
        <p>Limit account managers to their own leads, hide fields such as budgets from juniors, and preview the app as any role before you hand out a login.</p>
      </div>
      <div class="row">
        <h3>Stop chasing follow-ups</h3>
        <p>Stage rules ask for the right details before a deal moves on, create the next task automatically, and send e-mail sequences while your team sleeps.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section-tint" id="industries" aria-labelledby="ind-h">
  <div class="wrap">
    <h2 id="ind-h">Made for how your business sells</h2>
    <ul class="index">
      ${INDUSTRIES.map(i => `<li><a href="/${i.slug}"><span class="index-name">${esc(i.name)}</span><span class="index-stages">${esc(i.stages.slice(0, 4).join(', '))}…</span></a></li>`).join('\n      ')}
    </ul>
  </div>
</section>

<section class="section" id="features" aria-labelledby="feat-h">
  <div class="wrap">
    <h2 id="feat-h">What is included</h2>
    <dl class="features">
      ${FEATURES.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('\n      ')}
    </dl>
  </div>
</section>
${faqBlock(HOME_FAQ)}
${demoForm()}
</main>
${footer()}`;
}

// ── Industry page ────────────────────────────────────────────────────────────────────────────────
function industryPage(ind) {
    const crumbs = SITE_URL ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: BRAND, item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: ind.keyword, item: `${SITE_URL}/${ind.slug}` },
    ] }] : [];
    const others = INDUSTRIES.filter(i => i.slug !== ind.slug);
    return `${head({ title: ind.title, description: ind.description, urlPath: `/${ind.slug}`, jsonLd: [softwareLd(ind.description), faqLd(ind.faq), ...crumbs] })}
<body>
${nav()}
<main id="main">
<section class="hero hero-sub" aria-labelledby="hero-h">
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <p class="crumb"><a href="/">${esc(BRAND)}</a> <span aria-hidden="true">/</span> ${esc(ind.name)}</p>
      <h1 id="hero-h">${esc(ind.h1)}</h1>
      <p class="lede">${esc(ind.intro)}</p>
      <div class="hero-cta">
        <a class="btn btn-accent btn-lg" href="#demo">Book a demo</a>
        <a class="btn btn-ghost btn-lg" href="/login" data-app-link>Sign in</a>
      </div>
    </div>
    <div class="stages" aria-label="Example ${esc(ind.name.toLowerCase())} pipeline">
      <p class="stages-title">A typical ${esc(ind.name.toLowerCase())} pipeline</p>
      <ol>${ind.stages.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="stages-note">Rename, add or remove stages to match how you work.</p>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="how-h">
  <div class="wrap">
    <h2 id="how-h" class="h-wide">How ${esc(BRAND)} helps</h2>
    <div class="rows">
      ${ind.points.map(([t, d]) => `<div class="row"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="section section-tint" aria-labelledby="feat-h">
  <div class="wrap">
    <h2 id="feat-h">Everything in one workspace</h2>
    <dl class="features">
      ${FEATURES.slice(0, 6).map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('\n      ')}
    </dl>
  </div>
</section>
${faqBlock(ind.faq, 'faq', `${ind.keyword}: questions`)}
${demoForm(ind.name)}
<section class="section related" aria-labelledby="rel-h">
  <div class="wrap">
    <h2 id="rel-h">Also used by</h2>
    <ul class="related-list">${others.map(o => `<li><a href="/${o.slug}">${esc(cap(o.keyword))}</a></li>`).join('')}</ul>
  </div>
</section>
</main>
${footer()}`;
}

// ── Assets ───────────────────────────────────────────────────────────────────────────────────────
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0d2b3e"/><path d="M8 10h16M8 16h11M8 22h6" stroke="#f4a621" stroke-width="3" stroke-linecap="round"/></svg>`;

const CSS = String.raw`:root{
  --harbour:#0d2b3e; --harbour-2:#123a52; --porcelain:#f5f7f8; --paper:#ffffff;
  --graphite:#253341; --fog:#5f6d7b; --rule:#dde3e8; --saffron:#f4a621; --saffron-deep:#d98e0f;
  --display:"Bricolage Grotesque", "Segoe UI", system-ui, sans-serif;
  --body:"Figtree", "Segoe UI", system-ui, sans-serif;
  --r-sm:6px; --r-md:10px; --r-lg:16px;
}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
[id]{scroll-margin-top:84px}
body{margin:0;background:var(--porcelain);color:var(--graphite);font:400 17px/1.6 var(--body);text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
a{color:inherit}
:focus-visible{outline:3px solid var(--saffron);outline-offset:2px;border-radius:4px}
.wrap{width:min(1160px,100% - 32px);margin-inline:auto}
.narrow{width:min(760px,100% - 32px)}
.skip{position:absolute;left:-9999px;top:8px;background:var(--saffron);color:var(--harbour);padding:8px 14px;border-radius:var(--r-sm);font-weight:600;z-index:10}
.skip:focus{left:16px}

h1,h2,h3{font-family:var(--display);color:var(--harbour);margin:0;letter-spacing:-.02em;font-variation-settings:"wdth" 88}
h1{font-size:clamp(38px,5.4vw,64px);line-height:1.02;font-weight:750}
h2{font-size:clamp(28px,3.2vw,40px);line-height:1.1;font-weight:700;margin-bottom:28px}
h3{font-size:22px;line-height:1.25;font-weight:650}
p{margin:0}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 20px;border-radius:999px;font:600 15px/1 var(--body);text-decoration:none;border:1.5px solid transparent;cursor:pointer;transition:background-color .15s,border-color .15s,color .15s}
.btn-lg{height:52px;padding:0 26px;font-size:16px}
.btn-accent{background:var(--saffron);color:var(--harbour)}
.btn-accent:hover{background:var(--saffron-deep)}
.btn-ghost{border-color:rgba(255,255,255,.45);color:#fff}
.btn-ghost:hover{border-color:#fff;background:rgba(255,255,255,.08)}
.btn[disabled]{opacity:.6;cursor:progress}
.link-quiet{text-decoration:none;font-weight:600;font-size:15px}
.link-quiet:hover{text-decoration:underline}

.nav{position:sticky;top:0;z-index:5;background:rgba(245,247,248,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--rule)}
.nav-inner{display:flex;align-items:center;gap:28px;height:68px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:700 20px/1 var(--display);color:var(--harbour);letter-spacing:-.02em}
.brand-light{color:#fff}
.nav nav{display:flex;gap:24px;margin-right:auto}
.nav nav a{text-decoration:none;font-weight:500;font-size:15px;color:var(--graphite)}
.nav nav a:hover{color:var(--harbour);text-decoration:underline}
.nav-cta{display:flex;align-items:center;gap:18px;color:var(--harbour)}

.hero{background:var(--harbour);color:#e6edf2;padding:72px 0 80px;overflow:hidden}
.hero h1{color:#fff}
.hero-inner{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:48px;align-items:center}
.lede{font-size:19px;line-height:1.6;margin-top:22px;max-width:56ch;color:#c9d6df}
.hero-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.hero-sub{padding:56px 0 64px}
.crumb{font-size:14px;color:#9fb3c1;margin-bottom:14px}
.crumb a{color:#c9d6df}

.board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;background:var(--harbour-2);border:1px solid rgba(255,255,255,.08);border-radius:var(--r-lg);padding:14px}
.col{display:flex;flex-direction:column;gap:8px;min-width:0}
.col-head{display:flex;justify-content:space-between;align-items:center;font:600 13px/1 var(--body);color:#9fb3c1;padding:4px 4px 6px}
.count{background:rgba(255,255,255,.1);color:#e6edf2;border-radius:999px;padding:3px 8px;font-size:12px}
.card{background:var(--paper);color:var(--graphite);border-radius:var(--r-md);padding:10px 11px;display:flex;flex-direction:column;gap:3px;font-size:13px;line-height:1.35;min-width:0}
.card b{color:var(--harbour);font-weight:600;font-size:13.5px;overflow-wrap:anywhere}
.card span{color:var(--fog);overflow-wrap:anywhere}
.card .val{color:var(--harbour);font-weight:600}
.src{align-self:flex-start;font:600 11px/1 var(--body);padding:4px 7px;border-radius:999px;margin-bottom:3px;color:#fff !important}
.src-whatsapp{background:#1f9e50}.src-instagram{background:#b81d86}.src-webform{background:#b36b00}
.arrive{animation:arrive .7s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d)}
@keyframes arrive{from{opacity:0;transform:translateX(-36px) scale(.96)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.arrive{animation:none}html{scroll-behavior:auto}}

.stages{background:var(--harbour-2);border-radius:var(--r-lg);padding:26px 28px;border:1px solid rgba(255,255,255,.08)}
.stages-title{font-weight:600;color:#fff;margin-bottom:14px}
.stages ol{list-style:none;margin:0;padding:0;counter-reset:s;display:flex;flex-direction:column;gap:2px}
.stages li{counter-increment:s;display:flex;gap:14px;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.08);color:#e6edf2}
.stages li::before{content:counter(s);width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:rgba(244,166,33,.16);color:var(--saffron);font:600 13px/1 var(--body);flex:none}
.stages-note{font-size:14px;color:#9fb3c1;margin-top:14px}

.channels{background:var(--paper);border-bottom:1px solid var(--rule)}
.channels-inner{display:flex;align-items:center;gap:28px;padding:22px 0;flex-wrap:wrap}
.channels p{font-weight:600;color:var(--harbour)}
.channels ul{list-style:none;display:flex;flex-wrap:wrap;gap:10px 26px;margin:0;padding:0;color:var(--graphite);font-weight:500}
.channels li{display:flex;align-items:center;gap:8px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--c)}

.section{padding:88px 0}
.section-tint{background:var(--paper);border-block:1px solid var(--rule)}
.h-wide{max-width:22ch}
.rows{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 48px;border-top:2px solid var(--harbour);padding-top:28px}
.row p{margin-top:10px;color:var(--fog);max-width:46ch}

.index{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule)}
.index a{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:24px;align-items:baseline;padding:20px 4px;border-bottom:1px solid var(--rule);text-decoration:none;transition:background-color .15s}
.index a:hover{background:var(--porcelain)}
.index-name{font:700 clamp(24px,2.6vw,32px)/1.1 var(--display);color:var(--harbour);letter-spacing:-.02em;font-variation-settings:"wdth" 88}
.index a:hover .index-name{text-decoration:underline;text-decoration-color:var(--saffron);text-decoration-thickness:3px;text-underline-offset:6px}
.index-stages{color:var(--fog)}

.features{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 56px;margin:0}
.features div{padding:18px 0;border-bottom:1px solid var(--rule)}
.features dt{font-weight:600;color:var(--harbour)}
.features dd{margin:4px 0 0;color:var(--fog)}

.faq{border-top:1px solid var(--rule)}
.faq details{border-bottom:1px solid var(--rule);padding:4px 0}
.faq summary{cursor:pointer;list-style:none;padding:18px 36px 18px 0;font-weight:600;color:var(--harbour);position:relative;font-size:18px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"";position:absolute;right:6px;top:50%;width:10px;height:10px;border-right:2px solid var(--harbour);border-bottom:2px solid var(--harbour);transform:translateY(-70%) rotate(45deg);transition:transform .2s}
.faq details[open] summary::after{transform:translateY(-30%) rotate(225deg)}
.faq details p{padding:0 0 20px;color:var(--fog);max-width:65ch}

.demo{background:var(--harbour);color:#e6edf2}
.demo h2{color:#fff}
.demo-inner{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:56px;align-items:start}
.demo-copy p{color:#c9d6df;max-width:42ch}
.demo-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px;background:var(--paper);color:var(--graphite);border-radius:var(--r-lg);padding:28px}
.field{display:flex;flex-direction:column;gap:6px}
.field-wide{grid-column:1/-1}
.field label{font-weight:600;font-size:14px;color:var(--harbour)}
.opt{font-weight:400;color:var(--fog)}
.field input,.field select,.field textarea{font:400 16px/1.4 var(--body);color:var(--graphite);border:1.5px solid var(--rule);border-radius:var(--r-md);padding:11px 12px;background:var(--paper);width:100%}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--harbour);outline:none;box-shadow:0 0 0 3px rgba(244,166,33,.35)}
.field [aria-invalid="true"]{border-color:#c0392b}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.form-foot{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.form-status{font-size:15px}
.form-status.ok{color:#1d7a46;font-weight:600}
.form-status.err{color:#b03a2e;font-weight:600}

.related-list{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:10px}
.related-list a{display:inline-block;padding:9px 16px;border:1.5px solid var(--rule);border-radius:999px;text-decoration:none;font-weight:500;background:var(--paper)}
.related-list a:hover{border-color:var(--harbour)}

.footer{background:#081e2c;color:#9fb3c1;padding:56px 0 28px}
.footer-inner{display:grid;grid-template-columns:1.2fr 1.4fr .8fr;gap:40px}
.footer-note{margin-top:14px;max-width:34ch;font-size:15px}
.footer-links{display:flex;flex-direction:column;gap:9px;font-size:15px}
.footer-links a{text-decoration:none;color:#c9d6df}
.footer-links a:hover{text-decoration:underline}
.footer-base{margin-top:44px;padding-top:20px;border-top:1px solid rgba(255,255,255,.08);font-size:14px}

@media (max-width:1180px){
  .board{grid-template-columns:repeat(3,minmax(0,1fr))}
  .board .col:nth-child(3){display:none}
}
@media (max-width:960px){
  .hero-inner,.demo-inner{grid-template-columns:1fr;gap:40px}
  .rows{grid-template-columns:1fr;gap:28px}
  .footer-inner{grid-template-columns:1fr 1fr}
  .nav nav{display:none}
  .nav-cta{margin-left:auto}
}
@media (max-width:640px){
  body{font-size:16px}
  .section{padding:64px 0}
  .hero{padding:48px 0 56px}
  .board{grid-template-columns:repeat(2,minmax(0,1fr))}
  .board .col:nth-child(n+3){display:none}
  .features,.demo-form{grid-template-columns:1fr}
  .index a{grid-template-columns:1fr;gap:4px}
  .footer-inner{grid-template-columns:1fr}
  .nav-cta .link-quiet{display:none}
}
`;

const JS = String.raw`// Demo form and the "Sign in / Open app" link. Plain script, no build step.
(function () {
  try {
    if (localStorage.getItem('flowcrm_session')) {
      document.querySelectorAll('[data-app-link]').forEach(function (a) { a.textContent = 'Open app'; a.setAttribute('href', '/app'); });
    }
  } catch (e) {}

  var form = document.querySelector('[data-demo-form]');
  if (!form) return;
  var status = form.querySelector('.form-status');
  var button = form.querySelector('button[type="submit"]');
  var say = function (text, kind) { status.textContent = text; status.className = 'form-status ' + (kind || ''); };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
    var bad = null;
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    if (!data.name) bad = form.querySelector('#d-name');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) bad = form.querySelector('#d-email');
    if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); say(bad.id === 'd-name' ? 'Add your name.' : 'Add a valid work e-mail.', 'err'); return; }
    Object.keys(data).forEach(function (k) { if (data[k] === '' && k !== 'website') delete data[k]; });
    button.disabled = true; say('Sending…');
    fetch('/api/public/demo-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { form.reset(); say('Thanks. We will reply within one working day.', 'ok'); }
        else say((res.j.details && res.j.details[0]) || res.j.error || 'That did not go through. Try again in a moment.', 'err');
      })
      .catch(function () { say('No connection. Check your internet and try again.', 'err'); })
      .then(function () { button.disabled = false; });
  });
})();
`;

// ── Write ────────────────────────────────────────────────────────────────────────────────────────
const write = (rel, content) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
write('index.html', homePage());
for (const ind of INDUSTRIES) write(`public/${ind.slug}.html`, industryPage(ind));
write('public/site/site.css', CSS);
write('public/site/site.js', JS);
write('public/site/mark.svg', MARK);
write('public/robots.txt', `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /login\nDisallow: /reset-password\nDisallow: /form/\n${SITE_URL ? `\nSitemap: ${SITE_URL}/sitemap.xml\n` : ''}`);
const sitemapPath = path.join(ROOT, 'public/sitemap.xml');
if (SITE_URL) {
    const today = new Date().toISOString().slice(0, 10);
    write('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', ...INDUSTRIES.map(i => `/${i.slug}`)].map(u => `  <url><loc>${SITE_URL}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
} else if (fs.existsSync(sitemapPath)) fs.unlinkSync(sitemapPath);
console.log(`Site built for ${BRAND}: home + ${INDUSTRIES.length} industry pages${SITE_URL ? ` (canonical ${SITE_URL})` : ' (set SITE_URL for canonical tags and sitemap.xml)'}`);
