-- Postgres DB Initialization Script for Neon DB

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    is_active INTEGER DEFAULT 1,
    must_change_password INTEGER DEFAULT 1,
    is_superadmin INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS entity_definitions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    entity_type TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, entity_type)
);

CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    entity_type TEXT NOT NULL,
    primary_display TEXT, 
    status TEXT,
    data TEXT NOT NULL,
    owner_id TEXT REFERENCES users(id),
    normalized_phone TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_records_customer_phone ON records(tenant_id, normalized_phone) WHERE entity_type = 'customer' AND normalized_phone IS NOT NULL AND normalized_phone != '';

CREATE TABLE IF NOT EXISTS layouts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    entity_type TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, entity_type)
);

CREATE TABLE IF NOT EXISTS menus (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    config TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lookup_values (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    lookup_id TEXT NOT NULL,
    value_id TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, lookup_id, value_id)
);

CREATE TABLE IF NOT EXISTS lookup_sources (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    lookup_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_entity TEXT,
    value_field TEXT DEFAULT 'id',
    label_field TEXT DEFAULT 'name',
    sql_query TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, lookup_id)
);

CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    source_entity TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    source_field TEXT NOT NULL,
    target_field TEXT NOT NULL,
    relationship_type TEXT DEFAULT 'lookup',
    cascade_delete INTEGER DEFAULT 0,
    display_field TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT,
    permissions TEXT NOT NULL,
    is_system INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS web_content (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    slug TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT,
    content TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    entity_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id TEXT,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    conditions TEXT,
    actions TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    flow_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id),
    config TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id),
    config TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_rules (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT,
    source_entity TEXT NOT NULL,
    target_entity TEXT NOT NULL DEFAULT 'lead',
    conditions TEXT NOT NULL,
    field_mapping TEXT,
    default_values TEXT,
    assign_to TEXT,
    dedupe INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    schedule TEXT DEFAULT 'manual',
    interval_minutes INTEGER,
    next_run_at TIMESTAMP,
    last_run_at TIMESTAMP,
    last_run_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    call_sid TEXT,
    direction TEXT DEFAULT 'inbound',
    from_number TEXT,
    to_number TEXT,
    status TEXT,
    matched_entity TEXT,
    matched_id TEXT,
    matched_name TEXT,
    outcome TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wa_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    wa_message_id TEXT,
    direction TEXT NOT NULL,
    phone TEXT NOT NULL,
    profile_name TEXT,
    body TEXT,
    msg_type TEXT DEFAULT 'text',
    matched_entity TEXT,
    matched_id TEXT,
    status TEXT DEFAULT 'received',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    entity_type TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, entity_type)
);

CREATE TABLE IF NOT EXISTS email_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    direction TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    from_address TEXT,
    to_address TEXT,
    subject TEXT,
    body TEXT,
    matched_entity TEXT,
    matched_id TEXT,
    status TEXT DEFAULT 'queued',
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'email',
    entity_type TEXT NOT NULL DEFAULT 'lead',
    filters TEXT,
    subject TEXT,
    body TEXT,
    form_template TEXT,
    status TEXT DEFAULT 'Draft',
    audience_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    submission_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_sends (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    record_id TEXT,
    contact TEXT,
    status TEXT DEFAULT 'sent',
    opened INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends(campaign_id);

CREATE TABLE IF NOT EXISTS category_trees (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    set_key TEXT NOT NULL,
    tree TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, set_key)
);

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    entity_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT,
    size INTEGER,
    kind TEXT DEFAULT 'file',
    uploaded_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS record_notes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    entity_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    stage_name TEXT,
    note TEXT NOT NULL,
    kind TEXT DEFAULT 'comment',
    actor_id TEXT,
    actor_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_record ON record_notes(tenant_id, entity_type, record_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    kind TEXT DEFAULT 'info',
    record_id TEXT,
    entity_type TEXT,
    is_read INTEGER DEFAULT 0,
    scheduled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(tenant_id, user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS saved_reports (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT,
    entity_type TEXT NOT NULL,
    columns TEXT NOT NULL,
    filters TEXT,
    group_by TEXT,
    sort_by TEXT,
    viz_type TEXT DEFAULT 'table',
    is_shared INTEGER DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS form_submissions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    campaign_id TEXT NOT NULL,
    record_id TEXT,
    data TEXT NOT NULL,
    submitter_ip TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_campaign ON form_submissions(tenant_id, campaign_id, created_at);

CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_attachments_record ON attachments(tenant_id, entity_type, record_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_tenant_contact ON email_messages(tenant_id, contact_email, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_messages_tenant_phone ON wa_messages(tenant_id, phone, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_messages_waid ON wa_messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant ON call_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_rules_tenant ON lead_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_records_tenant_entity ON records(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_records_lookup ON records(tenant_id, entity_type, id);
CREATE INDEX IF NOT EXISTS idx_entity_defs ON entity_definitions(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_rel_tenant ON relationships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rel_entities ON relationships(source_entity, target_entity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(tenant_id, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(tenant_id, entity_type);
