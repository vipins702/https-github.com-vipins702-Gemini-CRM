
import { SQLiteAdapter } from './db/sqlite.js';
import { PostgresAdapter } from './db/postgres.js';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const DB_TYPE = process.env.DB_TYPE || 'sqlite';

let dbInstance;

if (DB_TYPE === 'sqlite') {
    dbInstance = new SQLiteAdapter();
} else if (DB_TYPE === 'postgres') {
    dbInstance = new PostgresAdapter();
} else {
    throw new Error(`Unsupported DB_TYPE: ${DB_TYPE}`);
}

export default dbInstance;

export async function initDB() {
    console.log(`Initializing Database (${DB_TYPE})...`);

    try {
        // 1. Tenants
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS tenants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Users
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                email TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                first_name TEXT,
                last_name TEXT,
                is_active INTEGER DEFAULT 1,
                must_change_password INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                UNIQUE(tenant_id, email)
            )
        `);

        // Migration: Add is_active if missing (for existing dbs)
        try {
            const columns = await dbInstance.all(`PRAGMA table_info(users)`);
            if (!columns.some(c => c.name === 'is_active')) {
                console.log('Migrating users table: Adding is_active column...');
                await dbInstance.run(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
            }
        } catch (e) {
            console.error('Migration error (users.is_active):', e);
        }

        // Migration: Add must_change_password if missing
        try {
            const columns = await dbInstance.all(`PRAGMA table_info(users)`);
            if (!columns.some(c => c.name === 'must_change_password')) {
                console.log('Migrating users table: Adding must_change_password column...');
                await dbInstance.run(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 1`);
            }
        } catch (e) {
            console.error('Migration error (users.must_change_password):', e);
        }

        // Migration: Add is_superadmin (platform owner — bypasses tenant scoping)
        try {
            const columns = await dbInstance.all(`PRAGMA table_info(users)`);
            if (!columns.some(c => c.name === 'is_superadmin')) {
                console.log('Migrating users table: Adding is_superadmin column...');
                await dbInstance.run(`ALTER TABLE users ADD COLUMN is_superadmin INTEGER DEFAULT 0`);
            }
        } catch (e) {
            console.error('Migration error (users.is_superadmin):', e);
        }

        // 3. Entity Definitions
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS entity_definitions (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                config TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                UNIQUE(tenant_id, entity_type)
            )
        `);

        // 4. Records
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                primary_display TEXT, 
                status TEXT,
                data TEXT NOT NULL,
                owner_id TEXT,
                normalized_phone TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                FOREIGN KEY (owner_id) REFERENCES users(id)
            )
        `);

        // Migration: Add owner_id and normalized_phone if missing
        try {
            const columns = await dbInstance.all(`PRAGMA table_info(records)`);
            if (!columns.some(c => c.name === 'owner_id')) {
                console.log('Migrating records table: Adding owner_id column...');
                await dbInstance.run(`ALTER TABLE records ADD COLUMN owner_id TEXT REFERENCES users(id)`);
            }
            if (!columns.some(c => c.name === 'normalized_phone')) {
                console.log('Migrating records table: Adding normalized_phone column...');
                await dbInstance.run(`ALTER TABLE records ADD COLUMN normalized_phone TEXT`);
                console.log('Migrating records table: Creating unique index for normalized_phone on customers...');
                await dbInstance.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_records_customer_phone ON records(tenant_id, normalized_phone) WHERE entity_type = 'customer' AND normalized_phone IS NOT NULL AND normalized_phone != ''`);
            }
        } catch (e) {
            console.error('Migration error (records):', e);
        }

        // 5. Layouts
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS layouts (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                config TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                UNIQUE(tenant_id, entity_type)
            )
        `);

        // 6. Menus
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS menus (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                config TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 7. Lookup Values
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS lookup_values (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                lookup_id TEXT NOT NULL,
                value_id TEXT NOT NULL,
                value TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                UNIQUE(tenant_id, lookup_id, value_id)
            )
        `);

        // 7b. Lookup Sources
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS lookup_sources (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                lookup_id TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_entity TEXT,
                value_field TEXT DEFAULT 'id',
                label_field TEXT DEFAULT 'name',
                sql_query TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                UNIQUE(tenant_id, lookup_id)
            )
        `);

        // 8. Relationships
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS relationships (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                source_entity TEXT NOT NULL,
                target_entity TEXT NOT NULL,
                source_field TEXT NOT NULL,
                target_field TEXT NOT NULL,
                relationship_type TEXT DEFAULT 'lookup',
                cascade_delete INTEGER DEFAULT 0,
                display_field TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                UNIQUE(tenant_id, name)
            )
        `);

        // 9. Roles
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS roles (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                permissions TEXT NOT NULL,
                is_system INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 10. Web Content
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS web_content (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                slug TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT,
                content TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                UNIQUE(tenant_id, slug)
            )
        `);

        // 11. Audit Logs
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                record_id TEXT NOT NULL,
                action TEXT NOT NULL, -- 'create', 'update', 'delete'
                actor_id TEXT, -- User ID
                details TEXT, -- JSON of changes
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 12. Workflows
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                trigger_type TEXT NOT NULL, -- 'create', 'update', 'delete'
                conditions TEXT, -- JSON logic
                actions TEXT NOT NULL, -- JSON actions
                is_active INTEGER DEFAULT 1,
                flow_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // Migration: Add flow_data if missing
        try {
            const columns = await dbInstance.all(`PRAGMA table_info(workflows)`);
            if (!columns.some(c => c.name === 'flow_data')) {
                console.log('Migrating workflows table: Adding flow_data column...');
                await dbInstance.run(`ALTER TABLE workflows ADD COLUMN flow_data TEXT`);
            }
        } catch (e) {
            console.error('Migration error (workflows.flow_data):', e);
        }

        // 13. Settings
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL UNIQUE,
                config TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 14. Dashboard Widgets (per-tenant dashboard configuration)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS dashboard_widgets (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL UNIQUE,
                config TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 15. Lead Generation Rules (segment-based auto lead creation)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS lead_rules (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                source_entity TEXT NOT NULL,
                target_entity TEXT NOT NULL DEFAULT 'lead',
                conditions TEXT NOT NULL,      -- JSON: { match: 'all'|'any', rules: [{field, operator, value}] }
                field_mapping TEXT,            -- JSON: { leadField: 'sourceField' }
                default_values TEXT,           -- JSON: { source: 'Auto', score: 10 }
                assign_to TEXT,                -- user id (optional)
                dedupe INTEGER DEFAULT 1,
                is_active INTEGER DEFAULT 1,
                schedule TEXT DEFAULT 'manual', -- 'manual' | 'realtime' | 'interval'
                interval_minutes INTEGER,       -- for schedule = 'interval'
                next_run_at DATETIME,           -- next scheduled run (interval mode)
                last_run_at DATETIME,
                last_run_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // Migration: add scheduling columns to lead_rules if missing (for DBs created earlier this session)
        try {
            const cols = await dbInstance.all(`PRAGMA table_info(lead_rules)`);
            const names = cols.map(c => c.name);
            if (!names.includes('schedule')) await dbInstance.run(`ALTER TABLE lead_rules ADD COLUMN schedule TEXT DEFAULT 'manual'`);
            if (!names.includes('interval_minutes')) await dbInstance.run(`ALTER TABLE lead_rules ADD COLUMN interval_minutes INTEGER`);
            if (!names.includes('next_run_at')) await dbInstance.run(`ALTER TABLE lead_rules ADD COLUMN next_run_at DATETIME`);
        } catch (e) {
            console.error('Migration error (lead_rules schedule columns):', e);
        }

        // 16. Call Logs (CTI / telephony)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS call_logs (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 17. WhatsApp Messages (Business Cloud API conversations)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS wa_messages (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                wa_message_id TEXT,            -- Meta message id (dedupe inbound webhooks)
                direction TEXT NOT NULL,       -- 'inbound' | 'outbound'
                phone TEXT NOT NULL,           -- normalized counterparty number
                profile_name TEXT,             -- WhatsApp display name (inbound only)
                body TEXT,
                msg_type TEXT DEFAULT 'text',  -- text | image | audio | unsupported
                matched_entity TEXT,           -- lead | customer
                matched_id TEXT,
                status TEXT DEFAULT 'received',-- received | sent | simulated | failed
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 18b. Processes (configurable per-entity stage definitions / pipelines)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS processes (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                config TEXT NOT NULL,          -- JSON: { name, stages: [{id,name,order,color,type,requiredFields,entryActions}] }
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                UNIQUE(tenant_id, entity_type)
            )
        `);

        // 18. Email Messages (sent/received email, logged to contact timelines)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS email_messages (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                direction TEXT NOT NULL,       -- 'outbound' | 'inbound'
                contact_email TEXT NOT NULL,    -- the lead/customer address (counterparty)
                from_address TEXT,
                to_address TEXT,
                subject TEXT,
                body TEXT,
                matched_entity TEXT,            -- lead | customer
                matched_id TEXT,
                status TEXT DEFAULT 'queued',   -- queued | sent | simulated | failed
                error TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 21. Campaigns (bulk outreach via email/whatsapp to a segment) + per-recipient sends
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS campaigns (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                channel TEXT NOT NULL DEFAULT 'email',  -- 'email' | 'whatsapp' | 'web_form'
                entity_type TEXT NOT NULL DEFAULT 'lead',
                filters TEXT,                            -- JSON [{field,op,value}]
                subject TEXT,
                body TEXT,
                form_template TEXT,                      -- JSON for web_form channel
                status TEXT DEFAULT 'Draft',             -- Draft | Sending | Sent
                audience_count INTEGER DEFAULT 0,
                sent_count INTEGER DEFAULT 0,
                failed_count INTEGER DEFAULT 0,
                opened_count INTEGER DEFAULT 0,
                submission_count INTEGER DEFAULT 0,      -- for web_form
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sent_at DATETIME,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS campaign_sends (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                campaign_id TEXT NOT NULL,
                record_id TEXT,
                contact TEXT,                            -- email or phone
                status TEXT DEFAULT 'sent',              -- sent | simulated | failed
                opened INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends(campaign_id)`);

        // 20. Category trees (configurable cascading picklists, e.g. Product matrix)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS category_trees (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                set_key TEXT NOT NULL,
                tree TEXT NOT NULL,            -- JSON: [{ name, children:[{name}] }]
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                UNIQUE(tenant_id, set_key)
            )
        `);

        // 19. Attachments (files/images linked to any record)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                record_id TEXT NOT NULL,
                filename TEXT NOT NULL,        -- original name
                stored_name TEXT NOT NULL,     -- uuid name on disk
                mime TEXT,
                size INTEGER,
                kind TEXT DEFAULT 'file',      -- 'image' | 'file'
                uploaded_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 22. Record Notes (timeline comments per lead/customer/case, date-stamped, linked to stage)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS record_notes (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                record_id TEXT NOT NULL,
                stage_name TEXT,               -- which stage the lead was in when note was added
                note TEXT NOT NULL,
                kind TEXT DEFAULT 'comment',   -- 'comment' | 'stage_change' | 'call' | 'email'
                actor_id TEXT,
                actor_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_notes_record ON record_notes(tenant_id, entity_type, record_id, created_at)`);

        // 23. Notifications (in-app bell + browser push)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT,
                kind TEXT DEFAULT 'info',      -- 'info' | 'reminder' | 'alert' | 'task_due'
                record_id TEXT,
                entity_type TEXT,
                is_read INTEGER DEFAULT 0,
                scheduled_at DATETIME,         -- when to fire (for reminders)
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(tenant_id, user_id, is_read, created_at)`);

        // 24. Saved Reports (configurable report definitions)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS saved_reports (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                entity_type TEXT NOT NULL,
                columns TEXT NOT NULL,          -- JSON [{field, label, aggregate?}]
                filters TEXT,                   -- JSON [{field, op, value, logic}]
                group_by TEXT,                  -- JSON [field]
                sort_by TEXT,                   -- JSON [{field, dir}]
                viz_type TEXT DEFAULT 'table',  -- table | bar | line | pie | metric
                is_shared INTEGER DEFAULT 0,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 25. Campaign Form Submissions
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS form_submissions (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                campaign_id TEXT NOT NULL,
                record_id TEXT,                -- the created/matched record id
                data TEXT NOT NULL,            -- JSON of submitted field values
                submitter_ip TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_form_submissions_campaign ON form_submissions(tenant_id, campaign_id, created_at)`);

        // 26. Per-tenant integration credentials (WhatsApp / Facebook / Instagram / Email / etc.)
        // config is JSON holding provider-specific keys (tokens, ids). enabled gates live use;
        // when disabled or absent, services fall back to global env config (single-tenant dev).
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS integrations (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                provider TEXT NOT NULL,        -- whatsapp | facebook | instagram | email
                config TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, provider),
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id, provider)`);

        // 27. Scoring Rules (auto-score leads based on field values)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS scoring_rules (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                field TEXT NOT NULL,
                operator TEXT NOT NULL,
                value TEXT,
                points INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 28. Assignment Rules (route leads to users by conditions)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS assignment_rules (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                conditions TEXT NOT NULL DEFAULT '{}',
                assign_to TEXT,
                mode TEXT DEFAULT 'specific',
                priority INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 29. Assignment State (tracks round-robin position per tenant)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS assignment_state (
                tenant_id TEXT PRIMARY KEY,
                last_assigned_user_id TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 30. Drip Sequences
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS sequences (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                entity_type TEXT NOT NULL DEFAULT 'lead',
                steps TEXT NOT NULL DEFAULT '[]',
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        `);

        // 31. Sequence Enrollments
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS sequence_enrollments (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                sequence_id TEXT NOT NULL,
                record_id TEXT NOT NULL,
                step_index INTEGER DEFAULT 0,
                next_step_at DATETIME,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id),
                FOREIGN KEY (sequence_id) REFERENCES sequences(id)
            )
        `);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_seq_enrollments_due ON sequence_enrollments(status, next_step_at)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_seq_enrollments_record ON sequence_enrollments(tenant_id, record_id)`);

        // Indexes
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_attachments_record ON attachments(tenant_id, entity_type, record_id)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_email_messages_tenant_contact ON email_messages(tenant_id, contact_email, created_at)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_wa_messages_tenant_phone ON wa_messages(tenant_id, phone, created_at)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_wa_messages_waid ON wa_messages(wa_message_id)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_call_logs_tenant ON call_logs(tenant_id, created_at)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_lead_rules_tenant ON lead_rules(tenant_id)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_records_tenant_entity ON records(tenant_id, entity_type)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_records_lookup ON records(tenant_id, entity_type, id)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_entity_defs ON entity_definitions(tenant_id, entity_type)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_rel_tenant ON relationships(tenant_id)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_rel_entities ON relationships(source_entity, target_entity)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(tenant_id, record_id)`);
        await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(tenant_id, entity_type)`);

        console.log('Database initialized successfully.');

        // Seed Default Tenant
        const tenant = await dbInstance.get('SELECT * FROM tenants WHERE id = ?', 'default');
        if (!tenant) {
            await dbInstance.run('INSERT INTO tenants (id, name) VALUES (?, ?)', 'default', 'Default Organization');
            console.log('Seeded default tenant');

            // Seed Default Menu
            const defaultMenu = [
                { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', view: 'dashboard', type: 'item' },
                { id: 'leads', label: 'Leads', icon: 'Users', view: 'leads', type: 'item' },
                { id: 'contacts', label: 'Contacts', icon: 'Contact', view: 'contacts', type: 'item' },
                { id: 'deals', label: 'Deals', icon: 'Briefcase', view: 'deals', type: 'item' },
                { id: 'users', label: 'Users & Roles', icon: 'Shield', view: 'users', type: 'item', allowedRoles: ['admin'] }
            ];
            await dbInstance.run('INSERT INTO menus (id, tenant_id, config) VALUES (?, ?, ?)', 'default_menu', 'default', JSON.stringify(defaultMenu));
            console.log('Seeded default menu');
        }

        // Seed Default Dashboard Widgets if missing
        const widgetConfig = await dbInstance.get('SELECT * FROM dashboard_widgets WHERE tenant_id = ?', 'default');
        if (!widgetConfig) {
            const defaultWidgets = [
                { id: 'w1', title: 'Total Revenue', type: 'stat', visible: true, order: 1, width: 'third' },
                { id: 'w2', title: 'Active Leads', type: 'stat', visible: true, order: 2, width: 'third' },
                { id: 'w3', title: 'Conversion Rate', type: 'stat', visible: true, order: 3, width: 'third' },
                { id: 'w4', title: 'Revenue Trend', type: 'chart', visible: true, order: 4, width: 'half' },
                { id: 'w5', title: 'Recent Leads', type: 'list', visible: true, order: 5, width: 'half' }
            ];
            await dbInstance.run('INSERT INTO dashboard_widgets (id, tenant_id, config) VALUES (?, ?, ?)', 'default_widgets', 'default', JSON.stringify(defaultWidgets));
            console.log('Seeded default dashboard widgets');
        }

        // Seed Default Workflow if missing
        const defaultWorkflow = await dbInstance.get('SELECT * FROM workflows WHERE tenant_id = ?', 'default');
        if (!defaultWorkflow) {
            const initialFlowNodes = [
                { id: '1', type: 'trigger', data: { label: 'On Lead Create', type: 'trigger', icon: 'zap' }, position: { x: 250, y: 0 }, className: 'bg-slate-900 border-slate-900 text-white border-2 rounded-xl p-3 shadow-lg w-48 text-center font-semibold' },
                { id: '2', type: 'condition', data: { label: 'Score > 50?', type: 'condition', icon: 'git-branch' }, position: { x: 250, y: 120 }, className: 'bg-white border-indigo-200 border-2 rounded-xl p-3 shadow-sm w-48 text-center text-sm font-medium' },
                { id: '3', type: 'action', data: { label: 'Assign: Sales', type: 'action', icon: 'user-plus' }, position: { x: 100, y: 250 }, className: 'bg-white border-indigo-200 border-2 rounded-xl p-3 shadow-sm w-48 text-center text-sm font-medium' },
                { id: '4', type: 'action', data: { label: 'Send Welcome Email', type: 'action', icon: 'mail' }, position: { x: 400, y: 250 }, className: 'bg-white border-indigo-200 border-2 rounded-xl p-3 shadow-sm w-48 text-center text-sm font-medium' },
                { id: '5', type: 'wait', data: { label: 'Wait 2 Days', type: 'wait', icon: 'clock' }, position: { x: 400, y: 350 }, className: 'bg-gray-50 border-gray-200 border-2 rounded-xl p-3 shadow-sm w-48 text-center text-sm font-medium text-gray-500' }
            ];
            const initialFlowEdges = [
                { id: 'e1-2', source: '1', target: '2' },
                { id: 'e2-3', source: '2', target: '3', label: 'Yes' },
                { id: 'e2-4', source: '2', target: '4', label: 'No' },
                { id: 'e4-5', source: '4', target: '5' }
            ];
            const flowData = { nodes: initialFlowNodes, edges: initialFlowEdges };
            const actions = [
                { type: 'email', to: '{email}', subject: 'Welcome to FlowCRM', body: 'Hi {firstName}, thanks for signing up!' }
            ];
            const conditions = { score: 50 };
            
            await dbInstance.run(`
                INSERT INTO workflows (id, tenant_id, name, entity_type, trigger_type, conditions, actions, is_active, flow_data) 
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
            `, 'default_workflow', 'default', 'Lead Nurturing Flow', 'lead', 'create', JSON.stringify(conditions), JSON.stringify(actions), JSON.stringify(flowData));
            console.log('Seeded default workflow');
        }

        // Seed initial admin user if no users exist
        const adminUser = await dbInstance.get('SELECT * FROM users WHERE email = ?', 'admin@flowcrm.com');
        if (!adminUser) {
            const adminEmail = 'admin@flowcrm.com';
            // Default to env variable or generate a random one securely
            const password = process.env.ADMIN_PASSWORD || Math.random().toString(36).slice(-10) + 'A1!';
            const hashedPassword = bcrypt.hashSync(password, 10);
            
            const newUser = {
                id: uuidv4(),
                tenant_id: 'default',
                email: adminEmail,
                password_hash: hashedPassword,
                role: 'admin',
                first_name: 'System',
                last_name: 'Admin'
            };
            
            // Note: Postgres adapter converts object to parameterized, but SQLite adapter doesn't natively do named params in .run except if handled. 
            // Better to use positional parameters:
            await dbInstance.run(
                'INSERT INTO users (id, tenant_id, email, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?, ?)', 
                newUser.id, newUser.tenant_id, newUser.email, newUser.password_hash, newUser.role, newUser.first_name, newUser.last_name
            );
            
            console.log('====================================================');
            console.log(' SEEDED ADMIN USER');
            console.log(` Email: ${adminEmail}`);
            if (!process.env.ADMIN_PASSWORD) {
                console.log(` Password: ${password}   <-- SAVE THIS!`);
            } else {
                console.log(` Password: [Loaded from ADMIN_PASSWORD env var]`);
            }
            console.log('====================================================');
        }

    } catch (err) {
        console.error("Database Initialization Error:", err);
        throw err;
    }
}
