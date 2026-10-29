# FlowCRM Next — Multi-Tenant Backend Design

> Design for replacing the current front-end-only `localStorage` layer with a real
> multi-tenant SaaS backend. Status: **design / not yet implemented.**

## Current state (why this document exists)

FlowCRM Next is presently a **front-end-only prototype**. The entire "API"
([`services/api.ts`](../services/api.ts)) is backed by `localStorage` with simulated
`setTimeout` delays. There is:

- no backend, no database, no real persistence beyond one browser;
- no multi-tenancy (`tenant_id` does not exist anywhere);
- no real auth (login is email-only, token is the hardcoded string `fake-jwt-token-123`);
- no billing, and no enforcement of the RBAC `scope` that the data model already describes.

The **metadata-driven engine is the real asset**: dynamic schemas, Object Manager,
Layout/Form builder, Menu builder, visibility rules, field-level security, and the
workflow canvas. This design keeps all of that and gives it a real backend.

## Design principle: keep the `api` seam, swap the implementation

The whole front end talks to one object (`api.getSchemas()`, `api.saveRecord()`, …).
That indirection is what makes the migration cheap: **keep every method signature,
change the body from `localStorage` to `fetch()`.** No page component needs rewriting.
The backend's job is therefore to expose HTTP endpoints that mirror those methods.

## Recommended stack

| Layer    | Choice                                   | Why |
|----------|------------------------------------------|-----|
| Runtime  | Node + **NestJS** (TypeScript)           | Reuses `types.ts` verbatim across front/back end |
| Database | **PostgreSQL**                           | JSONB + Row-Level Security = ideal for metadata-driven multi-tenant |
| ORM      | Prisma or Drizzle                        | Type-safe, migrations |
| Auth     | **JWT** access + refresh, Argon2 hashing | Replaces `fake-jwt-token-123` |
| Hosting  | **Supabase** (fastest) or Neon + Fly/Render | Supabase bundles Postgres + Auth + RLS + storage |

For fewest moving parts, default to **Supabase** (auth + DB + RLS + file storage in one)
unless there is a reason to self-host the NestJS + Postgres stack.

## Multi-tenancy: shared database, Row-Level Security

Every tenant's data lives in the same tables, isolated by a `tenant_id` column that
**Postgres itself enforces** — so a bug in API code cannot leak client A's data to
client B.

```sql
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON records
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

On each request the API sets `app.current_tenant` from the JWT; thereafter every query
is automatically scoped. You cannot forget a `WHERE tenant_id = …`. This is the most
important decision for safely "handling multiple clients."

## Core storage decision: how to store metadata-driven records

Records are dynamic (`CRMRecord { id, [key: string]: any }`) because tenants define
their own fields via Object Manager. Three ways to store that in SQL:

1. **Dynamic DDL** (a real column per custom field) — fast queries, but every schema
   edit becomes a migration. Painful at scale. ❌
2. **EAV** (one row per field value) — flexible, but queries become heavy joins. ❌
3. **JSONB** (one row per record, fields in a `data` JSONB column) — flexible,
   indexable, maps 1:1 to the current model. ✅ **Recommended.**

Incoming data is validated against the tenant's stored metadata schema in the API
layer (a NestJS validation pipe). Hot fields are indexed in Postgres with GIN /
expression indexes.

## Schema (essential tables)

```sql
-- Tenancy & identity
tenants        (id, name, plan, created_at, status)
users          (id, tenant_id, email, password_hash, role_id, is_active, avatar)
roles          (id, tenant_id, name, description, permissions JSONB)

-- Metadata (per tenant) — replaces the localStorage schema/layout blobs
entity_defs    (id, tenant_id, entity_key, label, plural_label, fields JSONB)
layouts        (id, tenant_id, entity_key, sections JSONB, field_configs JSONB)
menus          (id, tenant_id, items JSONB)
dashboards     (id, tenant_id, user_id, widgets JSONB)
settings       (tenant_id, data JSONB)

-- Actual data — ONE table for ALL entity types, metadata-driven
records        (id, tenant_id, entity_key, data JSONB, owner_id,
                created_at, updated_at)
  -- indexes: (tenant_id, entity_key); GIN on data; expression idx on data->>'status'

activities     (id, tenant_id, record_id, type, content, author_id, timestamp)
campaigns      (id, tenant_id, name, subject, status, template_html, stats JSONB)

-- SaaS plumbing (new)
subscriptions  (tenant_id, stripe_customer_id, stripe_sub_id, plan, status, seats)
audit_log      (id, tenant_id, user_id, action, entity, record_id, diff JSONB, at)
api_keys       (id, tenant_id, hashed_key, scopes, last_used)
```

`roles.permissions`, `entity_defs.fields`, `layouts.*`, and `campaigns.stats` are all
JSONB holding the exact objects already defined in [`types.ts`](../types.ts) — the
TypeScript types become the JSONB validators.

## API contract (REST)

Everything under `/api/v1`. Every request carries `Authorization: Bearer <jwt>`;
the tenant is derived from the token.

| Current `api.*` method              | HTTP endpoint |
|-------------------------------------|---------------|
| `login(email)`                      | `POST /auth/login` → `{access, refresh, user}` |
| `logout()` / `getSession()`         | `POST /auth/logout` / `GET /auth/me` |
| `getSchemas()` / `saveSchema()`     | `GET /schemas` / `PUT /schemas/:entity` |
| `createEntity()`                    | `POST /schemas` (server runs the schema+layout+role+menu transaction) |
| `createRelation()`                  | `POST /schemas/:entity/relations` |
| `getLayout()` / `saveLayout()`      | `GET /layouts/:entity` / `PUT /layouts/:entity` |
| `getRecords(entity)`                | `GET /records/:entity?scope=&page=&q=` (scope enforced server-side) |
| `getRecord()`                       | `GET /records/:entity/:id` |
| `saveRecord()`                      | `POST /records/:entity` + `PUT /records/:entity/:id` |
| `deleteRecord()`                    | `DELETE /records/:entity/:id` |
| `getActivities()`                   | `GET /records/:entity/:id/activities` |
| `getWorkflow()` / `saveWorkflow()`  | `GET/PUT /workflows/:entity` |
| `getUsers/saveUser/getRoles/saveRole` | `/users`, `/roles` CRUD |
| `getMenu/saveMenu`, `getDashboardConfig/...` | `/menu`, `/dashboard` |
| `getCampaigns/saveCampaign`         | `/campaigns` CRUD |
| `submitWebForm()`                   | `POST /public/forms/:campaignId` (unauthenticated, rate-limited) |

Two upgrades over current behavior:

- **`getRecords` scope is enforced on the server** from the user's role
  (`own` / `team` / `all`). Today `scope` exists in the model but is never enforced; in
  SaaS it is a security boundary, not a UI nicety.
- **`submitWebForm` is the only public endpoint** — it must be rate-limited and
  CAPTCHA-gated, since it creates records without authentication. The tenant is resolved
  from the campaign being submitted to.

## Migration path (incremental, low-risk)

1. Stand up the backend with the tables above; port `constants.ts` seed data into a
   per-tenant seeder.
2. Add an `apiClient` (fetch/axios wrapper handling JWT + refresh).
3. Rewrite `services/api.ts` **method-by-method** to call endpoints instead of
   `localStorage`. Signatures stay identical, so the app keeps working throughout.
4. Flip auth last — swap the fake login for real `/auth/login`.
5. Add a one-time import that reads a user's existing `localStorage` blob and POSTs it
   up, so demo data is not lost.

## Open decisions before building

- **Supabase vs. self-hosted NestJS + Postgres** — Supabase is faster to multi-tenant
  SaaS; NestJS gives more control over metadata/validation logic. Leaning Supabase for
  speed, with custom logic (the `createEntity` transaction, scope enforcement,
  validation) in Edge Functions or a thin API layer.
- **Tenant routing** — subdomain per tenant (`acme.yourcrm.com`) vs. single domain with
  tenant in the JWT. Single domain is simpler to start.

## Related future work (out of scope for this document)

- Billing / Stripe subscriptions and usage metering.
- Omnichannel inbox (WhatsApp Business API, Meta Graph API for FB/Instagram) writing into
  the `lead` entity via its `source` field.
- AI features (lead scoring, auto-qualification bot, reply drafting) using current Claude
  models with tool use over the CRM API.
- Marketing site + SEO for user acquisition.
