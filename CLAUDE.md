# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FlowCRM Next** is a full-stack CRM (Customer Relationship Management) application with a metadata-driven architecture. It features a configurable data model, workflow automation, role-based access control (RBAC), and a layout engine for customizing form presentations.

## Tech Stack

**Frontend:**
- React 19 with TypeScript
- Vite (build tool, runs on port 3000)
- Tailwind CSS for styling
- React Flow for workflow visualization
- Recharts for data visualization
- Lucide React for icons

**Backend:**
- Node.js with Express.js
- SQLite (default, via better-sqlite3) or PostgreSQL (`DB_TYPE=postgres` + `DATABASE_URL`)
- JWT authentication with bcryptjs
- CORS enabled

## Getting Started

### Installation & Development

```bash
npm install
```

### Running Locally

**Frontend only:**
```bash
npm run dev
```
Runs on `http://localhost:3000`. The dev config proxies `/api` requests to the backend at `http://localhost:3015`.

**Backend only:**
```bash
npm run server
```
Runs on port 3015 (configured in `server/config.js`). Requires SQLite database initialization.

**Both simultaneously (recommended):**
```bash
npm run dev:all
```
Uses concurrently to run both frontend and backend in parallel.

**Production build:**
```bash
npm run build
```

## Architecture

### Frontend Structure

**Entry Points:**
- `index.tsx` - App initialization and DOM mounting
- `App.tsx` - Root component handling view routing, authentication, and session management

**Core Concepts:**
- **View-based routing**: `App.tsx` uses a `ViewState` enum to manage page views (no URL-based router)
- **Session management**: Authentication state stored in `localStorage` under `flowcrm_session`
- **Metadata-driven UI**: Entity schemas are fetched at bootstrap and used to render dynamic forms and lists

**Pages** (in `/pages`):
- `Dashboard.tsx` - Main landing page with configurable widgets
- `ModuleView.tsx` - Generic record list and detail view for any entity type
- `LayoutBuilder.tsx` - Drag-and-drop form layout editor
- `WorkflowBuilder.tsx` - Visual workflow/automation builder using ReactFlow
- `ObjectManager.tsx` - Entity schema manager (CRUD for custom entities)
- `UserManagement.tsx` - User and role administration
- `MenuManager.tsx` - Navigation menu configuration
- `LookupManager.tsx` - Lookup (picklist) value management with import support
- `WebPresenter.tsx` - Data source and web form builder
- `Customer360.tsx` - Unified customer profile view
- `Settings.tsx` - System settings and preferences
- `Login.tsx` - Authentication page
- `PublicWebForm.tsx` - Public-facing form (accessible at `/form/:id`)

**Components** (in `/components`):
- `Sidebar.tsx` - Navigation sidebar with role-based menu rendering
- `ui/` - Reusable UI components: Badge, Button, Card, Toast, Tooltip, Skeleton

### Backend Structure

**Config & Initialization:**
- `server/config.js` - Environment variables (PORT, JWT_SECRET, database path)
- `server/database.js` - Schema creation (shared by both databases) and seeding
- `server/db/sqlite.js`, `server/db/postgres.js` - Database adapters with the same interface
- `server/index.js` - Express app setup and route handlers

**Middleware:**
- `server/middleware/auth.js` - `authenticateToken()` and `requirePermission()` middleware

**Services:**
- `server/services/audit.js` - Activity logging
- `server/services/email.js` - Email sending (placeholder)
- `server/services/workflow.js` - Workflow evaluation and execution
- `server/services/` - Additional service modules

**Database:**
- SQLite file: `server/crm_v5.db` (current version); PostgreSQL when `DB_TYPE=postgres`
- Schema includes: users, roles, entities, fields, records, relationships, lookups, workflows, menus, etc.
- Multi-tenant support (all records have `tenant_id`)
- Records keep custom fields as JSON in `records.data` (JSONB on Postgres); common fields
  (status, owner, phone, dates) are real columns, and email/phone/link fields are indexed
- Write SQL that runs on both: use `db.json(col, field)`, `db.jsonNum()`, `db.jsonSet()`,
  `db.like`, `db.columns(table)` and `db.transaction(async tx => …)` instead of SQLite-only
  functions (`json_extract`, `PRAGMA`, `datetime()`, `db.prepare`)
- `npm run db:copy-to-postgres` copies the SQLite data into the empty Postgres in `DATABASE_URL`

### API Layer

**Frontend-to-Backend:**
- `services/api.ts` - Centralized API client with all fetch operations
- All endpoints prefixed with `/api`
- Authentication via Bearer token in `Authorization` header
- Session stored in `localStorage` as `flowcrm_session` JSON

**Common API Endpoints:**
- `/api/auth/login` - User authentication
- `/api/metadata/schemas` - Get/save entity definitions
- `/api/metadata/layouts/:entityType` - Form layout definitions
- `/api/data/:entityType` - CRUD operations on records
- `/api/users` - User management
- `/api/roles` - Role management
- `/api/relationships` - Entity relationships
- `/api/lookups` - Picklist/lookup values
- `/api/workflows` - Workflow definitions
- `/api/dashboard/` - Dashboard data
- `/api/audit/` - Activity logging
- `/api/metadata/menu` - Menu configuration

## Key Concepts & Patterns

### Type Definitions (types.ts)

Core types:
- `EntityType` - String union of entity names (e.g., 'lead', 'customer', 'case')
- `FieldType` - Field data types: text, number, email, select, date, textarea, lookup, etc.
- `EntityDefinition` - Metadata for an entity (id, label, fields array)
- `FieldDefinition` - Field metadata (name, label, type, required, validation)
- `CRMRecord` - Base interface for any data record (id + arbitrary fields)
- `LayoutDefinition` - Form layout for an entity (sections, columns, field configs)
- `VisibilityRule` - Conditional display logic for fields
- `ComponentStyle` - Tailwind-based styling for form elements

### Metadata & Schemas

- Schemas are fetched at app startup via `api.getSchemas()`
- Stored in `App.tsx` state as `schemas: Record<string, EntityDefinition>`
- Used to dynamically render forms, lists, and navigation
- Support for custom fields and relationships between entities

### Authentication & Session

- **Login flow**: POST to `/api/auth/login` with email/password
- **Token storage**: JWT stored in `localStorage` under key `flowcrm_session`
- **Auto-seed**: If email is `admin@flowcrm.com` and no user exists, admin account is auto-created with password `Admin@123` (dev/demo only)
- **Session check**: App checks `api.getSession()` on mount; if invalid/expired, user redirected to login
- **Logout**: Removes session from localStorage

### Layout Engine

- `LayoutDefinition` defines form structure in sections and columns
- `LayoutFieldConfig` allows per-field styling, visibility rules, and label overrides
- Visibility rules use operators: `==`, `!=`, `>`, `<`, `contains`
- Styles are Tailwind class names (e.g., `bg-red-50`, `text-bold`)
- `ModuleView.tsx` renders layouts dynamically based on entity schema

### Workflows

- Defined visually using ReactFlow (nodes and edges)
- Node types: trigger, action, condition, end, wait
- Stored in backend and evaluated server-side
- Service at `server/services/workflow.js` handles evaluation

### RBAC (Role-Based Access Control)

- Users have a `roleId` linked to a `Role` with permissions
- Permissions are per-module (entity type) with granularity:
  - `read`, `create`, `edit`, `delete` - module-level
  - `scope` - record visibility (all, team, own)
  - `fields` - field-level read/edit permissions
- Middleware `requirePermission(entityType, action)` enforces on backend
- Frontend respects permissions for UI (grayed buttons, hidden forms)

### Public Forms

- Accessible at `/form/:id` without authentication
- Rendered by `PublicWebForm.tsx`
- Used for web-facing forms (campaigns, lead capture, etc.)
- Form submissions create records linked to campaigns

## Development Notes

### Adding a New Page

1. Create `pages/MyPage.tsx` with `React.FC` component
2. Import in `App.tsx`
3. Add view state to `ViewState` type in `types.ts`
4. Add case in `App.tsx` renderContent()
5. Update `Sidebar.tsx` menu to include new view

### Adding a New Entity Type

1. Define fields in backend database schema
2. Frontend dynamically renders via `ModuleView.tsx` once schema is fetched
3. Create `LayoutDefinition` for form rendering
4. Configure RBAC roles with appropriate permissions

### Adding an API Endpoint

1. Create route in `server/index.js` (or modular route file)
2. Use `authenticateToken` middleware if auth required
3. Use `requirePermission` if access control needed
4. Add corresponding method in `services/api.ts`
5. Call from React component via `api.methodName()`

### Styling

- Tailwind CSS for all styling
- Dark mode support via `dark:` prefixes
- `@tailwindcss/postcss` v4 for modern CSS features
- Colors: indigo, violet, slate, emerald, rose, orange palettes
- Animation classes: fade-in, pulse, ping, etc.

### State Management

- React hooks (useState, useEffect) for component state
- localStorage for session persistence
- App.tsx is central state hub (views, schemas, session)
- Props drilling for passing state to children (consider Context API if deeply nested)

## Common Tasks

### Debugging

- **Frontend**: Browser DevTools, check `localStorage` for session
- **Backend**: Console logs in `server/index.js`, check `crm_v4.db` with SQLite viewer
- **API**: Use browser Network tab to inspect requests/responses

### Testing API Endpoints Manually

```bash
# Example: Get schemas
curl -H "Authorization: Bearer <token>" http://localhost:3015/api/metadata/schemas
```

### Resetting Database

Delete `server/crm_v4.db*` files and restart backend to reinitialize.

### Rate Limiting

Login attempts are rate-limited to 5 per minute per IP address (configured in `server/index.js`).

## Important Implementation Details

1. **No URL-based routing**: App uses a view state object, not URL routes. Navigation is entirely state-driven.
2. **Tenant isolation**: All records support multi-tenancy via `tenant_id` field (currently uses 'default').
3. **Auto-seed admin**: For development, admin@flowcrm.com auto-creates on first login attempt.
4. **Field type flexibility**: Custom `FieldDefinition` allows extensible field types via backend configuration.
5. **Workflow evaluation**: Runs server-side; trigger evaluation in `server/services/workflow.js`.
6. **Audit logging**: All data changes logged via `logAudit()` service for compliance/history.
