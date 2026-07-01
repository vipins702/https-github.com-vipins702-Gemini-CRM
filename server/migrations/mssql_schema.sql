/* =============================================================================
   FlowCRM — SQL Server schema (ported from SQLite crm_v5.db)
   Target: SQL Server 2016+  (JSON_VALUE / OPENJSON / ISJSON require 2016+)

   HOW TO RUN (SSMS or sqlcmd):
     1. Create the database first (or let line below do it):
          CREATE DATABASE [FlowCRM];
     2. Open this file against server LAPTOP-DUPBTT9S, login: sa
     3. Execute. Script is idempotent — safe to re-run.

   TYPE MAPPING from SQLite:
     TEXT (id / short)     -> NVARCHAR(64|100|255)
     TEXT (json / content) -> NVARCHAR(MAX)
     INTEGER (bool flag)   -> BIT
     INTEGER (counter)     -> INT
     DATETIME + CURRENT_TIMESTAMP -> DATETIME2 DEFAULT SYSUTCDATETIME()
   ============================================================================= */

IF DB_ID('FlowCRM') IS NULL
    CREATE DATABASE [FlowCRM];
GO

USE [FlowCRM];
GO

/* ---------- 1. tenants ---------- */
IF OBJECT_ID('dbo.tenants','U') IS NULL
CREATE TABLE dbo.tenants (
    id          NVARCHAR(64)  NOT NULL PRIMARY KEY,
    name        NVARCHAR(255) NOT NULL,
    status      NVARCHAR(50)  NOT NULL DEFAULT 'active',
    created_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- 2. users ---------- */
IF OBJECT_ID('dbo.users','U') IS NULL
CREATE TABLE dbo.users (
    id                    NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id             NVARCHAR(64)  NOT NULL,
    email                 NVARCHAR(255) NOT NULL,
    password_hash         NVARCHAR(255) NOT NULL,
    role                  NVARCHAR(50)  NOT NULL,
    first_name            NVARCHAR(120) NULL,
    last_name             NVARCHAR(120) NULL,
    is_active             BIT           NOT NULL DEFAULT 1,
    must_change_password  BIT           NOT NULL DEFAULT 1,
    created_at            DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_users_tenant     FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT UQ_users_tenant_email UNIQUE (tenant_id, email)
);
GO

/* ---------- 3. entity_definitions ---------- */
IF OBJECT_ID('dbo.entity_definitions','U') IS NULL
CREATE TABLE dbo.entity_definitions (
    id           NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id    NVARCHAR(64)  NOT NULL,
    entity_type  NVARCHAR(100) NOT NULL,
    config       NVARCHAR(MAX) NOT NULL,
    created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_entdef_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT UQ_entdef_tenant_type UNIQUE (tenant_id, entity_type)
);
GO

/* ---------- 4. records (the core EAV/JSON store) ---------- */
IF OBJECT_ID('dbo.records','U') IS NULL
CREATE TABLE dbo.records (
    id               NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id        NVARCHAR(64)  NOT NULL,
    entity_type      NVARCHAR(100) NOT NULL,
    primary_display  NVARCHAR(400) NULL,
    status           NVARCHAR(100) NULL,
    data             NVARCHAR(MAX) NOT NULL,
    created_at       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_records_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT CK_records_data_json CHECK (ISJSON(data) = 1)
);
GO

/* ---------- 5. layouts ---------- */
IF OBJECT_ID('dbo.layouts','U') IS NULL
CREATE TABLE dbo.layouts (
    id           NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id    NVARCHAR(64)  NOT NULL,
    entity_type  NVARCHAR(100) NOT NULL,
    config       NVARCHAR(MAX) NOT NULL,
    created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_layouts_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT UQ_layouts_tenant_type UNIQUE (tenant_id, entity_type)
);
GO

/* ---------- 6. menus ---------- */
IF OBJECT_ID('dbo.menus','U') IS NULL
CREATE TABLE dbo.menus (
    id          NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id   NVARCHAR(64)  NOT NULL,
    config      NVARCHAR(MAX) NOT NULL,
    created_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_menus_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
GO

/* ---------- 7. lookup_values ---------- */
IF OBJECT_ID('dbo.lookup_values','U') IS NULL
CREATE TABLE dbo.lookup_values (
    id          NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id   NVARCHAR(64)  NOT NULL,
    lookup_id   NVARCHAR(100) NOT NULL,
    value_id    NVARCHAR(100) NOT NULL,
    value       NVARCHAR(400) NOT NULL,
    sort_order  INT           NOT NULL DEFAULT 0,
    is_active   BIT           NOT NULL DEFAULT 1,
    created_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_lookupval_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT UQ_lookupval UNIQUE (tenant_id, lookup_id, value_id)
);
GO

/* ---------- 7b. lookup_sources ---------- */
IF OBJECT_ID('dbo.lookup_sources','U') IS NULL
CREATE TABLE dbo.lookup_sources (
    id            NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id     NVARCHAR(64)  NOT NULL,
    lookup_id     NVARCHAR(100) NOT NULL,
    source_type   NVARCHAR(50)  NOT NULL,
    source_entity NVARCHAR(100) NULL,
    value_field   NVARCHAR(100) NOT NULL DEFAULT 'id',
    label_field   NVARCHAR(100) NOT NULL DEFAULT 'name',
    sql_query     NVARCHAR(MAX) NULL,
    is_active     BIT           NOT NULL DEFAULT 1,
    created_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_lookupsrc_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT UQ_lookupsrc UNIQUE (tenant_id, lookup_id)
);
GO

/* ---------- 8. relationships ---------- */
IF OBJECT_ID('dbo.relationships','U') IS NULL
CREATE TABLE dbo.relationships (
    id                 NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id          NVARCHAR(64)  NOT NULL,
    name               NVARCHAR(150) NOT NULL,
    source_entity      NVARCHAR(100) NOT NULL,
    target_entity      NVARCHAR(100) NOT NULL,
    source_field       NVARCHAR(100) NOT NULL,
    target_field       NVARCHAR(100) NOT NULL,
    relationship_type  NVARCHAR(50)  NOT NULL DEFAULT 'lookup',
    cascade_delete     BIT           NOT NULL DEFAULT 0,
    display_field      NVARCHAR(100) NULL,
    created_at         DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_rel_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT UQ_rel_tenant_name UNIQUE (tenant_id, name)
);
GO

/* ---------- 9. roles ---------- */
IF OBJECT_ID('dbo.roles','U') IS NULL
CREATE TABLE dbo.roles (
    id           NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id    NVARCHAR(64)  NOT NULL,
    name         NVARCHAR(120) NOT NULL,
    description  NVARCHAR(400) NULL,
    permissions  NVARCHAR(MAX) NOT NULL,
    is_system    BIT           NOT NULL DEFAULT 0,
    created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_roles_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
GO

/* ---------- 10. web_content ---------- */
IF OBJECT_ID('dbo.web_content','U') IS NULL
CREATE TABLE dbo.web_content (
    id          NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id   NVARCHAR(64)  NOT NULL,
    slug        NVARCHAR(200) NOT NULL,
    type        NVARCHAR(50)  NOT NULL,
    title       NVARCHAR(300) NULL,
    content     NVARCHAR(MAX) NULL,
    metadata    NVARCHAR(MAX) NULL,
    created_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_webcontent_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT UQ_webcontent_slug UNIQUE (tenant_id, slug)
);
GO

/* ---------- 11. audit_logs ---------- */
IF OBJECT_ID('dbo.audit_logs','U') IS NULL
CREATE TABLE dbo.audit_logs (
    id           NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id    NVARCHAR(64)  NOT NULL,
    entity_type  NVARCHAR(100) NOT NULL,
    record_id    NVARCHAR(64)  NOT NULL,
    action       NVARCHAR(50)  NOT NULL,   -- 'create' | 'update' | 'delete'
    actor_id     NVARCHAR(64)  NULL,
    details      NVARCHAR(MAX) NULL,       -- JSON of changes
    created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_audit_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
GO

/* ---------- 12. workflows ---------- */
IF OBJECT_ID('dbo.workflows','U') IS NULL
CREATE TABLE dbo.workflows (
    id            NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id     NVARCHAR(64)  NOT NULL,
    name          NVARCHAR(200) NOT NULL,
    entity_type   NVARCHAR(100) NOT NULL,
    trigger_type  NVARCHAR(50)  NOT NULL,  -- 'create' | 'update' | 'delete'
    conditions    NVARCHAR(MAX) NULL,      -- JSON logic
    actions       NVARCHAR(MAX) NOT NULL,  -- JSON actions
    is_active     BIT           NOT NULL DEFAULT 1,
    flow_data     NVARCHAR(MAX) NULL,
    created_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_workflows_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
GO

/* ---------- 13. settings ---------- */
IF OBJECT_ID('dbo.settings','U') IS NULL
CREATE TABLE dbo.settings (
    id          NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id   NVARCHAR(64)  NOT NULL UNIQUE,
    config      NVARCHAR(MAX) NOT NULL,
    updated_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_settings_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
GO

/* ---------- 14. dashboard_widgets ---------- */
IF OBJECT_ID('dbo.dashboard_widgets','U') IS NULL
CREATE TABLE dbo.dashboard_widgets (
    id          NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id   NVARCHAR(64)  NOT NULL UNIQUE,
    config      NVARCHAR(MAX) NOT NULL,
    updated_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_dashwidgets_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
GO

/* ---------- 15. lead_rules ---------- */
IF OBJECT_ID('dbo.lead_rules','U') IS NULL
CREATE TABLE dbo.lead_rules (
    id               NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id        NVARCHAR(64)  NOT NULL,
    name             NVARCHAR(200) NOT NULL,
    description      NVARCHAR(400) NULL,
    source_entity    NVARCHAR(100) NOT NULL,
    target_entity    NVARCHAR(100) NOT NULL DEFAULT 'lead',
    conditions       NVARCHAR(MAX) NOT NULL,   -- JSON: { match, rules:[...] }
    field_mapping    NVARCHAR(MAX) NULL,       -- JSON
    default_values   NVARCHAR(MAX) NULL,       -- JSON
    assign_to        NVARCHAR(64)  NULL,
    dedupe           BIT           NOT NULL DEFAULT 1,
    is_active        BIT           NOT NULL DEFAULT 1,
    schedule         NVARCHAR(20)  NOT NULL DEFAULT 'manual', -- manual|realtime|interval
    interval_minutes INT           NULL,
    next_run_at      DATETIME2     NULL,
    last_run_at      DATETIME2     NULL,
    last_run_count   INT           NOT NULL DEFAULT 0,
    created_at       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_leadrules_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
GO

/* ---------- 16. call_logs ---------- */
IF OBJECT_ID('dbo.call_logs','U') IS NULL
CREATE TABLE dbo.call_logs (
    id              NVARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id       NVARCHAR(64)  NOT NULL,
    call_sid        NVARCHAR(100) NULL,
    direction       NVARCHAR(20)  NOT NULL DEFAULT 'inbound',
    from_number     NVARCHAR(50)  NULL,
    to_number       NVARCHAR(50)  NULL,
    status          NVARCHAR(50)  NULL,
    matched_entity  NVARCHAR(100) NULL,
    matched_id      NVARCHAR(64)  NULL,
    matched_name    NVARCHAR(300) NULL,
    outcome         NVARCHAR(100) NULL,
    notes           NVARCHAR(MAX) NULL,
    created_at      DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_calllogs_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
GO

/* ============================ INDEXES ============================ */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_call_logs_tenant' AND object_id=OBJECT_ID('dbo.call_logs'))
    CREATE INDEX idx_call_logs_tenant ON dbo.call_logs(tenant_id, created_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_lead_rules_tenant' AND object_id=OBJECT_ID('dbo.lead_rules'))
    CREATE INDEX idx_lead_rules_tenant ON dbo.lead_rules(tenant_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_records_tenant_entity' AND object_id=OBJECT_ID('dbo.records'))
    CREATE INDEX idx_records_tenant_entity ON dbo.records(tenant_id, entity_type);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_records_lookup' AND object_id=OBJECT_ID('dbo.records'))
    CREATE INDEX idx_records_lookup ON dbo.records(tenant_id, entity_type, id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_entity_defs' AND object_id=OBJECT_ID('dbo.entity_definitions'))
    CREATE INDEX idx_entity_defs ON dbo.entity_definitions(tenant_id, entity_type);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_rel_tenant' AND object_id=OBJECT_ID('dbo.relationships'))
    CREATE INDEX idx_rel_tenant ON dbo.relationships(tenant_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_rel_entities' AND object_id=OBJECT_ID('dbo.relationships'))
    CREATE INDEX idx_rel_entities ON dbo.relationships(source_entity, target_entity);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_audit_logs_record' AND object_id=OBJECT_ID('dbo.audit_logs'))
    CREATE INDEX idx_audit_logs_record ON dbo.audit_logs(tenant_id, record_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_audit_logs_entity' AND object_id=OBJECT_ID('dbo.audit_logs'))
    CREATE INDEX idx_audit_logs_entity ON dbo.audit_logs(tenant_id, entity_type);
GO

/* ============================ SEED (minimal — lets the app boot) ============================ */
IF NOT EXISTS (SELECT 1 FROM dbo.tenants WHERE id='default')
    INSERT INTO dbo.tenants (id, name) VALUES ('default', 'Default Organization');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.menus WHERE tenant_id='default')
    INSERT INTO dbo.menus (id, tenant_id, config) VALUES (
      'default_menu', 'default',
      N'[{"id":"dashboard","label":"Dashboard","icon":"LayoutDashboard","view":"dashboard","type":"item"},{"id":"leads","label":"Leads","icon":"Users","view":"leads","type":"item"},{"id":"contacts","label":"Contacts","icon":"Contact","view":"contacts","type":"item"},{"id":"deals","label":"Deals","icon":"Briefcase","view":"deals","type":"item"},{"id":"reports","label":"Reports","icon":"BarChart3","view":"reports","type":"item"},{"id":"users","label":"Users & Roles","icon":"Shield","view":"users","type":"item","allowedRoles":["admin"]}]');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.dashboard_widgets WHERE tenant_id='default')
    INSERT INTO dbo.dashboard_widgets (id, tenant_id, config) VALUES (
      'default_widgets', 'default',
      N'[{"id":"w1","title":"Total Revenue","type":"stat","visible":true,"order":1,"width":"third"},{"id":"w2","title":"Active Leads","type":"stat","visible":true,"order":2,"width":"third"},{"id":"w3","title":"Conversion Rate","type":"stat","visible":true,"order":3,"width":"third"},{"id":"w4","title":"Revenue Trend","type":"chart","visible":true,"order":4,"width":"half"},{"id":"w5","title":"Recent Leads","type":"list","visible":true,"order":5,"width":"half"}]');
GO

PRINT 'FlowCRM schema created: 16 tables, 9 indexes, default tenant seeded.';
GO
