# Configuration review and roadmap (November 2026)

Scope: Object Manager, Form Designer, detail pages, Field Triggers, Journeys, Web Presenter, roles and record visibility, an AI configuration assistant, and what agencies need. Section 1 is built and tested; sections 2 to 6 are the plan.

## 1. Built in this round

| Area | What changed | Tested by |
|---|---|---|
| Detail pages follow the form layout | Lead and Customer detail pages drew a fixed list of 5 to 7 fields, so a field added in Form Designer never appeared. They now draw every section and field of the layout (`components/LayoutDetails.tsx`), skipping only what the header and contact card already show. | Browser check: a custom "Loan details" section appears on the lead detail page |
| Show on form, detail page or both | New per-field setting in Form Designer. "Edit form" keeps helper or input fields off the detail page; "Detail page" keeps read-only fields off the form. The edit form now also honours "hidden", which it ignored before. | `field-logic.mjs` section 4, browser |
| Formula (derived) fields | New field type. `{firstName} {lastName}` joins text; `{amount} * {quantity} - {discount}` calculates (blank counts as 0, no code is ever run). Worked out by the server on every save, cannot be typed over, shown read-only on the form. | `field-logic.mjs` section 1 |
| Field Triggers (before-save rules) | Configuration → Field Triggers. WHEN all/any of (field is / is not / contains / greater / less / at least / at most / empty / has a value / was changed) THEN set one or more fields (values may use `{otherField}`). Example: Interested = Yes AND Budget = No AND Callback = Yes → Priority = Nurture. Runs on every create and edit, in list order, before formulas. Rules can be switched off. | `field-logic.mjs` section 2 |
| Record visibility: own and team | "Own" now means records the user **created or is assigned to** (it was assigned only). "Team" used to behave like "own"; it now covers the user plus everyone who reports to them at any depth (new "Reports to" field on each user, loops refused). Set per role, per object, per workspace, in Users & Roles. Applies to lists, search, open, edit, delete, notes, files and convert. | `field-logic.mjs` section 3, `permissions-matrix.mjs` |
| Web Presenter public link | **Security fix**: `/api/web-content/<slug>/data` needs no sign-in and returned every field of every record of the type. It now returns only the fields the author ticks in the new "Fields to share" box (nothing until one is ticked), plus paging (`page`, `pageSize` up to 100), sorting on a shared field, a clear 400 naming any missing `{param}` (a missing one used to match blank values silently), and a limit of 120 requests a minute per address. | `field-logic.mjs` section 5 |
| Reports and dashboard follow record scope | Dashboard totals and charts, named reports, report packs (including their cache, which is now kept per user scope), saved reports, related records and the task list were reading every record of the workspace. They now use the same own / team / all rule as lists, and hide fields the role cannot read. Removed a second, never-reached copy of the saved-reports route. | `field-logic.mjs` section 3b |
| Form layouts validated | Any JSON was accepted as a layout (a fuzz test had replaced the lead layout with junk, which breaks the form and detail pages). Layouts are now checked for sections, columns, widths 1 to 12, field names and `showOn`; a damaged stored layout is replaced by a working default when read. | `field-logic.mjs` section 4 |

## 2. Still open, in priority order

1. **Web Presenter slugs are not tied to a workspace.** Slugs are unique per workspace, but the public link looks a slug up across all workspaces. Two workspaces using the same slug get whichever row comes first. Fix: put the workspace in the link (`/api/public/<workspace>/views/<slug>`) and keep the old path only for slugs that are unique.
2. **Existing records do not pick up a new formula** until they are saved again. Add a "Recalculate now" button that re-saves every record of the type in batches.
3. **Field Triggers cannot yet:** add or subtract days from a date ("follow-up = today + 3"), copy a value from a linked record, or stop a save with a message ("Discount above 20% needs a reason"). These are the next three action types to add: set date offset, copy from lookup, block with message.
4. **Assignment from the record screen.** There is no "Assign to" button on a lead; owners change only through assignment rules. Add it, gated by an "assign" permission, with an audit entry.
5. **Manager hierarchy view.** "Reports to" is set one user at a time; add an org-chart view in Users & Roles.

## 3. Journeys: what they are and how to use them

A Journey is what happens **after** a record is saved or reaches a stage. It is triggered by an event (created, updated, status changed, a date arrives), checks conditions, then runs steps over time: send an e-mail or WhatsApp, create a task, wait 2 days, branch on whether the customer replied, update a field, notify the owner.

Use **Field Triggers** for "make the data right before it is saved" (instant, no side effects) and **Journeys** for "do something because of it" (messages, tasks, waits).

Typical agency journeys:
- New web lead → assign by round robin → WhatsApp welcome in 5 minutes → task "call within 1 hour" → if not contacted in 24 hours, alert the manager.
- Proposal sent → wait 3 days → if no reply, follow-up e-mail → wait 4 days → task for the account lead.
- Retainer renewal date − 30 days → task to the account manager → − 7 days → renewal reminder to the client.

What the builder needs to be usable (2026 standard): templates for the journeys above; a test run against one sample record showing each step's result; a per-record history ("which journey steps ran for this lead"); versioning so editing a live journey does not change records already in it; and failure alerts.

## 4. Object Manager, relationships, Form Designer

- **Object Manager:** add field types still missing (checkbox, multi-select, date-time, percent, rating, rich text, user picker, geo/address with map, auto-number like `INV-0001`); field-level help text; unique-value and duplicate rules per field; a "where is this field used" panel (layouts, triggers, reports, journeys) before a field can be deleted.
- **Relationships:** one-to-many and many-to-many with a related list on the detail page (for example, Customer → Projects → Tasks), roll-up fields (count, sum, latest) from children to parent, and cascade rules (what happens to children when a parent is deleted).
- **Form Designer:** tabs within a form, per-role layouts (a sales layout and a finance layout for the same object), conditional required fields, and a live preview with sample data. "Show on" and formulas are done.

## 5. AI configuration assistant: is it possible?

Yes. Everything the app knows about a workspace is metadata (objects, fields, layouts, triggers, roles, menus, journeys), and it is stored as JSON with a validator for each kind. That is exactly what an AI assistant needs.

How it would work:
1. The admin describes what they want: "We are a digital agency. Track clients, projects with retainer value and monthly hours, and deliverables. Account managers see only their clients."
2. The assistant reads the current metadata and proposes a **change set**: new objects and fields, layouts, relationships, triggers, roles with scopes, menu entries and starter journeys.
3. The admin sees a readable diff ("adds object Project with 9 fields; adds role Account Manager with Own scope on Customers") and approves all or part of it.
4. The server applies it through the same validators the screens use, in one transaction, and keeps a version so it can be undone.

Safeguards: the assistant never writes directly; every change goes through the validators; nothing is deleted without explicit approval; every applied change set is audited and reversible. The same engine can review an existing set-up ("these 3 fields are on no layout; this role can delete customers but not read them").

The app already has an AI service (`server/services/ai.js`) used for record insights, so the connection exists; the work is the change-set format, the diff screen and the apply-and-undo step.

## 6. What agencies need that is missing

Objects:
- **Projects / engagements** (client, type, start and end, budget, retainer or fixed fee, status, account lead)
- **Deliverables** linked to projects (due date, owner, approval status, client sign-off)
- **Retainers and contracts** (monthly value, hours included, renewal date, auto-renew)
- **Time entries** (person, project, hours, billable or not) for utilisation and over-servicing reports
- **Invoices** linked to quotes and projects (quotes exist; invoices do not)
- **Contacts as their own object** (several people per client, each with a role), separate from the company record
- **Opportunities / deals** as their own object (today "deal" is a flag on a lead)

Features:
- Client portal: approvals, files and status for each project
- Proposal builder that turns a won proposal into a project with its deliverables
- Resource planning: who is booked on what next week
- Profitability per client and project (fee against time cost)
- Recurring billing reminders for retainers
- Agency report pack: pipeline by service line, retainer revenue, utilisation, over-servicing, renewals due

Suggested order: Contacts and Opportunities as real objects first (everything else links to them), then Projects with Deliverables, then Time entries and Retainers, then the agency report pack. With the AI assistant in place, an "Agency starter set" becomes one approved change set instead of manual set-up.
