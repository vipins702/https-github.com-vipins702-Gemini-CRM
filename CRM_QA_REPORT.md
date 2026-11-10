# FlowCRM QA Report

Lightweight audit of the FlowCRM repository at commit `0cdfb42`, with the `qa-do` skill (qa-skills pack).
No application code was changed. Everything was run against a throwaway local database
(`server/crm_v5.db`, git-ignored), never production data.

**How to read this report.** Each finding is tagged:

- **[TESTED]** I ran it and saw the result.
- **[CODE]** Read from the source only; not executed.
- **[UNTESTED]** Not examined. Listed so the gaps are visible.

## Scope and method

| What | How |
|---|---|
| Repo discovery | File listing, 36 DB tables from `server/database.js`, ~153 routes by area, 32 pages |
| Journey, CRUD, validation, search, paging, custom objects, tenant isolation, auth | 90-line API probe, two fresh tenants, 150+ bulk records |
| Roles and permissions | `server/test/permissions-matrix.mjs` (204 checks, pass) and `server/test/e2e-scenarios.mjs` (88 pass, 4 fail, 5 gaps) |
| DB consistency | 17 read-only SQL checks on a copy of the test DB |
| Dead links and buttons | Static scan of `pages/` and `components/`, then manual confirmation of every item listed below |
| Second pass | Checklists of `risk-based-testing`, `api-testing`, `security-testing`, `database-testing` run with HTTP probes, a restart-aware fuzz and direct SQL on a copy of the test database (Section 7) |
| Not done | Production data, load testing, a visual browser sweep of every page, third-party integrations |

---

## 1. Working features

All **[TESTED]** unless marked.

- **Auth:** login, 401 without token, tampered and `alg=none` tokens rejected, SQL-injection login rejected, the same error for unknown user and wrong password (no user enumeration), user list exposes no password data. Disabled users are blocked on the next request.
- **Workspaces:** a superadmin can create a workspace. It clones entities, layouts and menu, and creates an admin who can sign in. The new workspace starts with Lead, Customer, Case, Task, Product.
- **Tenant isolation:** workspace B cannot list, search, edit, change status, delete or read notes, history or attachments of workspace A's records. Roles are per-workspace. A tenant admin cannot reach the platform API.
- **Core journey (partial, see section 3):** create lead, convert to customer, create task linked to the customer, create quote for the customer, convert quote to a "deal".
- **CRUD:** create, update, delete, and 404 on deleting a missing record. Empty body and invalid email are rejected.
- **Search:** global search finds records, is tenant-scoped, and a SQL-injection payload returns nothing.
- **Metadata:** a custom object saves, lists and accepts records. A new custom field on an existing object saves and reads back. Required custom fields, email and boolean types are enforced.
- **Roles and permissions:** read, create, edit, delete, manage, own-scope, field rules and admin "view as role" preview, all enforced server-side (204 checks).
- **DB integrity:** no orphan notes, attachments or users. Foreign keys are on. `records` has 11 indexes, including tenant + entity type, owner, status and the JSON email and phone lookups. No unparsable JSON rows.
- **Lead ingest** without an ingest key is refused (401).
- **Second pass, also tested:** expired, wrong-key and tenant-swapped tokens rejected; WhatsApp webhook signature checked on the raw bytes (unsigned, wrong and tampered rejected); path traversal on `/uploads` blocked; the SQL sandbox refused cross-tenant reads, hidden columns, unlisted tables, `ATTACH`, multi-statement, writes and stopped a runaway query at 5 s; quote arithmetic correct; concurrent deletes and conversions are safe; a restart leaves the schema byte-identical; the database rejects duplicate users per tenant, NULLs, bad foreign keys and malformed JSON.
- **Build:** `tsc --noEmit` clean, `vite build` succeeds.

## 2. Missing features

| # | Missing | Evidence |
|---|---|---|
| M1 | **Self-service signup.** "Create a workspace" on the login page is `href="#"`. There is no signup endpoint (`POST /api/auth/signup` returns 404). Workspaces exist only if the platform superadmin creates them. | [TESTED] `pages/Login.tsx:141` |
| M2 | **Password reset and change.** "Forgot?" is `href="#"`. There is no change or reset endpoint. New tenant admins get `mustChangePassword=true` but nothing enforces or serves it. | [TESTED] `pages/Login.tsx:104`; `/auth/change-password` returns 404; flag is only set at `server/index.js:410` and never read by the frontend |
| M3 | **Contact entity.** Only Customer exists. There is no person-within-account model. | [TESTED] entity list |
| M4 | **Opportunity entity.** A "deal" is a Lead record with status Won, `_isDeal`, and fields `name` and `value` that the Lead definition does not have. It has no first or last name. | [TESTED] `server/services/quotes.js:185-197` |
| M5 | **List pagination, sorting and server-side filters.** The API ignores `page`, `limit`, `offset` and `?status=`. | [TESTED] `GET /data/lead?page=2&pageSize=10` returned all 158 rows |
| M6 | **Delete a custom object or field.** There is no route. | [TESTED] `DELETE /metadata/schemas/project` returns 404 |
| M7 | **Menu entry for a new custom object.** It has to be added by hand in Menu Builder. | [TESTED] |
| M8 | **Password policy, 2FA, session revocation, audit of logins.** | [CODE] no length checks in `server/index.js:1766` |
| M9 | **Team scope.** The UI offers "Team", but no teams exist. It is treated as Own. | [CODE] `server/middleware/access.js` |
| M10 | **CI and an `npm test` script.** The only tests are the two scripts in `server/test/`. | [CODE] no `.github`, no test script |

## 3. Broken functionality

| # | Problem | Evidence |
|---|---|---|
| B1 | **Dead buttons on every record list:** `Filter`, `Export`, row actions (`...`), and `Previous` / `Next` (permanently disabled, so only the first screen of data is ever navigable). | [CODE] `pages/ModuleView.tsx:1056-1057, 1191, 1209-1210`. The footer shows "Showing N of N". |
| B2 | **"Add Note" button** in the record Activity Stream does nothing. | [CODE] `pages/ModuleView.tsx:686` (the Lead 360 and Customer 360 pages have a working note box) |
| B3 | **Quote-to-deal records are unreadable in the UI.** `GET /data/deal` returns nothing because the deal is stored as a `lead`. The deal appears among leads with no name. | [TESTED] plus `quotes.js:185` |
| B4 | **Unknown record types return 200 with an empty list** instead of 404 (`/data/anything`). | [TESTED] earlier e2e |
| B5 | **Converting a lead from another workspace returns HTTP 500** ("Lead not found") instead of 404. No data leaks. | [TESTED] `server/services/cti.js:97` |
| B6 | **Login with object-typed credentials returns 500.** | [TESTED] `{"email":{"$ne":1}}` |
| B7 | **Demo seed menu pointed at screens that do not exist** (`leads`, `contacts`, `deals`). Fixed in this branch for fresh installs. Existing databases that kept the old menu still have it. | [TESTED] |
| B8 | **Case status "Escalated"** exists as a status option but not as a pipeline stage, so moving a case to it fails with 400. | [TESTED] e2e |
| B9 | **Search treats `%` as a wildcard** (returns up to 10 arbitrary records). | [TESTED] |
| B10 | **Two lead or customer records had no owner** after the journey (one is the customer created by lead conversion; quote conversion also inserts its deal without `owner_id`). Under own-scope roles they are invisible to everyone but admins. | [TESTED] DB check |
| B11 | **Quote records have no entity definition** in their workspace. Harmless today, but the data is not reachable through metadata tooling. | [TESTED] DB check |

## 4. Critical bugs

Ranked by impact. The validation ones sit on the data path every module uses.

1. **[FIXED in the working tree, see 7.6] One malformed request crashes the whole server.** `POST /api/users` with a non-string `name` (for example `{"name": 5}`) throws `name.trim is not a function` inside an async handler that has no `try`. Node 22 exits on the unhandled rejection and nothing in the repo catches it or restarts the process, so **every workspace goes down** until someone restarts it. Any workspace admin can trigger it. Reproduced twice. Another 38 malformed-body requests on 12 endpoints return HTTP 5xx instead of 400 (Section 7.3). **[TESTED]** `server/index.js:1766-1773`
2. **Required fields flagged `system` are not validated.** `firstName` and `lastName` are required on Lead, but `server/index.js:851` skips `system` fields when building the validator. A lead with no name, or with an object or array as the name, is accepted (200). **[TESTED]**
3. **Picklists are not enforced.** `select` and `status` accept any string, so a lead with `status: "Nonsense"` saves, and custom objects behave the same. Only the dedicated status endpoint checks the stage. **[TESTED]** `server/index.js:790-815`
4. **Numbers and dates are not validated.** `budget: "lots"` is stored as the string `"lots"`, and `starts: "not-a-date"` is accepted. `Number("lots")` is `NaN`, which breaks sums and reports later. **[TESTED]**
5. **No length limits.** A 100,000-character name is accepted. **[TESTED]**
6. **No server-side pagination.** Every list call returns and parses every row (158 rows took 8 ms here, but it grows linearly), and the UI renders them all. **[TESTED]** and **[CODE]**
7. **A tenant admin can attach another workspace's role id to a new user** (`POST /users` does not check the role belongs to the workspace). The user ends up with no permissions, so there is no escalation, but it is a cross-tenant reference and leaks that the id exists. **[TESTED]** `server/index.js:1766`
8. **Duplicate lead emails are accepted** by the API (the UI only warns on phone). **[TESTED]**

## 5. Security issues

| Severity | Issue | Evidence |
|---|---|---|
| High | **Uploaded files are served publicly and without type checks.** `/uploads` is `express.static` with no login. Attachments keep the original extension. **Reproduced:** an uploaded `evil.html` was returned to an anonymous request as `text/html` with no `nosniff`, so a script in it would run on the app origin and could read the `localStorage` token. | [TESTED] `server/index.js:84`; multer has only a size limit (line 86-92) |
| High | **Server-side request forgery from workflow webhooks.** A workspace admin can add a stage "webhook" action pointing at any URL. **Reproduced:** moving a lead into that stage made the server POST the record to a listener on 127.0.0.1. On a cloud host the same path reaches internal services and the metadata endpoint. | [TESTED] `server/services/processes.js:154` |
| Medium | **Internal fields are client-writable.** `_isDeal`, `_converted_to_customer`, `score` and `_assigned_to` sent in a request body are stored as given. | [TESTED] |
| Medium | **User, role and sign-in events are not audit-logged**, so there is no trail for account creation, permission changes or failed logins. | [TESTED] audit queried by type |
| Medium | **Vulnerable dependencies:** `npm audit` reports 13 high in the frontend toolchain and 1 critical (`proxy-addr`) plus 4 high (`body-parser`, `path-to-regexp`, `nodemailer`, `zod`) on the server. No scanner runs in CI. | [TESTED] `npm audit` |
| Medium | **Production error pages likely show stack traces:** errors on unknown routes and malformed JSON are Express HTML pages with the exception text, and `render.yaml` never sets `NODE_ENV=production`. | [TESTED] in dev mode; production behaviour from [CODE] |
| Medium | **CORS is open to every origin** (`Access-Control-Allow-Origin: *`). Impact is limited because auth uses a bearer token, not cookies. | [TESTED] `index.js:44` |
| Medium | **No security headers.** No `X-Content-Type-Options`, HSTS, CSP or frame protection, and `X-Powered-By: Express` is exposed. | [TESTED] |
| Medium | **Token stored in `localStorage`** for 24 hours with no refresh or logout revocation. Any XSS steals it. | [CODE] `index.js:401`, `services/api.ts` |
| Medium | **No password policy.** Any password length is accepted for users and new workspace admins. | [CODE] |
| Medium | **Login limiter is per IP and in memory.** It resets on restart and does not work across several server instances. | [CODE] |
| Low | **Text is stored unescaped** (`<img onerror>` saved as-is). React escapes it on screen; email templates and CSV export were not checked. | [TESTED] storage only |
| Info | **WhatsApp webhook signature is enforced correctly** when an app secret is set: unsigned, wrongly signed and byte-tampered requests get 401; valid signatures (compact and pretty-printed JSON) get 200. My first run showed 200 for everything because the test server had unsigned mode on and my probe sent no content type. | [TESTED] 5 checks |
| Info | **Fixed earlier in this branch:** cross-module search leak, dozens of routes without permission checks, hardcoded superadmin password, login limiter counting successes. | Commits `2b73986`, `9ef8f78` |

## 6. Untested

Be careful before trusting these areas:

- Report engine and SQL sandbox row-level permissions (`server/services/reporting.js`, `sqlSandbox.js`). Dashboards show aggregates to any role with some access.
- Workflows and process builder execution, sequences and drip enrolment, assignment and scoring rules (only the round-robin assignment was exercised).
- WhatsApp, email, calling and Meta integrations with real credentials.
- Campaign sending, public web forms at `/form/:id`, CSV import column mapping with bad data, file upload attacks.
- PostgreSQL mode (`DB_TYPE=postgres`). Everything here ran on SQLite.
- Visual and responsive behaviour of each page, accessibility, performance under load.
- Multi-step UI journeys in a browser beyond the role editor, view-as-role and lead screens.

## 7. Skill-based review

Second pass, following the checklists of four installed skills: `risk-based-testing`, `api-testing`,
`security-testing` and `database-testing`. Same rules as before: local test database only, no code
changed, no packages installed.

### 7.1 What the skills ask for and what I could not do

| Skill step | Status |
|---|---|
| Risk matrix, failure modes, coverage alignment (risk-based-testing) | Done, 7.2 |
| Contract, auth, error, header, idempotency, calculated-value checks (api-testing) | Done with plain HTTP probes, 7.3 |
| OWASP Top 10 (2025) walk-through (security-testing) | Done by category, 7.4 |
| Constraints, indexes, query plans, seed, restart and rollback checks (database-testing) | Done on SQLite only, 7.5 |
| Playwright / Zod / AJV / Semgrep / ZAP / OSV-Scanner / Testcontainers / Juice Shop control run | **Not run.** None are installed and you asked for no installs. Substitutes: exact key-set checks instead of Zod, manual route and SQL review instead of Semgrep, `npm audit` instead of OSV-Scanner, and no DAST scan. |
| PostgreSQL (`DB_TYPE=postgres`) | **Untested.** No Postgres available. The schema notes say foreign keys are dropped there, so behaviour differs from SQLite. |

One of my own probes gave a false alarm and I caught it: the first webhook-signature run sent no
`Content-Type`, so the server never parsed the body and every request looked "accepted". After the fix
(5 checks) the webhook behaves correctly. Every finding in this section was checked a second time or
confirmed against the code.

### 7.2 Risk matrix (impact 1-5 × probability 1-5)

Probability uses evidence: churn from `git log` over 3 months (top files: `server/index.js` 11 changes,
`ModuleView.tsx` 6, `Sidebar.tsx` 6, `App.tsx` 6), the defects found in this audit, and current test
coverage (two scripts, no unit tests, no coverage tool, no CI).

| # | Area | Impact | Prob. | Score | Zone | Basis |
|---|---|---|---|---|---|---|
| R1 | Server availability (one request can kill the process) | 5 | 5 | **25** | CRITICAL | Crash reproduced twice; 12 endpoints return 5xx on malformed input |
| R2 | Record validation and data quality (every module) | 4 | 5 | **20** | CRITICAL | Required names, picklists, numbers, dates, length all unenforced |
| R3 | Quotes and money | 4 | 4 | **16** | CRITICAL | Negative quantity, negative price, 5000% tax accepted. Arithmetic itself is right |
| R4 | Uploads and attachments | 5 | 3 | **15** | CRITICAL | Public, unauthenticated, HTML served as HTML (reproduced) |
| R5 | Authentication and session management | 5 | 3 | **15** | CRITICAL | No signup, reset, change-password, logout or password policy. 24 h tokens |
| R6 | Role permissions (RBAC) | 4 | 3 | **12** | HIGH | Was widely broken; now 204 checks pass. Highest-churn file |
| R7 | Workflow and process webhook actions | 4 | 3 | **12** | HIGH | Server calls any URL a tenant admin sets, including loopback (reproduced) |
| R8 | Lead to customer journey (core value path) | 4 | 3 | **12** | HIGH | Works and is concurrency-safe, but deals are leads, customers get no owner |
| R9 | Metadata and custom objects | 3 | 4 | **12** | HIGH | No delete, no menu entry, picklists unenforced |
| R10 | Record lists and search at scale | 3 | 4 | **12** | HIGH | No pagination; every call returns and parses all rows |
| R11 | Audit logging | 3 | 4 | **12** | HIGH | User, role and sign-in events are not logged |
| R12 | Third-party dependencies | 4 | 3 | **12** | HIGH | `npm audit`: root 13 high; server 1 critical + 4 high |
| R13 | Schema evolution and data constraints | 4 | 3 | **12** | HIGH | No migration table or rollback; 5 of 12 invalid rows accepted by the DB |
| R14 | Dead or misleading UI | 2 | 5 | **10** | HIGH | Filter, Export, paging, row actions, signup and reset links |
| R15 | Tenant isolation | 5 | 2 | **10** | HIGH | Tested solid; one cross-tenant reference (role id) and one 500 |
| R16 | Reports and SQL sandbox | 4 | 2 | 8 | MEDIUM | Sandbox held under 11 attack probes; report row permissions untested |
| R17 | Messaging integrations (WhatsApp, email) | 3 | 2 | 6 | MEDIUM | Webhook signature correct; live providers untested |
| R18 | Dashboard and appearance | 2 | 2 | 4 | LOW | Cosmetic |

**Failure-mode analysis for every item scoring 10 or more**

| Item | Trigger | Blast radius | Detection today | Current mitigation | Gap |
|---|---|---|---|---|---|
| R1 | `POST /users` with a non-string `name` (async handler throws before its `try`, no process-level handler) | **Every tenant**: the whole API goes down until restarted | None in code | None | Wrap async handlers, add `unhandledRejection` guard and a process supervisor; fuzz in CI |
| R2 | Any `POST /data/:type` | All data in all modules becomes unreliable for reports, scoring, sorting | A user notices | Only email, and non-system required fields | Validate system fields, picklists, numbers, dates, lengths |
| R3 | Quote with negative qty/price or huge tax | Wrong totals sent to customers, wrong revenue | A customer or accountant | Totals are computed server-side | Validate ranges; reject empty quotes |
| R4 | Attachment named `x.html` or `x.svg` | Script runs on the app origin: session theft (token is in localStorage) | None | 10 MB size limit | Authenticate `/uploads`, allow-list types, `nosniff`, serve downloads |
| R5 | Stolen token, forgotten password, brute force from many IPs | Account takeover; locked-out users | Rate limiter (per IP) | bcrypt, 24 h expiry, live user check | Reset/change flow, per-account lockout, revocation, password policy |
| R6 | Role edited or new route added without a check | Data seen or changed by the wrong role | `permissions-matrix.mjs` (not in CI) | Central policy layer | Run the matrix in CI; add new routes to the policy table |
| R7 | Admin adds a stage "webhook" to an internal URL | Internal services and cloud metadata reachable; record data posted out | None | Admin-only | Block private ranges, allow-list hosts, timeout |
| R8 | Conversion, quote-to-deal | Customer or deal invisible to own-scope users; unreadable deals | A user | Idempotent conversion | Real Opportunity entity; set owner |
| R9 | Admin adds or removes fields and objects | Orphaned data, dead menus | A user | None | Delete/archive flow, auto menu and layout |
| R10 | Workspace grows past a few thousand records | Slow lists, large payloads, browser freezes | Support tickets | Indexes help the query itself | Server-side paging, sorting, filters |
| R11 | Compromised or misused admin account | No trail of who created users or changed roles; no sign-in forensics | Impossible | Record changes are logged | Log user, role, permission and sign-in events |
| R12 | Known CVE in a runtime dependency | Server compromise or denial of service | None | None | `npm audit` / OSV in CI, upgrade `nodemailer`, `multer`, `express` chain |
| R13 | Deploy that changes the schema | No version number to verify; no way back | Startup log | Idempotent `ALTER`s (restart left the schema byte-identical) | Versioned migrations with `down` scripts, drift check |
| R14 | User clicks a dead control | Lost trust, support load | A user | None | Remove or finish |
| R15 | Cross-tenant id reuse | Foreign references; information leak | Isolation checks (manual) | `tenant_id` on every query | Validate ids against the tenant on every write |

**Coverage alignment (gap worksheet)**

| Item | Zone | Required | Present | Priority | Owner | Target |
|---|---|---|---|---|---|---|
| R1 | CRITICAL | Fuzz in CI, error-handler tests, monitoring and restart | None | P0 | unassigned | next sprint |
| R2 | CRITICAL | Unit and API tests for every field type and required flag | 4 cases in e2e | P0 | unassigned | next sprint |
| R3 | CRITICAL | Boundary tests for qty, price, tax, rounding | None | P1 | unassigned | next sprint |
| R4 | CRITICAL | Upload type and access tests, header checks | None | P0 | unassigned | next sprint |
| R5 | CRITICAL | Full auth journey tests (signup, reset, expiry, revocation) | Login and expiry only | P1 | unassigned | +1 sprint |
| R6 | HIGH | Matrix in CI | 204-check matrix, run by hand | P1 | unassigned | next sprint |
| R7 to R15 | HIGH | Integration test per item | Mostly none | P2 | unassigned | +2 sprints |
| R16 to R18 | MEDIUM / LOW | Happy path | Partial | P3 | unassigned | as capacity allows |

**Reassessment:** re-score within 48 hours of any production incident, when a new module or dependency
is added, and at least quarterly. This matrix is only as current as its date (commit `0cdfb42`).

### 7.3 API checklist (api-testing)

| Check | Result | Evidence |
|---|---|---|
| Content type and schema shape | **OK** | JSON responses; login returns exactly `{token,user}`; user has 7 known keys. No OpenAPI spec exists, so schema-as-contract and Schemathesis do not apply |
| Cache and rate-limit headers | **Gap** | No `Cache-Control` on authenticated data (only an ETag); no rate-limit headers; only login is throttled |
| Error body shape | **Bug** | JSON `{error}` for 400/401/404 on API routes, but unknown routes and malformed JSON return Express's HTML error page with the exception text |
| Malformed input | **Bug** | 301 requests (43 write endpoints × 7 bad bodies): 2 crashed the server, 38 returned 5xx instead of 400. Affected: `users`, `roles`, `notes`, `scoring-rules`, `assignment-rules`, `sequences`, `saved-reports`, `metadata/schemas`, `workflows`, `notifications`, `cti/log-call`, `web-content` |
| Body size | **OK** | 200 KB body gets 413 |
| Auth: expired token | **OK** | Rejected with "Token expired" |
| Auth: wrong signing key, tenant swapped in claims, deactivated user | **OK** | All rejected; deactivation takes effect on the next request |
| Auth: logout / revocation | **Gap** | No logout endpoint; a stolen token lives 24 h |
| Permission boundary | **OK** | 204-check matrix passes |
| Calculated values | **OK** | 3 × 0.10 + 1 × 0.20 at 18% = 0.59; 7 × 19.99 + 2 × 5.05 at 8.25% = 162.41, both correct |
| Calculated values: boundaries | **Bug** | Negative qty (total -500), negative price, 5000% tax, no items and non-numeric values are all accepted |
| Idempotency | **Mixed** | Concurrent deletes: one 200, rest 404 (**OK**). Concurrent conversions: one customer (**OK**). Ten identical creates: ten records (**Gap**, no unique email or idempotency key). Five identical status moves: five history rows (**Bug**, same-stage "moves" are logged and would re-run entry actions) |
| Pagination | **Bug** | Ignored (see M5) |
| File upload | **Bug** | See 7.4, A05 |
| Webhook signature on raw bytes | **OK** | Unsigned, wrong-signature and byte-tampered bodies get 401; valid signatures over compact and pretty-printed JSON get 200 |
| Latency budget (500 ms, own choice: none is documented) | **OK** | With ~1,000 leads: list 20 ms (287 KB), search 4 ms, dashboard 5 ms |
| Health and debug routes | **Gap** | `GET /` returns 200; no `/health`. No debug, test or metrics routes found |
| Documented contract for other consumers | **Gap** | None exists (no OpenAPI, no Pact) |

### 7.4 Security checklist by OWASP Top 10 (2025)

| Category | Result |
|---|---|
| **A01 Broken access control** | Tenant isolation held (9 cross-tenant attacks, tested). Path traversal on `/uploads` blocked (3 variants, tested). Gaps: stage webhook SSRF reaches loopback and posts the record (**Bug**, tested); `POST /users` accepts any `roleId` string, including another tenant's and `"superadmin"` (**Bug**, tested; no escalation, the user ends up with no rights); client-supplied internal fields (`_isDeal`, `_converted_to_customer`, `score`) are stored (**Bug**, tested) |
| **A02 Security misconfiguration** | No security headers; `X-Powered-By: Express` exposed; CORS `*` (tested). `render.yaml` sets no `NODE_ENV`, so the production deploy will likely send stack traces in HTML errors (**code**; tested in dev mode only). Directory listing off |
| **A03 Supply chain** | Lockfiles committed for root and server. `npm audit`: root 13 high (direct: `multer`, `nodemailer`, `postcss`, `vite`; transitive: `axios`, `lodash`, `rollup`, `picomatch`, `nanoid` and others); server 1 critical (`proxy-addr`, transitive via Express), 4 high (`body-parser`, `path-to-regexp`, `nodemailer`, `zod`). No SBOM, no provenance, no dependency review in CI |
| **A04 Cryptographic failures** | Passwords hashed with bcrypt (cost 10); no hash in any API response (tested). `JWT_SECRET` must exist but has no minimum length (**code**). TLS and cookies not applicable locally; token is kept in `localStorage` |
| **A05 Injection** | SQL injection in search, login and the SQL sandbox refused (tested). The sandbox held against 11 probes: cross-tenant rows, `password_hash`, unlisted tables, `ATTACH`, two statements, `load_extension`, writes, and a runaway recursive query (stopped at 5 s, server stayed up). `PRAGMA` and `sqlite_master` run but only see the three throwaway tables. **Stored XSS via upload:** an uploaded `.html` is served to anyone as `text/html` with no `nosniff` (**Bug**, tested). Text fields store raw HTML (React escapes on screen). `%` in search acts as a wildcard. SQL scan was single-line patterns only |
| **A06 Insecure design** | Login throttled per IP, 5 failures a minute, `Retry-After` set (tested), but not per account and not shared across instances. No rate limit anywhere else: 300 parallel searches all returned 200. Quote business-logic abuse accepted (R3). No account lockout |
| **A07 Authentication failures** | Strong: alg=none, expired, wrong-key and tampered tokens rejected; no user enumeration; deactivation is immediate. Weak: no password policy, reset, change or forced-change flow; `isSuperadmin` is read from the token, so a demoted superadmin keeps rights until the token expires (**code**) |
| **A08 Integrity failures** | WhatsApp webhook verifies the HMAC over the raw bytes (5 checks, tested). No CSP, no SRI (the only external asset is Google Fonts CSS) |
| **A09 Logging and alerting** | Record create and update are audited (delete not checked). User creation, role changes and sign-ins (including failures) are **not** (tested with type filters). No alerting |
| **A10 Exceptional conditions** | **Critical:** a malformed `POST /users` terminates the process; Node 22 exits on the unhandled rejection and there is no handler or supervisor in the repo. Plus the 38 other 5xx responses and HTML error bodies (7.3). Login with object-typed credentials returns 500 |
| **OWASP LLM Top 10** | Not applicable to the CRM itself. The optional Gemini calls were not tested |

### 7.5 Database checklist (database-testing)

| Check | Result |
|---|---|
| Forward migration from an empty database | **OK.** Fresh start creates 35 tables and 63 schema objects, repeated many times |
| Restart on an existing database | **OK.** Schema hash identical before and after a restart (migrations are idempotent `ALTER`s) |
| Rollback / `down` path | **Gap.** None exists. No migrations table, `PRAGMA user_version` is 0, so drift cannot be detected |
| Data preservation across a migration | **Untested.** There is no versioned migration to stage |
| Constraints enforced by the database | **OK:** duplicate user email per tenant, NULL `data`, NULL `entity_type`, missing tenant (FK), missing owner (FK), duplicate entity definition, malformed JSON (the JSON expression index rejects it). **Gap (accepted by the DB):** unknown entity type, note or attachment on a missing record, user with a missing role, duplicate role name in a tenant. No `CHECK` constraints anywhere |
| Referential integrity audit | **OK:** zero orphans in all 17 checks, apart from 2 lead/customer rows with no owner and 1 quote with no entity definition (7.2, R8) |
| Indexes | **OK** for the hot paths: tenant + entity, owner, status, e-mail, phone, notes, audit all use an index. **Gap:** 9 tenant-scoped tables have no index starting with `tenant_id` (`menus`, `roles`, `workflows`, `campaigns`, `campaign_sends`, `saved_reports`, `scoring_rules`, `assignment_rules`, `sequences`), and login looks users up by e-mail alone with a full `SCAN users` |
| Query performance at volume | 20,000 leads: list + parse 98 ms (~2.3 MB response), search 8.5 ms (index narrows to the tenant, then scans every row's JSON), status filter 5 ms. Fine today, linear growth |
| Seed data | **Idempotent** (seeding twice leaves 5 records, 5 definitions, 5 layouts, 1 menu). **Not deterministic:** two fresh seeds produce different record ids (random UUIDs), which makes fixtures hard to reference |
| Timestamps and types | **OK.** 100% of `created_at` values are `YYYY-MM-DD HH:MM:SS` text |
| Transaction isolation in tests | Not applicable: the suites use real HTTP against a throwaway database |
| PostgreSQL | **Untested** |

### 7.6 Fix verification: server crash and malformed input

The crash (critical bug 1, risk R1) was fixed after this report's first draft. Not committed yet.

| What changed | Where |
|---|---|
| Errors thrown or rejected inside any async route are forwarded to an error handler instead of becoming unhandled rejections (the cause of the crash) | `server/index.js`, wrapper right after `express()` |
| JSON handlers at the end: unknown routes return 404 JSON, bad JSON returns 400, oversized bodies 413, anything else 500 with a generic message and no stack trace | `server/index.js`, before `app.listen` |
| `unhandledRejection` is logged; `uncaughtException` logs and exits so a supervisor can restart | `server/index.js` |
| Body validation on the 12 write endpoints that failed (roles, users, notes, scoring and assignment rules, sequences, saved reports, workflows, notifications, call log, web content, schemas), returning 400 with the reason | new `server/middleware/validate.js` |
| `POST /users` no longer calls `name.trim()` on a non-string, and `roleId` must be `admin` or a role of the caller's workspace (also closes the cross-tenant role-id finding) | `server/index.js` |
| Regression test | new `server/test/malformed-input.mjs` |

| Measure | Before | After |
|---|---|---|
| Requests that crashed the server (301 malformed requests on 43 endpoints) | 2 | **0** |
| Requests answered with HTTP 5xx | 38 | **0** |
| Requests that hung | 0 | 0 |
| `POST /users` with `{"name": 5}` | process exit | 400 with a reason |
| Cross-tenant role id on a new user | 200 | 400 |
| Permission matrix | 204 of 204 | 204 of 204 |
| Older end-to-end suite | 88 passed, 4 failed, 5 gaps | 88 passed, 4 failed, 5 gaps (unchanged) |
| New regression test, new code | n/a | 262 of 262 |
| New regression test, old committed code | n/a | **fails** (HTTP 500s, then the server dies) |

The Add User and New Role forms were also saved through the real UI after the change and both worked.

Still open from the earlier list: missing audit events, quote and record value validation, uploads, SSRF,
dependency upgrades, and everything else under Section 8 items 2 to 10.

---

## 8. Top 10 improvements, by priority (re-ranked after the skill review)

1. **[Done, see 7.6] Stop one request from killing the server.** Add a try/catch (or an async wrapper) to every route, an `unhandledRejection` handler, a global JSON error handler, and run the API under a supervisor. Fix `POST /users` first; the 38 other 5xx responses are the same class of bug. (R1, score 25)
2. **Fix record validation** across all modules: validate `system` required fields, enforce picklists, reject non-numeric numbers and invalid dates, add length limits, validate quote quantities, prices and tax. (R2, R3)
3. **Lock down uploads:** require login for `/uploads`, allow-list file types, send `nosniff` and force download for active types. (R4)
4. **Block server-side request forgery** from stage webhooks and any user-supplied URL: deny loopback and private ranges, allow-list hosts, set short timeouts. (R7)
5. **Add self-service signup, password reset and change, a password policy, per-account lockout and logout/token revocation;** enforce `mustChangePassword`. (R5)
6. **Put the two test scripts in CI** with an `npm test` script, and add a fuzz job for malformed bodies so item 1 cannot regress. Add `npm audit` (or OSV-Scanner) as a gate and upgrade `nodemailer`, `multer` and the Express chain. (R6, R12)
7. **Server-side pagination, sorting and filters** for `GET /data/:type`, then enable paging in the UI; add an index on `users(email)`. (R10)
8. **Audit more events:** user creation, role and permission changes, sign-ins and failures, and ownerless records; reject same-stage "moves". (R11, R8)
9. **Harden configuration:** security headers (helmet), CORS allow-list, hide `X-Powered-By`, set `NODE_ENV=production` in `render.yaml`, validate `roleId` against the workspace on `POST /users`, and stop accepting client-supplied internal fields (`_isDeal`, `score`, `_converted_to_customer`). (A02, A01)
10. **Introduce versioned migrations with `down` scripts and a schema-version table,** plus a real Opportunity entity, metadata delete/archive, and removal of the dead Filter, Export, paging and signup/reset controls. Add the missing database references (role, entity type) at the same time. (R9, R13, R14)
