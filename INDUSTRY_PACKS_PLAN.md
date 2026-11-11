# Industry packs plan: property (inventory, builders), agencies, and the rest

Status: **Phases 1 and 2 built and tested (sections 6a and 6b); phases 3 to 6 are still plan only.** Builds on `CONFIGURATION_ROADMAP.md` (field triggers, formulas, record scope and layout-driven detail pages are already done and are the foundation).

## 1. What Journeys (Autoflow) are, where to see them, and what is missing

**Where:** sidebar → Configuration → **Journeys** (admins only). Drip e-mail campaigns are separate, under Sequences.

**What it is for:** doing something *after* a record changes. Pick a record type, pick when it fires (created, updated, deleted), set conditions, then list actions. Example: new Lead from "Web" with budget above 50 lakh → assign to the senior team, e-mail the lead, create a task "call within 1 hour".

**What works today (checked in the code):**
- Triggers: record created, updated, deleted.
- Conditions on the trigger: a list of rules joined by **all** (AND) or **any** (OR). Per-rule operators include is, is not, contains, does not contain, greater, less, is empty, has a value.
- Actions that really run: send e-mail, update the record, create a task, create a lead, create any record.

**What does not work, even though the screen suggests it does:**

| On screen | Reality |
|---|---|
| "Check Condition" branch box | Decorative. The canvas draws two paths but the server runs one flat list; there is no if / else. |
| "Wait / Delay" box | Skipped. The server logs "wait skipped" and carries on, so a "wait 2 days then follow up" journey sends everything immediately. |
| AND / OR / NOT | Only one level: all-of or any-of. No NOT group, no groups inside groups. "(A and B) or (C and not D)" cannot be expressed. |
| History | No record of which journey ran on which record, or whether it failed. |

**Your "AND / OR / NOT gate" question:** a gate is a condition block that combines tests. AND passes only if every test is true, OR passes if any one is, NOT flips the result, and gates can sit inside gates. Field Triggers and Journeys both need this. Proposed shape (one engine used by both):

```
GATE  all-of
 ├─ Budget  ≥ 5000000
 ├─ GATE any-of
 │    ├─ Source is "Referral"
 │    └─ Source is "Channel partner"
 └─ GATE not
      └─ City is "Other"
```

**Journey upgrade (needed before property and agency journeys are worth installing):**
1. Nested condition gates (AND / OR / NOT) with a readable summary line.
2. Real If / Else branches: one path per outcome, each with its own actions.
3. **Real waits**: stored in a job table (`journey_runs`, due time, step), picked up by the scheduler already used for sequences, so a wait survives a restart.
4. Run history per record ("which steps ran, when, result") and failure alerts to the owner.
5. Test run on one sample record, showing each step's outcome without sending anything.
6. More triggers: a date field arrives (renewal date minus 30 days), status changed to X, field changed, and a record not touched for N days.
7. More actions: notify a user, assign owner, send WhatsApp (connector exists), call a webhook.

## 2. The idea: industry packs

A **pack** is a one-click bundle for a business type: objects, fields, layouts, relationships, pipelines, roles with record scope, field triggers, journeys, a dashboard and menu entries. The admin opens Settings → Industry packs, sees a preview ("adds 7 objects, 64 fields, 4 roles, 6 journeys"), approves, and it installs. It only adds; it never overwrites what the workspace already has. The same installer is what the AI configuration assistant will later drive, so building packs also builds that foundation.

### 2.1 Engine pieces every pack needs (build first)

| Piece | Why |
|---|---|
| New field types: **multi-select, checkbox, date-time, percent, rating, user picker, auto-number** (`UNIT-0001`, `BKG-2026-0001`) | Property and agency data needs them; today there are text, number, currency, email, phone, select, status, textarea, lookup, date, formula |
| **Related lists** on detail pages (a Project page lists its Units, a Client page lists its Projects) | Without it, objects are islands. Relationships exist as data but are not shown |
| **Roll-up fields** (count, sum, latest of child records) | "Units available" on a Project, "Collected so far" on a Booking, "Hours used" on a Retainer |
| **Unique fields** | Unit number unique per tower, RERA number unique |
| Journeys upgrade (section 1) | Holds expire, payments fall due, renewals approach |
| Pack installer + preview + audit + uninstall of untouched items | Safe one-click set-up |

### 2.2 Money and region defaults

INR with lakh / crore grouping, GST fields (GSTIN, tax %), area in sq ft / sq m with a rate per area formula, RERA registration number, carpet / built-up / super built-up area. Currency formatting already exists in the app.

## 3. Property pack (developers, builders, brokers, rental managers)

Objects (new unless marked existing):

| Object | Key fields |
|---|---|
| **Project** | name, developer (lookup), city, locality, address, project type (residential / commercial / plotted / mixed), RERA number, launch date, possession date, status (Upcoming / Launched / Under construction / Ready / Completed), total units, **units available / blocked / booked / sold (roll-ups)**, amenities (multi-select), brochure (file), location link |
| **Developer / Builder** (customer record type) | company, GSTIN, RERA agent / promoter number, projects count (roll-up), contact person, commission terms |
| **Tower / Block** | project (lookup), name, floors, units per floor, status |
| **Unit (inventory)** | unit number (auto), project, tower, floor, **configuration** (1 / 2 / 3 BHK, plot, shop), facing, carpet area, built-up area, super built-up area, **rate per area**, **base price (formula = area × rate)**, floor-rise, PLC, parking, **total price (formula)**, **status (Available / Hold / Blocked / Booked / Sold / Not for sale)**, hold-until (date-time), held by (user), photos / floor plan |
| **Lead** (existing, extended) | enquiry for (project, lookup), configuration wanted (multi-select), budget min / max, preferred locality, purpose (self-use / investment), funding (self / loan), loan pre-approved, timeline to buy, source, **channel partner** (lookup), site-visit status, family size, current residence |
| **Channel Partner / Broker** | firm, RERA number, contact, commission %, leads sent / bookings (roll-ups), status |
| **Site Visit** | lead, project, date-time, accompanied by (user), outcome (Liked / Needs follow-up / Not interested), feedback, units shown |
| **Booking** | booking number (auto), lead / customer, unit (lookup), booking date, token amount, payment plan (Construction-linked / Time-linked / Down payment), agreement value (formula), discount, **status (Token / Agreement / Registered / Cancelled)**, sales executive, channel partner, commission (formula) |
| **Payment Schedule / Installment** | booking, milestone (Booking / Agreement / Slab 1…/ Possession), due date, amount, GST, received amount, received date, **status (Upcoming / Due / Overdue / Paid)**, mode, reference |
| **Rental (for managers)**: Property, Tenant, Lease, Rent invoice | property, rent, deposit, lease start / end, escalation %, status |

Pipelines (process stages): Lead → New → Contacted → Site visit scheduled → Site visited → Negotiation → Booked → Lost. Booking → Token → Agreement → Registered → Possession.

Triggers (before save): booking created → unit status = Booked; booking cancelled → unit back to Available; hold-until set → status Hold; total price and commission formulas; payment overdue when due date passed and not paid.

Journeys: site-visit reminder (day before, 2 hours before); hold expires → unit released and owner told; instalment due in 7 days → reminder to customer and RM; instalment overdue → task to collections; 30 days no activity on a hot lead → alert the team lead; new channel-partner lead → acknowledge and assign.

Roles (using own / team scope already built): **Sales executive** (own leads, read all inventory); **Team lead** (team scope); **Channel partner** (own leads only, sees availability, no prices of other partners, no customer data of others); **Inventory manager** (edit units, no deals); **Accounts** (payments, read bookings); **Management** (all, reports).

Reports and dashboard: inventory by project and status, sales funnel by project and source, site-visit to booking conversion, collections due and overdue, channel-partner performance, price band demand, RM leaderboard. **Live availability page** through the Web Presenter (already safe to publish with chosen fields): unit, floor, configuration, area, price band, status.

## 4. Agency pack (digital, creative, marketing, consulting)

| Object | Key fields |
|---|---|
| **Client** (customer, extended) | company, industry, size, billing contact, GSTIN, account lead, contract start, health (Green / Amber / Red), lifetime value (roll-up), source |
| **Contact** (new object) | name, client, role, decision maker (checkbox), e-mail, phone, LinkedIn |
| **Opportunity / Proposal** | client, services (multi-select), value, probability %, weighted value (formula), expected close, stage (Lead / Discovery / Proposal sent / Negotiation / Won / Lost), lost reason, competitor |
| **Project** | client, type, start, end, budget, billing (fixed / retainer / time and material), status, project manager, hours budget, hours used (roll-up), **margin (formula)** |
| **Deliverable** | project, owner, due date, status (Planned / In progress / In review / Approved / Delivered), client approval (checkbox + date), file |
| **Retainer** | client, monthly fee, hours included, hours used (roll-up), renewal date, auto-renew, status |
| **Time entry** | person, project, date, hours, billable, rate, cost (formula) |
| **Invoice** | number (auto), client, project, amount, GST, issue / due date, status (Draft / Sent / Partially paid / Paid / Overdue) |
| **Service catalogue** (product, extended) | service, unit, rate, tax % |

Journeys: proposal sent → wait 3 days → follow-up → wait 4 days → task for the account lead; deliverable in review for 2 days → remind client; retainer renewal − 30 / − 7 days; hours used above 90% of retainer → alert the account lead (over-servicing); invoice overdue → reminder and task.

Roles: Account manager (own / team clients), Project manager, Finance, Leadership. Reports: pipeline by service, retainer revenue, utilisation, over-servicing, project margin, renewals due.

## 5. The other industries on the website

Same engine, later: **Education** (Enquiry, Course, Batch, Admission, Fee instalment), **Clinics** (Patient, Appointment, Visit, Treatment plan, Follow-up), **Insurance** (Policy, Renewal, Claim, Commission), **Recruitment** (Candidate, Job opening, Submission, Interview, Placement), **Travel** (Enquiry, Itinerary, Booking, Supplier, Payment), **B2B sales** (Account, Contact, Opportunity, Quote, Contract).

## 6. Phases

| Phase | Work | Result |
|---|---|---|
| **1. Engine** | Gates (AND / OR / NOT) in the condition builder; new field types and auto-numbers; related lists and roll-ups on detail pages; unique fields | Objects can be linked and show live totals |
| **2. Journeys that work** | Real waits and If / Else branches, run history, test run, date and status triggers, notify and assign actions | The journeys in sections 3 and 4 can run |
| **3. Pack installer** | Preview, install, audit, add-only; Settings → Industry packs; pack chosen when a workspace is created | One click installs a pack |
| **4. Property pack** | Everything in section 3 | Property workspaces ready |
| **5. Agency pack** | Everything in section 4 | Agency workspaces ready |
| **6. Other packs + AI assistant** | Remaining industries; the assistant drafts a custom pack from a description and uses the same installer | Any business can start in minutes |

Phases 1 and 2 are the larger share of the work; packs themselves are mostly data once the engine exists.

## 6a. Phase 1 status (built)

| Item | State |
|---|---|
| AND / OR / NOT gates, nested up to 5 levels, one engine for Field Triggers and Journeys, old rules still work | Done, tested |
| New field types: multi-select, checkbox, date-time, percent, rating, user, auto-number (prefix, digits, never reused) | Done, tested (form, list, detail page, CSV export, import) |
| Unique fields (case-insensitive; also enforced on CSV import) | Done, tested |
| Related lists on Lead, Customer and every other record page (they appear automatically when a Lookup field links back) | Done, checked in the browser |
| Roll-ups: count / total / average / lowest / highest of linked records, with an optional filter | Done, tested. Counts every linked record in the workspace, whatever the viewer may open |
| Choices editor for dropdown and multi-select fields in Form Designer | Done (dropdowns had no way to edit their choices before) |
| Schema checks (multi-select needs choices, rating scale, duplicate names, roll-up wiring) | Done |
| Fixed on the way: Journeys used one shared id for every workspace, so one workspace's save overwrote another's | Fixed. Still **one Journey per workspace**; several Journeys come in Phase 2 |
| Fixed on the way: CSV-imported records had no owner, so a role limited to Own could not see its own imports | Fixed |

Not in Phase 1 (moved to Phase 2): roll-ups in reports, roll-up values usable in formulas and triggers, an "add new" button inside a related list.

## 6b. Phase 2 status (built): Journeys that really work

| Item | State |
|---|---|
| Many journeys per workspace: list, on/off switch, edit, delete (Configuration → Journeys) | Done, tested |
| **Real waits** (minutes, hours, days), stored in the database and resumed by the scheduler every minute, so they survive a restart | Done, tested |
| **Real If / Else** branches (YES and NO paths) using the AND / OR / NOT gates | Done, tested |
| "Stop early when" condition, checked when a wait ends (for example the lead is Won) | Done, tested |
| Run history: every start is a run with a step log; per-journey Runs panel and a Journeys card on Lead, Customer and every record page | Done, tested |
| Test on a record: shows the path the journey would take, sends and changes nothing | Done, tested, checked in the browser |
| New triggers: status changes (to a chosen status), a field changes, a date arrives (n days before / after a date field), no activity for n days; delete trigger now works from the pipeline too | Done, tested |
| New actions: notify a user, assign owner (a person or the assignment rules), WhatsApp message, webhook (internal addresses refused) | Done, tested |
| Failure handling: a failed step ends the run, marks it failed, and notifies whoever built the journey | Done, tested |
| Editing a journey never changes runs already waiting (each run keeps the version it started with); deleting a journey stops its waiting runs | Done, tested |
| Saving checks: exactly one start trigger, no loops, one way out per step (two for If / Else), valid fields, waits, e-mails, webhooks | Done, tested (18 refusals) |
| Loop protection: a journey is never restarted on a record it is already working on, and cascades stop after 3 levels | Done, tested |
| Old single journey per workspace migrated automatically; the old /api/workflows address still works | Done |

Fixed on the way: **the notification bell never worked** (the server never recorded who the signed-in user was, so every user saw an empty list and notes had no author); an update-triggered journey with an update step looped forever before the loop protection.

Not in Phase 2: "wait until a date" (only a length of time), parallel paths (a step has one way out), retrying a failed step, e-mail templates, and a journey library of ready-made examples (those arrive with the packs).

## 7. Decisions needed

1. Build property first, agencies first, or both together (they share phases 1 to 3)?
2. Channel partners: should they log in to a restricted view (needs a "partner" role and an invite flow), or only submit leads through a form?
3. Rental management in the property pack, or sales only for now?
4. India-specific defaults (INR lakh / crore, GST, RERA) on by default for new workspaces?
