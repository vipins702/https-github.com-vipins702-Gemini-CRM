# Lead module: review and new concept

Status: review done 2026-11-14; items marked **Done** shipped with it. Everything else is a proposal to decide on.
Method: read the lead code (save path, import, web forms, WhatsApp, calls, scoring, assignment, pipeline, Lead 360, reports) and compared it with how mature CRMs run a lead process (speed-to-lead, work queues, cadences, qualification, conversion). The comparison is from general CRM practice, not a benchmark of one vendor.

## 1. What was wrong with duplicates, and what changed (Done)

| Before | Now |
|---|---|
| Only a browser warning on leaving the phone box, and that banner was drawn on the list page, not on the form | The server decides. Saving a record that already exists returns the match, and the form shows it |
| Import skipped exact e-mail / phone text matches (so `+91 98765 43210` and `098765 43210` were two people) | One matching engine for every channel: e-mail ignoring case, phone on the last 10 digits, other text ignoring case, spacing and punctuation |
| Web form, website demo request, webhook capture, calls and WhatsApp each inserted records their own way (the web form skipped score, owner and journeys) | One intake path (`server/services/recordIntake.js`): duplicate rule, field triggers, auto numbers, score, owner, "created" journeys |
| Nothing could be changed per object | Per object (Object Manager, Duplicates): on/off, rules of 1 to 4 fields, "also look in" other objects (a new lead may be a customer), warn or block, and what automated channels do (fill the existing record, skip, create anyway) |
| Existing duplicates stayed | Scan finds groups, suggests the fullest record to keep, merge fills its blanks, moves tasks / cases / notes / messages / history to it and removes the rest |

Limits: matching reads the object's records in memory (fine to tens of thousands per workspace; a key table is the next step beyond that). Merge is admin-only and cannot be undone.

## 2. Forms (Done)

- Phone: country (searchable, with dial code) then the number. Stored as `+<dial><digits>`. Starts in the workspace country (Settings > Country, else locale / currency, else the browser).
- Address: its own type (street, line 2, city, state / UT, postal code, country); India and US get a state list; PIN is checked as a hint. Older text addresses still show (as line 1). Lead and customer `address` upgrade once per workspace, only if the field is still the shipped textarea.
- Inputs: every `<input>` without a `type` now gets the same design as the rest (many screens drew the old look because of that), invalid fields show a red state, long lists (more than 8 options) are searchable.

## 3. Gaps found in the lead module

Severity: **H** loses or delays business, **M** slows people down, **L** polish.

| # | Area | What exists | Gap | Sev |
|---|---|---|---|---|
| 1 | Speed to lead | New leads get an owner (rules, then round-robin) | No first-response clock, no due time, no alert or reassignment when nobody replies. Nothing tells you a lead is 3 days old and untouched | H |
| 2 | Work queue | Lists, a kanban pipeline, a bell for notifications | No "my day": new, overdue follow-ups, who replied on WhatsApp. People must hunt through lists | H |
| 3 | Next step | Tasks exist; AI follow-up tasks are generated after a note | A lead can sit with no next activity. Nothing requires one when the stage changes | H |
| 4 | Activity | Notes, calls (CTI), WhatsApp, e-mail show on the timeline | No outcome on a call (connected, no answer, wrong number, call back), no meetings, no "last activity" or "last contacted" kept on the lead, so lists cannot sort or filter by it | H |
| 5 | Lost reasons | Stage change can require a note | No structured lost reason, so reports cannot say why leads are lost | M |
| 6 | Scoring | Field-based rules, clamped 0 to 100 | No engagement (replied, opened, visited, called), no decay when a lead goes quiet, no separate fit vs interest | M |
| 7 | Routing | Rules by field, else round-robin over users who can open leads | No capacity or working hours, nobody skipped on leave, no territory / language / skill, no fairness by lead quality | M |
| 8 | Conversion | Lead becomes a Customer record plus an upsell task | No contact + account + opportunity (deal) split, no amount / close date / forecast at conversion, no check that the lead is qualified | M |
| 9 | Consent | None | No opt-in / do-not-contact flags, no record of consent for WhatsApp, e-mail or calls (legal exposure; Meta also expects opt-in) | H |
| 10 | Source tracking | `source` field; web-form leads now keep their form id | No UTM / ad / campaign capture, no cost per lead, so source reports show volume, not return | M |
| 11 | Bulk work | Import; campaigns send to a segment | No multi-select on lists: assign, change stage, tag, delete, send WhatsApp in bulk | M |
| 12 | Views | Search and status filter | No saved views or filters ("Hot, no activity for 7 days"), no tags | M |
| 13 | Capture channels | Web form, website demo, a generic webhook, CSV, WhatsApp, calls | Facebook / Instagram: Integrations can save the credentials, but nothing reads leads or messages from them yet. No e-mail-to-lead | M |
| 14 | WhatsApp | Inbound, replies, lead from a new number (named properly), task / note / convert from the chat | Free text works only inside Meta's 24-hour window; no template picker, no media, senders without a phone number (usernames) are not stored | M |
| 15 | Reporting | Leads by source, conversion rate, funnel on the dashboard | No speed-to-lead, no aging, no funnel by owner or source, no lost-reason report | M |
| 16 | Data quality | Duplicates handled (above) | No required fields per stage, no enrichment, no invalid-number / bounced-e-mail flag | L |
| 17 | Lead 360 | Header, stage progress, notes, related lists, journeys | Dense: no single "what to do next" panel, no health (age, last touch, score trend), no merge or "link to customer" action | L |
| 18 | Permissions | Own / team / all per object | WhatsApp inbox and lists respect it now; reports and exports not audited in this pass | L |
| 19 | Automation | Journeys (waits, If / Else), field triggers, sequences | No journey trigger "incoming WhatsApp message" or "no activity for N days" | M |
| 20 | Mobile | Responsive pages | Not assessed; no push for new-lead alerts | L |

## 4. The new concept: a lead is a promise with a clock

Today the lead module is a **list of records**. A sales team needs a **process that pushes work to people**. The concept below changes the unit of work from "a record someone may open" to "a lead with an owner, a next step and a clock".

### 4.1 Lifecycle

```
CAPTURE ──> CLEAN ──> ROUTE ──> WORK ──> QUALIFY ──> CONVERT
 any channel  dedupe,    owner +    cadence   score +     contact + account
              normalise  due time   of steps  criteria    + opportunity
                                       │
                                       └──> LOST (reason) ──> NURTURE (re-enter later)
```

Rules the process enforces:
1. Every lead has an **owner** and a **first-response due time** from the moment it lands.
2. An open lead always has a **next activity with a date**. Changing stage asks for one.
3. A lead is **qualified** by criteria the workspace defines (fields, score, a call outcome), not by someone changing a dropdown.
4. A lead leaves by **converting** or by a **lost reason**. Lost leads go to nurture with a date to look again.
5. Nobody contacts a lead who has **not consented** (or has asked not to be contacted).

### 4.2 Screens

- **Today (the new landing page for sales):** four lanes. *New, respond now* (clock running), *Follow-ups due*, *Replied* (WhatsApp / e-mail answers waiting), *Going cold* (no activity for N days). One click to call, WhatsApp, e-mail, log outcome, or set the next step. Counts also show for a manager across the team.
- **Lead inbox:** unassigned and new leads, with the duplicate suggestion and the capture source next to each; accept, assign, merge.
- **Lead 360 (reshaped):** top: who, stage, score and *why* it is that score, owner, first-response status, next activity. Middle: one timeline for every channel with outcomes. Side: qualification checklist, consent, related customer / duplicates. Bottom actions: log call, WhatsApp, e-mail, task, convert, mark lost.
- **Pipeline:** kanban with age in stage, next-step badge and a colour for overdue; drag to change stage (asks for the next step or the lost reason).
- **Saved views and bulk actions** on every list.

### 4.3 What it needs (data and engines)

New lead fields (all configurable, added by a pack-style installer that only adds what is missing):
`lifecycleStage`, `lostReason`, `nextActivityAt`, `nextActivityType`, `lastActivityAt`, `firstResponseAt`, `responseDueAt`, `consent` (channel + date + source), `doNotContact`, `utmSource/Medium/Campaign`, `tags`, `fitScore`, `interestScore`.

Engines (server, all per workspace settings):
1. **SLA and escalation:** response due time by source or priority (working hours aware); breach alert to the owner, then to the manager, then re-route.
2. **Activity log:** one `activity` write path for call / WhatsApp / e-mail / meeting / note with an outcome; it updates `lastActivityAt`, `firstResponseAt`, and can trigger the next-step rule.
3. **Scoring v2:** fit (who they are) + interest (what they did), points added by events and removed by inactivity.
4. **Routing v2:** capacity (open leads per person), availability (hours, leave), territory / language / skill, and re-route when the SLA is missed.
5. **Cadences:** a sequence of steps by lead type (call day 0, WhatsApp day 1, call day 3 ...) that creates the next activity and stops when the lead replies or converts. Builds on today's Sequences and Journeys.
6. **Conversion:** creates the contact and the account (reusing an existing one found by the duplicate rules) and optionally an opportunity with amount and close date; copies the history across.
7. **Compliance:** consent captured at the source (form checkbox, WhatsApp opt-in message), enforced before any outbound send, kept in the audit trail.
8. **Reports:** speed to lead, first-response SLA hit rate, aging, funnel by source / owner / campaign, lost reasons, cost per lead and per conversion (once spend is entered).

### 4.4 What we deliberately leave out of the first release
Predictive AI scoring, e-mail open tracking pixels, dialers beyond the current CTI hook, native Facebook / Instagram connectors. Each is a later add-on once the process above is in use and there is data.

## 5. Roadmap

| Phase | Delivers | Effort | You can tell it works when |
|---|---|---|---|
| 1. Foundation | Lead fields above, activity log with call outcomes, `lastActivityAt` / `firstResponseAt`, lost reason (required when stage = Lost), required next activity on stage change | M | A lead cannot be moved forward without a next step; the list sorts by last activity |
| 2. Today and SLA | Today page, response due times, breach alerts, going-cold lane, saved views, bulk assign / stage / tag | L | A new lead shows on its owner's Today with a countdown; an ignored lead alerts the manager |
| 3. Routing and consent | Capacity / availability routing, re-route on SLA miss, consent fields and enforcement on WhatsApp / e-mail / calls | M | A WhatsApp send to a lead with no consent is refused with a clear reason |
| 4. Qualify and convert | Qualification checklist, scoring v2, conversion to contact + account + opportunity, nurture re-entry | L | Converting creates the three records, links history, and never creates a second account for the same company |
| 5. Insight | The reports in 4.3, UTM capture and cost per lead, Lead 360 redesign | M | A manager can answer "which source gives customers, how fast do we reply, why do we lose" without a spreadsheet |
| 6. Channels | Facebook / Instagram lead ads, e-mail-to-lead, WhatsApp templates and media | M each | A Facebook lead appears with its campaign and the same SLA clock |

Effort: S under 2 days, M about a week, L about two weeks, for one developer working with tests, as for the WhatsApp and duplicate work.

## 6. Decisions needed

1. **Who is this for first?** Agencies (your first industry pack) usually sell one-to-one with long cycles, which suits cadences and Today; high-volume lead sources (education, real estate) make SLA and routing the priority. The order of phases 2 and 3 depends on it.
2. **Response time target.** What first-response time do you want to promise (5 minutes, 1 hour, same day)? It becomes the default SLA.
3. **Opportunity step.** Do your users want a separate deal (amount, close date, forecast) after a lead qualifies, or is "Customer" enough for now?
4. **Consent.** Which channels must be opt-in (WhatsApp certainly; e-mail and calls depend on the country you sell in)?
5. **Phase 1 first?** It is the base for everything else and is the smallest useful step.
