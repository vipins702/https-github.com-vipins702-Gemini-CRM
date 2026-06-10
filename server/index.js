import express from 'express';
import cors from 'cors';
import { PORT, JWT_SECRET } from './config.js';
import { initDB } from './database.js';
import db from './database.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticateToken, requirePermission } from './middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { logAudit } from './services/audit.js';
import { sendEmail } from './services/email.js';
import { evaluateWorkflows } from './services/workflow.js';
import { runLeadRule, runAllActiveRules, evaluateRealtimeLeadRules, startLeadRuleScheduler } from './services/leadgen.js';
import { generateCustomerInsight, isAIEnabled } from './services/ai.js';
import { ingestLead } from './services/ingest.js';
import { lookupByPhone, logCall, getRecentCalls, convertLeadToCustomer, handleInboundCall, routeInbound } from './services/cti.js';

const app = express();

app.use(cors());
app.use(express.json());

// Initialize Database
// Initialize Database
await initDB();

app.get('/', (req, res) => {
    res.send('FlowCRM Backend v1.0 is running. API is at /api');
});

const loginAttempts = new Map();

function loginRateLimiter(req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxAttempts = 5;
    
    if (!loginAttempts.has(ip)) {
        loginAttempts.set(ip, []);
    }
    
    const attempts = loginAttempts.get(ip).filter(timestamp => now - timestamp < windowMs);
    attempts.push(now);
    loginAttempts.set(ip, attempts);
    
    if (attempts.length > maxAttempts) {
        return res.status(429).json({ error: 'Too many login attempts. Please try again in 1 minute.' });
    }
    
    next();
}

// --- Auth Routes ---

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await db.get('SELECT * FROM users WHERE email = ?', email);

        // For Dev/Demo: If user doesn't exist and it's admin, create it (Auto-Seed)
        if (!user && email === 'admin@flowcrm.com') {
            const hashedPassword = bcrypt.hashSync('Admin@123', 10);
            const newUser = {
                id: uuidv4(),
                tenant_id: 'default',
                email: 'admin@flowcrm.com',
                password_hash: hashedPassword,
                role: 'admin',
                first_name: 'System',
                last_name: 'Admin'
            };
            await db.run('INSERT INTO users (id, tenant_id, email, password_hash, role, first_name, last_name) VALUES (@id, @tenant_id, @email, @password_hash, @role, @first_name, @last_name)', newUser);

            const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role, tenantId: newUser.tenant_id }, JWT_SECRET, { expiresIn: '24h' });
            return res.json({
                token,
                user: {
                    id: newUser.id,
                    email: newUser.email,
                    role: newUser.role,
                    name: newUser.first_name + ' ' + newUser.last_name,
                    permissions: { admin: true }
                }
            });
        }

        if (!user) {
            console.log('Login failed: User not found', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.is_active) {
            console.log('Login failed: User inactive', email);
            return res.status(403).json({ error: 'Account is inactive. Contact administrator.' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            console.log('Login failed: Invalid password', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('Login successful', email);

        // Fetch Permissions
        let permissions = {};
        if (user.role === 'admin') {
            permissions = { admin: true };
        } else {
            const role = await db.get('SELECT * FROM roles WHERE id = ? AND tenant_id = ?', user.role, user.tenant_id);
            if (role) {
                try {
                    permissions = JSON.parse(role.permissions);
                } catch (e) {
                    permissions = {};
                }
            }
        }

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, tenantId: user.tenant_id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.first_name + ' ' + user.last_name,
                mustChangePassword: !!user.must_change_password,
                permissions
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- Metadata Routes ---

app.get('/api/metadata/schemas', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all('SELECT entity_type, config FROM entity_definitions WHERE tenant_id = ?', req.tenantId);
        const schemas = {};
        rows.forEach(row => {
            schemas[row.entity_type] = JSON.parse(row.config);
        });
        res.json(schemas);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch schemas' });
    }
});

app.post('/api/metadata/schemas', authenticateToken, async (req, res) => {
    const { entityType, config } = req.body;
    try {
        const id = uuidv4();
        await db.run(`
       INSERT INTO entity_definitions (id, tenant_id, entity_type, config) 
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tenant_id, entity_type) DO UPDATE SET config = excluded.config
     `, id, req.tenantId, entityType, JSON.stringify(config));
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save schema' });
    }
});

// --- Layout Routes ---

app.get('/api/metadata/layouts/:entityType', authenticateToken, async (req, res) => {
    try {
        const { entityType } = req.params;
        const row = await db.get('SELECT config FROM layouts WHERE tenant_id = ? AND entity_type = ?', req.tenantId, entityType);
        if (row) {
            res.json(JSON.parse(row.config));
        } else {
            // Return a default layout structure
            res.json({
                entityType,
                sections: [{ id: 'main', title: 'Details', columns: [{ id: 'c1', width: 12, fields: [] }] }],
                fieldConfigs: {}
            });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch layout' });
    }
});

app.post('/api/metadata/layouts/:entityType', authenticateToken, async (req, res) => {
    const { entityType } = req.params;
    const layoutConfig = req.body;
    try {
        const id = uuidv4();
        await db.run(`
            INSERT INTO layouts (id, tenant_id, entity_type, config) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(tenant_id, entity_type) DO UPDATE SET config = excluded.config
        `, id, req.tenantId, entityType, JSON.stringify(layoutConfig));
        res.json({ success: true });
    } catch (error) {
        console.error('Save layout error:', error);
        res.status(500).json({ error: 'Failed to save layout' });
    }
});

// --- Menu Routes ---

app.get('/api/metadata/menu', authenticateToken, async (req, res) => {
    try {
        console.log('Fetching menu for tenant:', req.tenantId);
        const row = await db.get('SELECT config FROM menus WHERE tenant_id = ?', req.tenantId);
        console.log('Menu row found:', !!row);
        if (row) {
            res.json(JSON.parse(row.config));
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Menu fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch menu' });
    }
});

app.post('/api/metadata/menu', authenticateToken, async (req, res) => {
    const menuConfig = req.body;
    try {
        // Manual upsert (the menus table has no UNIQUE(tenant_id), so ON CONFLICT can't be used)
        const existing = await db.get('SELECT id FROM menus WHERE tenant_id = ?', req.tenantId);
        if (existing) {
            await db.run('UPDATE menus SET config = ? WHERE tenant_id = ?', JSON.stringify(menuConfig), req.tenantId);
        } else {
            await db.run('INSERT INTO menus (id, tenant_id, config) VALUES (?, ?, ?)', uuidv4(), req.tenantId, JSON.stringify(menuConfig));
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Save menu error:', error);
        res.status(500).json({ error: 'Failed to save menu', details: error.message });
    }
});

// --- Web Presenter Routes ---

// Get all web content items
app.get('/api/web-content', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all('SELECT id, slug, type, title, updated_at FROM web_content WHERE tenant_id = ? ORDER BY updated_at DESC', req.tenantId);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch content list' });
    }
});

// Get specific content by slug (or id)
app.get('/api/web-content/:slug', authenticateToken, async (req, res) => {
    const { slug } = req.params;
    try {
        const row = await db.get('SELECT * FROM web_content WHERE tenant_id = ? AND slug = ?', req.tenantId, slug);
        if (row) {
            res.json(row);
        } else {
            res.status(404).json({ error: 'Content not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch content' });
    }
});

// Save content
app.post('/api/web-content', authenticateToken, async (req, res) => {
    const { slug, type, title, content, metadata } = req.body;
    try {
        const id = uuidv4();
        await db.run(`
            INSERT INTO web_content (id, tenant_id, slug, type, title, content, metadata, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(tenant_id, slug) DO UPDATE SET 
                type = excluded.type,
                title = excluded.title, 
                content = excluded.content,
                metadata = excluded.metadata,
                updated_at = CURRENT_TIMESTAMP
        `, id, req.tenantId, slug, type, title, content, JSON.stringify(metadata || {}));
        res.json({ success: true });
    } catch (error) {
        console.error('Save web content error:', error);
        res.status(500).json({ error: 'Failed to save content' });
    }
});

// Execute SQL View (Web Presenter)
app.post('/api/web-presenter/execute-sql', authenticateToken, async (req, res) => {
    const { query } = req.body;

    // Security check: Only allow SELECT
    const forbidden = [';', 'drop', 'delete', 'update', 'insert', 'alter', 'truncate', 'grant', 'exec', 'attach', 'detach', 'pragma'];
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery.startsWith('select')) {
        return res.status(400).json({ error: 'Only SELECT queries are allowed.' });
    }

    if (forbidden.some(word => cleanQuery.includes(word))) {
        return res.status(400).json({ error: 'Query contains forbidden keywords.' });
    }

    try {
        // Inject tenantId automatically
        const safeQuery = query.replace(/:tenantId/gi, `'${req.tenantId}'`);
        const rows = await db.all(safeQuery);
        res.json(rows);
    } catch (error) {
        console.error('Execute SQL error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Record Routes (Hybrid) ---

app.get('/api/data/:entityType', authenticateToken, async (req, res) => {
    const { entityType } = req.params;
    try {
        const rows = await db.all('SELECT * FROM records WHERE tenant_id = ? AND entity_type = ?', req.tenantId, entityType);
        const records = rows.map(row => {
            const data = JSON.parse(row.data);
            return { ...data, id: row.id, created_at: row.created_at, status: row.status };
        });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch records' });
    }
});

// --- Validation Logic ---

const mapFieldTypeToZod = (field) => {
    let schema;
    switch (field.type) {
        case 'text':
        case 'textarea':
        case 'email':
        case 'phone':
        case 'url':
        case 'select':
        case 'status':
        case 'lookup':
            schema = z.string();
            if (field.type === 'email') schema = schema.email();
            if (field.type === 'url') schema = schema.url().or(z.literal(''));
            break;
        case 'number':
        case 'currency':
            // Handle strings mimicking numbers
            schema = z.union([z.number(), z.string().transform(val => Number(val))]);
            break;
        case 'date':
            schema = z.string().or(z.date());
            break;
        case 'boolean':
            schema = z.boolean();
            break;
        default:
            schema = z.any();
    }

    if (!field.required) {
        schema = schema.optional().nullable().or(z.literal(''));
    }
    return schema;
};

app.post('/api/data/:entityType', authenticateToken, async (req, res) => {
    const { entityType } = req.params;
    const recordData = req.body;

    // Check Permissions (create or update)
    const action = recordData.id ? 'edit' : 'create';
    if (req.user.role !== 'admin' && !req.user.permissions?.admin) {
        const perms = req.user.permissions?.[entityType];

        if (!perms || !perms[action]) {
            // Fallback checks ('manage' covers everything, 'write' might cover create/edit)
            const hasManage = perms?.manage;
            const hasWrite = perms?.write; // legacy/simpler model

            if (!hasManage && !hasWrite) {
                if (action === 'edit') {
                    console.warn(`Access denied: ${req.user.email} tried to edit ${entityType}`);
                    return res.status(403).json({ error: `Insufficient permissions to edit ${entityType}` });
                }
                if (action === 'create' && !perms?.create) {
                    return res.status(403).json({ error: `Insufficient permissions to create ${entityType}` });
                }
            }
        }
    }

    try {
        // 1. Fetch Definition
        const defRow = await db.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', req.tenantId, entityType);

        if (!defRow) {
            return res.status(404).json({ error: `Definition for ${entityType} not found` });
        }

        const definition = JSON.parse(defRow.config);

        // 2. Build Zod Schema Dynamically
        const shape = {};
        definition.fields.forEach(field => {
            // System fields like 'id', 'created_at' are handled separately or allowable
            if (!field.system) {
                shape[field.name] = mapFieldTypeToZod(field);
            }
        });

        // Allow ID and standard fields
        const dynamicSchema = z.object(shape).passthrough(); // passthrough allows extra fields for now (like id), but we validate core business fields

        // 3. Validate
        const validationResult = dynamicSchema.safeParse(recordData);

        if (!validationResult.success) {
            return res.status(400).json({
                error: 'Validation Failed',
                details: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
            });
        }

        // Use validated data (sanitized)
        const validData = validationResult.data;
        const id = recordData.id || uuidv4();
        const primaryDisplay = recordData.name || recordData.title || recordData.subject || 'Untitled';
        const status = recordData.status || 'New';

        // Clean data for JSON column (remove ID if present)
        const { id: _, ...jsonData } = recordData;
        const actorId = req.user.id;

        if (recordData.id) {
            // Update
            // Fetch old record for audit diff (optional, or just log 'update')
            const oldRecord = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ?', id, req.tenantId);

            await db.run(`
            UPDATE records 
            SET primary_display = ?, status = ?, data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND tenant_id = ?
        `, primaryDisplay, status, JSON.stringify(jsonData), id, req.tenantId);

            // Log Audit
            await logAudit({
                tenantId: req.tenantId,
                entityType,
                recordId: id,
                action: 'update',
                actorId,
                details: {
                    old: oldRecord ? JSON.parse(oldRecord.data) : null,
                    new: jsonData
                }
            });

            // Trigger Workflows
            await evaluateWorkflows({
                tenantId: req.tenantId,
                entityType,
                triggerType: 'update',
                record: recordData,
                actorId
            });

        } else {
            // Create
            await db.run(`
            INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data)
            VALUES (?, ?, ?, ?, ?, ?)
        `, id, req.tenantId, entityType, primaryDisplay, status, JSON.stringify(jsonData));

            // Log Audit
            await logAudit({
                tenantId: req.tenantId,
                entityType,
                recordId: id,
                action: 'create',
                actorId,
                details: jsonData
            });

            // Trigger Workflows (include the server-generated id so actions can target this record)
            await evaluateWorkflows({
                tenantId: req.tenantId,
                entityType,
                triggerType: 'create',
                record: { ...recordData, id },
                actorId
            });

            // Trigger realtime lead-generation rules for this entity
            await evaluateRealtimeLeadRules({
                tenantId: req.tenantId,
                entityType,
                record: { ...recordData, id },
                actorId
            });
        }

        res.json({ id, ...recordData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save record', details: error.message });
    }
});

app.delete('/api/data/:entityType/:id', authenticateToken, async (req, res) => {
    const { entityType, id } = req.params;
    try {
        // Check Permissions for Delete
        if (req.user.role !== 'admin' && !req.user.permissions?.admin) {
            const perms = req.user.permissions?.[entityType];
            if (!perms || (!perms.delete && !perms.manage)) {
                return res.status(403).json({ error: `Insufficient permissions to delete ${entityType}` });
            }
        }

        const record = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ?', id, req.tenantId);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        await db.run('DELETE FROM records WHERE id = ? AND tenant_id = ?', id, req.tenantId);

        // Log Audit
        await logAudit({
            tenantId: req.tenantId,
            entityType,
            recordId: id,
            action: 'delete',
            actorId: req.user.id,
            details: { name: record.primary_display }
        });

        // Trigger Workflows
        await evaluateWorkflows({
            tenantId: req.tenantId,
            entityType,
            triggerType: 'delete',
            record: { ...JSON.parse(record.data), id: record.id },
            actorId: req.user.id
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

// --- Lookup Values Routes ---

// Get all lookups (grouped by lookup_id) - MUST be before :lookupId route!
app.get('/api/lookups', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all(
            'SELECT DISTINCT lookup_id FROM lookup_values WHERE tenant_id = ?', req.tenantId
        );
        res.json(rows.map(r => r.lookup_id));
    } catch (error) {
        console.error('Get lookups error:', error);
        res.status(500).json({ error: 'Failed to fetch lookups' });
    }
});

// Get available import sources for lookups - MUST be before :lookupId route!
app.get('/api/lookups/import-sources', authenticateToken, async (req, res) => {
    try {
        // Get available entity types from records
        const rows = await db.all(
            'SELECT DISTINCT entity_type FROM records WHERE tenant_id = ?', req.tenantId
        );
        const entityTypes = rows.map(r => r.entity_type);

        const sources = [
            { id: 'users', label: 'Users', valueField: 'id', labelField: 'email', description: 'Import users for assignment fields' },
            ...entityTypes.map(et => ({
                id: `records_${et}`,
                label: `${et.charAt(0).toUpperCase() + et.slice(1)} Records`,
                valueField: 'id',
                labelField: 'primary_display',
                description: `Import ${et} records`
            }))
        ];

        res.json(sources);
    } catch (error) {
        console.error('Get import sources error:', error);
        res.status(500).json({ error: 'Failed to get import sources' });
    }
});

// Get all lookup values for a specific lookup_id (checks for live source first)
app.get('/api/lookups/:lookupId', authenticateToken, async (req, res) => {
    const { lookupId } = req.params;
    try {
        // Check for live source configuration first
        const liveSource = await db.get(
            'SELECT * FROM lookup_sources WHERE tenant_id = ? AND lookup_id = ? AND is_active = 1', req.tenantId, lookupId
        );

        if (liveSource) {
            // Query the source table directly for live values
            let rows = [];

            if (liveSource.source_type === 'users') {
                rows = await db.all(`
                    SELECT id as value_id, 
                           COALESCE(first_name || ' ' || last_name, email) as value 
                    FROM users WHERE tenant_id = ?
                `, req.tenantId);
            } else if (liveSource.source_type === 'records') {
                rows = await db.all(`
                    SELECT id as value_id, 
                           COALESCE(primary_display, id) as value 
                    FROM records WHERE tenant_id = ? AND entity_type = ?
                `, req.tenantId, liveSource.source_entity);
            } else if (liveSource.source_type === 'sql' && liveSource.sql_query) {
                // Custom SQL with tenant filter
                let finalQuery = liveSource.sql_query.replace(/:tenantId/gi, `'${req.tenantId}'`);
                // For SQL we use all()
                const sqlRows = await db.all(finalQuery);
                rows = sqlRows.map(r => ({
                    value_id: String(r[liveSource.value_field] || r.id || r.value_id),
                    value: String(r[liveSource.label_field] || r.name || r.value || 'Unnamed')
                }));
            }

            // Transform to standard lookup format
            const result = rows.map((r, i) => ({
                id: `live_${i}`,
                lookup_id: lookupId,
                value_id: r.value_id,
                value: r.value,
                sort_order: i,
                is_live: true
            }));
            return res.json(result);
        }

        // Fallback to static lookup_values
        const rows = await db.all(
            'SELECT * FROM lookup_values WHERE tenant_id = ? AND lookup_id = ? AND is_active = 1 ORDER BY sort_order', req.tenantId, lookupId
        );
        res.json(rows);
    } catch (error) {
        console.error('Get lookup values error:', error);
        res.status(500).json({ error: 'Failed to fetch lookup values' });
    }
});

// Create or update a lookup value
app.post('/api/lookups/:lookupId', authenticateToken, async (req, res) => {
    const { lookupId } = req.params;
    const { valueId, value, sortOrder = 0 } = req.body;

    if (!valueId || !value) {
        return res.status(400).json({ error: 'valueId and value are required' });
    }

    try {
        const id = uuidv4();
        await db.run(`
            INSERT INTO lookup_values (id, tenant_id, lookup_id, value_id, value, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(tenant_id, lookup_id, value_id) DO UPDATE SET value = excluded.value, sort_order = excluded.sort_order
        `, id, req.tenantId, lookupId, valueId, value, sortOrder);
        res.json({ success: true, id, valueId, value });
    } catch (error) {
        console.error('Save lookup value error:', error);
        res.status(500).json({ error: 'Failed to save lookup value' });
    }
});

// Bulk import lookup values
app.post('/api/lookups/:lookupId/import', authenticateToken, (req, res) => {
    const { lookupId } = req.params;
    const { values } = req.body; // Expecting array of { valueId, value, sortOrder }

    if (!Array.isArray(values)) {
        return res.status(400).json({ error: 'Values must be an array' });
    }

    const insert = db.prepare(`
        INSERT INTO lookup_values (id, tenant_id, lookup_id, value_id, value, sort_order)
        VALUES (@id, @tenantId, @lookupId, @valueId, @value, @sortOrder)
        ON CONFLICT(tenant_id, lookup_id, value_id) DO UPDATE SET value = excluded.value, sort_order = excluded.sort_order
    `);

    const insertMany = db.transaction((items) => {
        for (const item of items) {
            insert.run({
                id: uuidv4(),
                tenantId: req.tenantId,
                lookupId,
                valueId: item.valueId || item.value.toLowerCase().replace(/\s+/g, '_'), // Auto-generate ID if missing
                value: item.value,
                sortOrder: item.sortOrder || 0
            });
        }
    });

    try {
        insertMany(values);
        res.json({ success: true, count: values.length });
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ error: 'Failed to import values' });
    }
});

// --- LIVE LOOKUP SOURCES ---

// Get live source config for a lookup
app.get('/api/lookups/:lookupId/live-source', authenticateToken, (req, res) => {
    const { lookupId } = req.params;
    try {
        const source = db.prepare(
            'SELECT * FROM lookup_sources WHERE tenant_id = ? AND lookup_id = ? AND is_active = 1'
        ).get(req.tenantId, lookupId);
        res.json(source || null);
    } catch (error) {
        console.error('Get live source error:', error);
        res.status(500).json({ error: 'Failed to get live source' });
    }
});

// Configure live source for a lookup
app.post('/api/lookups/:lookupId/live-source', authenticateToken, (req, res) => {
    const { lookupId } = req.params;
    const { sourceType, sourceEntity, valueField = 'id', labelField = 'name', sqlQuery } = req.body;

    if (!sourceType) {
        return res.status(400).json({ error: 'sourceType is required' });
    }

    try {
        db.prepare(`
            INSERT INTO lookup_sources (id, tenant_id, lookup_id, source_type, source_entity, value_field, label_field, sql_query)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tenant_id, lookup_id) DO UPDATE SET 
                source_type = excluded.source_type,
                source_entity = excluded.source_entity,
                value_field = excluded.value_field,
                label_field = excluded.label_field,
                sql_query = excluded.sql_query,
                is_active = 1
        `).run(uuidv4(), req.tenantId, lookupId, sourceType, sourceEntity || null, valueField, labelField, sqlQuery || null);

        res.json({ success: true, message: 'Live source configured' });
    } catch (error) {
        console.error('Configure live source error:', error);
        res.status(500).json({ error: 'Failed to configure live source' });
    }
});

// Remove live source config (revert to static values)
app.delete('/api/lookups/:lookupId/live-source', authenticateToken, (req, res) => {
    const { lookupId } = req.params;
    try {
        db.prepare(
            'UPDATE lookup_sources SET is_active = 0 WHERE tenant_id = ? AND lookup_id = ?'
        ).run(req.tenantId, lookupId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete live source error:', error);
        res.status(500).json({ error: 'Failed to remove live source' });
    }
});

// Delete a lookup value
app.delete('/api/lookups/:lookupId/:valueId', authenticateToken, (req, res) => {
    const { lookupId, valueId } = req.params;
    try {
        db.prepare(
            'UPDATE lookup_values SET is_active = 0 WHERE tenant_id = ? AND lookup_id = ? AND value_id = ?'
        ).run(req.tenantId, lookupId, valueId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete lookup value error:', error);
        res.status(500).json({ error: 'Failed to delete lookup value' });
    }
});

// Import lookup values from a predefined source (users, records)
app.post('/api/lookups/:lookupId/import-from-source', authenticateToken, async (req, res) => {
    const { lookupId } = req.params;
    const { source, valueField = 'id', labelField = 'email' } = req.body;

    if (!source) {
        return res.status(400).json({ error: 'Source is required' });
    }

    try {
        let rows = [];

        if (source === 'users') {
            // Import from users table with tenant filter
            rows = await db.all(
                `SELECT id as value_id, 
                 COALESCE(first_name || ' ' || last_name, email) as value 
                 FROM users WHERE tenant_id = ?`, req.tenantId
            );
        } else if (source.startsWith('records_')) {
            // Import from records table (entity-specific)
            const entityType = source.replace('records_', '');
            rows = await db.all(
                `SELECT id as value_id, primary_display as value 
                 FROM records WHERE tenant_id = ? AND entity_type = ?`, req.tenantId, entityType
            );
        } else {
            return res.status(400).json({ error: 'Invalid source' });
        }

        if (rows.length === 0) {
            return res.json({ success: true, count: 0, message: 'No records found to import' });
        }

        // Insert values into lookup_values
        /* 
           Transaction handling: 
           Adapter transaction() returns the sync sqlite transaction function.
           We must use sync prepare inside it or use run in loop.
           Using prepare from adapter:
        */
        const insert = db.prepare(`
            INSERT INTO lookup_values (id, tenant_id, lookup_id, value_id, value, sort_order)
            VALUES (@id, @tenantId, @lookupId, @valueId, @value, @sortOrder)
            ON CONFLICT(tenant_id, lookup_id, value_id) DO UPDATE SET value = excluded.value
        `);

        // Insert transaction remains synchronous as better-sqlite3 transactions are synchronous
        const insertMany = db.transaction((items) => {
            for (let i = 0; i < items.length; i++) {
                insert.run({
                    id: uuidv4(),
                    tenantId: req.tenantId,
                    lookupId,
                    valueId: items[i].value_id,
                    value: items[i].value || 'Unnamed',
                    sortOrder: i
                });
            }
        });

        insertMany(rows);
        res.json({ success: true, count: rows.length });
    } catch (error) {
        console.error('Import from source error:', error);
        res.status(500).json({ error: 'Failed to import from source' });
    }
});

// Import lookup values from custom SQL query (with tenant_id always enforced)
app.post('/api/lookups/:lookupId/import-from-sql', authenticateToken, async (req, res) => {
    const { lookupId } = req.params;
    const { query, valueColumn = 'value_id', labelColumn = 'value' } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    // Security: Only allow SELECT statements
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery.startsWith('select')) {
        return res.status(400).json({ error: 'Only SELECT queries are allowed' });
    }

    // Security: Disallow dangerous keywords
    const dangerousKeywords = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'exec', 'execute'];
    for (const keyword of dangerousKeywords) {
        if (cleanQuery.includes(keyword)) {
            return res.status(400).json({ error: `Query contains forbidden keyword: ${keyword}` });
        }
    }

    try {
        // Replace :tenantId placeholder with actual tenant ID
        let finalQuery = query.replace(/:tenantId/gi, `'${req.tenantId}'`);

        // Execute the query
        const rows = await db.all(finalQuery);

        if (rows.length === 0) {
            return res.json({ success: true, count: 0, message: 'Query returned no results' });
        }

        // Map results to lookup values
        const insert = db.prepare(`
            INSERT INTO lookup_values (id, tenant_id, lookup_id, value_id, value, sort_order)
            VALUES (@id, @tenantId, @lookupId, @valueId, @value, @sortOrder)
            ON CONFLICT(tenant_id, lookup_id, value_id) DO UPDATE SET value = excluded.value
        `);

        const insertMany = db.transaction((items) => {
            for (let i = 0; i < items.length; i++) {
                const row = items[i];
                insert.run({
                    id: uuidv4(),
                    tenantId: req.tenantId,
                    lookupId,
                    valueId: String(row[valueColumn] || row.value_id || row.id || i),
                    value: String(row[labelColumn] || row.value || row.name || row.label || 'Unnamed'),
                    sortOrder: i
                });
            }
        });

        insertMany(rows);
        res.json({ success: true, count: rows.length });
    } catch (error) {
        console.error('Import from SQL error:', error);
        res.status(500).json({ error: `Query error: ${error.message}` });
    }
});

// --- Relationship Routes ---

// Get all relationships
app.get('/api/relationships', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM relationships WHERE tenant_id = ?', req.tenantId);
        res.json(rows);
    } catch (error) {
        console.error('Get relationships error:', error);
        res.status(500).json({ error: 'Failed to fetch relationships' });
    }
});

// Get single relationship by id
app.get('/api/relationships/:id', authenticateToken, async (req, res) => {
    try {
        const row = await db.get('SELECT * FROM relationships WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        if (row) {
            res.json(row);
        } else {
            res.status(404).json({ error: 'Relationship not found' });
        }
    } catch (error) {
        console.error('Get relationship error:', error);
        res.status(500).json({ error: 'Failed to fetch relationship' });
    }
});

// Create relationship with column mapping
app.post('/api/relationships', authenticateToken, async (req, res) => {
    const { name, sourceEntity, targetEntity, sourceField, targetField, relationshipType = 'lookup', cascadeDelete = false, displayField = 'id' } = req.body;

    if (!name || !sourceEntity || !targetEntity || !sourceField || !targetField) {
        return res.status(400).json({ error: 'Missing required fields: name, sourceEntity, targetEntity, sourceField, targetField' });
    }

    try {
        const id = uuidv4();
        await db.run(`
            INSERT INTO relationships (id, tenant_id, name, source_entity, target_entity, source_field, target_field, relationship_type, cascade_delete, display_field)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tenant_id, name) DO UPDATE SET 
                source_entity = excluded.source_entity,
                target_entity = excluded.target_entity,
                source_field = excluded.source_field,
                target_field = excluded.target_field,
                relationship_type = excluded.relationship_type,
                cascade_delete = excluded.cascade_delete,
                display_field = excluded.display_field
        `, id, req.tenantId, name, sourceEntity, targetEntity, sourceField, targetField, relationshipType, cascadeDelete ? 1 : 0, displayField);

        // Also update the source entity's schema to add a lookup field if it doesn't exist
        const schemaRow = await db.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', req.tenantId, sourceEntity);
        if (schemaRow) {
            const schema = JSON.parse(schemaRow.config);
            const fieldExists = schema.fields.some(f => f.name === sourceField);
            if (!fieldExists) {
                schema.fields.push({
                    name: sourceField,
                    label: `Related ${targetEntity}`,
                    type: 'lookup',
                    lookupTarget: targetEntity
                });
                await db.run('UPDATE entity_definitions SET config = ? WHERE tenant_id = ? AND entity_type = ?', JSON.stringify(schema), req.tenantId, sourceEntity);
            }
        }

        res.json({ success: true, id, name });
    } catch (error) {
        console.error('Create relationship error:', error);
        res.status(500).json({ error: 'Failed to create relationship' });
    }
});

// Delete relationship
app.delete('/api/relationships/:id', authenticateToken, async (req, res) => {
    try {
        await db.run('DELETE FROM relationships WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete relationship error:', error);
        res.status(500).json({ error: 'Failed to delete relationship' });
    }
});

// Get related records for a specific record
app.get('/api/data/:entityType/:recordId/related/:targetEntity', authenticateToken, (req, res) => {
    const { entityType, recordId, targetEntity } = req.params;
    try {
        // Find the relationship definition
        const relationship = db.prepare(`
            SELECT * FROM relationships 
            WHERE tenant_id = ? AND source_entity = ? AND target_entity = ?
        `).get(req.tenantId, entityType, targetEntity);

        if (!relationship) {
            // Try reverse relationship (target -> source)
            const reverseRel = db.prepare(`
                SELECT * FROM relationships 
                WHERE tenant_id = ? AND source_entity = ? AND target_entity = ?
            `).get(req.tenantId, targetEntity, entityType);

            if (reverseRel) {
                // Find records where the foreign key points to our record
                const rows = db.prepare(`
                    SELECT * FROM records 
                    WHERE tenant_id = ? AND entity_type = ? 
                    AND json_extract(data, '$.' || ?) = ?
                `).all(req.tenantId, targetEntity, reverseRel.source_field, recordId);

                const records = rows.map(row => ({ ...JSON.parse(row.data), id: row.id, status: row.status }));
                return res.json(records);
            }
            return res.json([]);
        }

        // Get the source record to find the FK value
        const sourceRecord = db.prepare('SELECT data FROM records WHERE id = ? AND tenant_id = ?').get(recordId, req.tenantId);
        if (!sourceRecord) {
            return res.json([]);
        }

        const sourceData = JSON.parse(sourceRecord.data);
        const fkValue = sourceData[relationship.source_field];

        if (!fkValue) {
            return res.json([]);
        }

        // Get the related record
        const relatedRow = db.prepare('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?')
            .get(fkValue, req.tenantId, targetEntity);

        if (relatedRow) {
            res.json([{ ...JSON.parse(relatedRow.data), id: relatedRow.id, status: relatedRow.status }]);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Get related records error:', error);
        res.status(500).json({ error: 'Failed to fetch related records' });
    }
});

// --- Settings Routes ---

// Get settings
app.get('/api/settings', authenticateToken, async (req, res) => {
    try {
        const row = await db.get('SELECT config FROM settings WHERE tenant_id = ?', req.tenantId);
        if (row) {
            res.json(JSON.parse(row.config));
        } else {
            // Return default settings
            res.json({
                theme: 'light',
                primaryColor: 'indigo',
                density: 'comfortable',
                fontFamily: 'sans',
                organizationName: 'FlowCRM Inc.',
                glassmorphism: true,
                animationIntensity: 'subtle'
            });
        }
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Save settings
app.post('/api/settings', authenticateToken, async (req, res) => {
    const config = req.body;
    try {
        const id = uuidv4();
        await db.run(`
            INSERT INTO settings (id, tenant_id, config)
            VALUES (?, ?, ?)
            ON CONFLICT(tenant_id) DO UPDATE SET config = excluded.config, updated_at = CURRENT_TIMESTAMP
        `, id, req.tenantId, JSON.stringify(config));
        res.json({ success: true });
    } catch (error) {
        console.error('Save settings error:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// --- User Management Routes ---

// Get Users
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await db.all(`
            SELECT id, email, role as roleId, first_name || ' ' || last_name as name, is_active as isActive 
            FROM users WHERE tenant_id = ?
        `, req.tenantId);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Create/Update User
app.post('/api/users', authenticateToken, async (req, res) => {
    const { id, email, password, roleId, name, isActive = true } = req.body;

    // Split name into first and last
    let firstName = '';
    let lastName = '';
    if (name) {
        const parts = name.trim().split(' ');
        firstName = parts[0];
        lastName = parts.slice(1).join(' ') || '';
    }

    try {
        if (id) {
            // Update
            let updateQuery = 'UPDATE users SET role = ?, is_active = ?, first_name = ?, last_name = ?';
            const params = [roleId, isActive ? 1 : 0, firstName, lastName];

            if (password) {
                const hashedPassword = bcrypt.hashSync(password, 10);
                updateQuery += ', password_hash = ?';
                params.push(hashedPassword);
            }

            updateQuery += ' WHERE id = ? AND tenant_id = ?';
            params.push(id, req.tenantId);

            await db.run(updateQuery, ...params);
        } else {
            // Create
            const hashedPassword = bcrypt.hashSync(password || 'Admin@123', 10);
            await db.run(`
                INSERT INTO users (id, tenant_id, email, password_hash, role, is_active, first_name, last_name, must_change_password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            `, uuidv4(), req.tenantId, email, hashedPassword, roleId, isActive ? 1 : 0, firstName, lastName);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Save user error:', error);
        res.status(500).json({ error: 'Failed to save user' });
    }
});

// --- Role Routes ---

// Get Roles
app.get('/api/roles', authenticateToken, async (req, res) => {
    try {
        const roles = await db.all('SELECT * FROM roles WHERE tenant_id = ?', req.tenantId);
        const parsedRoles = roles.map(r => ({
            ...r,
            permissions: JSON.parse(r.permissions)
        }));
        res.json(parsedRoles);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

// Create/Update Role
app.post('/api/roles', authenticateToken, async (req, res) => {
    const { id, name, description, permissions } = req.body;
    try {
        const roleId = id || uuidv4();
        await db.run(`
            INSERT INTO roles (id, tenant_id, name, description, permissions)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                name = excluded.name, 
                description = excluded.description, 
                permissions = excluded.permissions
        `, roleId, req.tenantId, name, description, JSON.stringify(permissions));
        res.json({ success: true, id: roleId });
    } catch (error) {
        console.error('Save role error:', error);
        res.status(500).json({ error: 'Failed to save role' });
    }
});

// Delete Role
app.delete('/api/roles/:id', authenticateToken, async (req, res) => {
    try {
        await db.run('DELETE FROM roles WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete role' });
    }
});

// --- Email Routes ---

app.post('/api/email/send', authenticateToken, async (req, res) => {
    const { to, subject, html, text } = req.body;

    // Basic validation
    if (!to || !subject || (!html && !text)) {
        return res.status(400).json({ error: 'Missing required fields (to, subject, content)' });
    }

    const result = await sendEmail({ to, subject, html, text });

    if (result.success) {
        // Audit Log
        await logAudit({
            tenantId: req.tenantId,
            entityType: 'email',
            recordId: result.messageId || 'unknown',
            action: 'send',
            actorId: req.user.id,
            details: { to, subject }
        });
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Failed to send email' });
    }
});


// --- Dashboard Widgets Routes ---
app.get('/api/dashboard/widgets', authenticateToken, async (req, res) => {
    try {
        const row = await db.get('SELECT config FROM dashboard_widgets WHERE tenant_id = ?', req.tenantId);
        if (row) {
            res.json(JSON.parse(row.config));
        } else {
            const defaultWidgets = [
                { id: 'w1', title: 'Total Revenue', type: 'stat', visible: true, order: 1, width: 'third' },
                { id: 'w2', title: 'Active Leads', type: 'stat', visible: true, order: 2, width: 'third' },
                { id: 'w3', title: 'Conversion Rate', type: 'stat', visible: true, order: 3, width: 'third' },
                { id: 'w4', title: 'Revenue Trend', type: 'chart', visible: true, order: 4, width: 'half' },
                { id: 'w5', title: 'Recent Leads', type: 'list', visible: true, order: 5, width: 'half' }
            ];
            res.json(defaultWidgets);
        }
    } catch (error) {
        console.error('Fetch widgets error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard widgets' });
    }
});

app.post('/api/dashboard/widgets', authenticateToken, async (req, res) => {
    try {
        const config = JSON.stringify(req.body);
        await db.run(`
            INSERT INTO dashboard_widgets (id, tenant_id, config, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(tenant_id) DO UPDATE SET config = excluded.config, updated_at = CURRENT_TIMESTAMP
        `, uuidv4(), req.tenantId, config);
        res.json({ success: true });
    } catch (error) {
        console.error('Save widgets error:', error);
        res.status(500).json({ error: 'Failed to save dashboard widgets' });
    }
});

// --- Dashboard Stats Route ---
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const leads = await db.all("SELECT data FROM records WHERE tenant_id = ? AND entity_type = 'lead'", req.tenantId);
        const customers = await db.all("SELECT data FROM records WHERE tenant_id = ? AND entity_type = 'customer'", req.tenantId);
        
        let totalRevenue = 0;
        let leadCount = leads.length;
        let customerCount = customers.length;
        let wonLeads = 0;
        
        leads.forEach(r => {
            try {
                const data = JSON.parse(r.data);
                if (data.status === 'Won') {
                    totalRevenue += Number(data.value || 0);
                    wonLeads++;
                }
            } catch (e) {}
        });
        
        const deals = await db.all("SELECT data FROM records WHERE tenant_id = ? AND entity_type = 'deal'", req.tenantId);
        deals.forEach(r => {
            try {
                const data = JSON.parse(r.data);
                if (data.status === 'Won' || !data.status) {
                    totalRevenue += Number(data.value || data.amount || 0);
                }
            } catch (e) {}
        });
        
        const conversionRate = leadCount > 0 ? Math.round((wonLeads / leadCount) * 100) : 0;
        
        res.json({
            totalRevenue,
            leadCount,
            customerCount,
            conversionRate
        });
    } catch (error) {
        console.error('Stats aggregation error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// --- Dashboard Chart Data Route ---
app.get('/api/dashboard/chart-data', authenticateToken, async (req, res) => {
    try {
        const leads = await db.all("SELECT created_at, data FROM records WHERE tenant_id = ? AND entity_type = 'lead'", req.tenantId);
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyRevenue = {};
        
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyRevenue[mKey] = { name: monthNames[d.getMonth()], uv: 0 };
        }
        
        leads.forEach(r => {
            try {
                const data = JSON.parse(r.data);
                if (data.status === 'Won' && r.created_at) {
                    const d = new Date(r.created_at);
                    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    if (monthlyRevenue[mKey]) {
                        monthlyRevenue[mKey].uv += Number(data.value || 0);
                    }
                }
            } catch (e) {}
        });

        const deals = await db.all("SELECT created_at, data FROM records WHERE tenant_id = ? AND entity_type = 'deal'", req.tenantId);
        deals.forEach(r => {
            try {
                const data = JSON.parse(r.data);
                if ((data.status === 'Won' || !data.status) && r.created_at) {
                    const d = new Date(r.created_at);
                    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    if (monthlyRevenue[mKey]) {
                        monthlyRevenue[mKey].uv += Number(data.value || data.amount || 0);
                    }
                }
            } catch (e) {}
        });
        
        const chartData = Object.values(monthlyRevenue);
        res.json(chartData);
    } catch (error) {
        console.error('Chart data aggregation error:', error);
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
});

// --- Audit Log Routes ---
app.post('/api/audit', authenticateToken, async (req, res) => {
    const { entityType, recordId, action, details } = req.body;
    try {
        await logAudit({
            tenantId: req.tenantId,
            entityType: entityType || 'customer',
            recordId: recordId,
            action: action || 'note',
            actorId: req.user.id,
            details: details || {}
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Save audit log error:', error);
        res.status(500).json({ error: 'Failed to create audit log' });
    }
});

app.get('/api/audit/recent', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT a.*, u.email as actor_email, u.first_name as actor_first_name, u.last_name as actor_last_name 
            FROM audit_logs a
            LEFT JOIN users u ON a.actor_id = u.id
            WHERE a.tenant_id = ? 
            ORDER BY a.created_at DESC LIMIT 20
        `;
        const logs = await db.all(query, req.tenantId);
        res.json(logs);
    } catch (error) {
        console.error('Fetch recent audit logs error:', error);
        res.status(500).json({ error: 'Failed to fetch recent activities' });
    }
});

app.get('/api/audit/:entityType/:recordId', authenticateToken, async (req, res) => {
    try {
        const { entityType, recordId } = req.params;
        const query = `
            SELECT a.*, u.email as actor_email, u.first_name as actor_first_name, u.last_name as actor_last_name 
            FROM audit_logs a
            LEFT JOIN users u ON a.actor_id = u.id
            WHERE a.tenant_id = ? AND a.record_id = ?
            ORDER BY a.created_at DESC
        `;
        const logs = await db.all(query, req.tenantId, recordId);
        res.json(logs);
    } catch (error) {
        console.error('Fetch audit logs error:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

// --- Workflow Routes ---
// --- CTI / Telephony (Exotel/Knowlarity-style) + Lead Conversion ---

// Caller-ID lookup (agent screen-pop)
app.get('/api/cti/lookup', authenticateToken, async (req, res) => {
    try {
        const result = await lookupByPhone(req.tenantId, req.query.phone);
        res.json(result);
    } catch (error) {
        console.error('CTI lookup error:', error);
        res.status(500).json({ error: 'Lookup failed' });
    }
});

// Inbound call webhook — telephony provider posts here on a call.
// Exotel/Knowlarity send form/query params like From, To, CallSid, Direction, CallStatus.
app.post('/api/cti/incoming', async (req, res) => {
    try {
        if (INGEST_KEY && req.query.key !== INGEST_KEY) return res.status(401).json({ error: 'Invalid key' });
        const tenantId = String(req.query.tenant || 'default');
        const body = { ...req.query, ...req.body };
        const from = body.From || body.from || body.CallFrom || body.caller || body.source;
        const to = body.To || body.to || body.CallTo || body.destination;
        const callSid = body.CallSid || body.CallId || body.uuid;
        const direction = (body.Direction || body.direction || 'inbound').toLowerCase().includes('out') ? 'outbound' : 'inbound';

        const autoCreate = req.query.autoCreate !== '0';
        const result = await handleInboundCall(tenantId, { from, to, callSid, direction, autoCreate });
        // Exotel just needs a 200; richer call-flow routing is configured in the provider.
        res.json({ ok: true, matched: !!result.match, ...result });
    } catch (error) {
        console.error('CTI incoming error:', error);
        res.status(500).json({ error: 'Failed to process call' });
    }
});

// Recent calls (agent console polls this)
app.get('/api/cti/calls', authenticateToken, async (req, res) => {
    try {
        res.json(await getRecentCalls(req.tenantId, 25));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch calls' });
    }
});

// Manually log / update a call outcome (agent)
app.post('/api/cti/log-call', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        const result = await logCall(req.tenantId, {
            direction: b.direction || 'inbound', from: b.from, to: b.to, status: b.status || 'completed',
            matchedEntity: b.entityType, matchedId: b.recordId, matchedName: b.name,
            outcome: b.outcome, notes: b.notes, actorId: req.user.id,
        });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('CTI log-call error:', error);
        res.status(500).json({ error: 'Failed to log call' });
    }
});

// Route an identified caller to the right record based on what they want (support→Case, sales→Opportunity)
app.post('/api/cti/route', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        const result = await routeInbound(req.tenantId, {
            recordId: b.recordId, entityType: b.entityType, name: b.name,
            text: b.text, manualIntent: b.manualIntent, actorId: req.user.id,
        });
        res.json(result);
    } catch (error) {
        console.error('CTI route error:', error);
        res.status(500).json({ error: error.message || 'Routing failed' });
    }
});

// Convert a lead to a customer (+ AI upsell task)
app.post('/api/leads/:id/convert', authenticateToken, async (req, res) => {
    try {
        const result = await convertLeadToCustomer(req.tenantId, req.params.id, req.user.id);
        res.json(result);
    } catch (error) {
        console.error('Lead convert error:', error);
        res.status(500).json({ error: error.message || 'Conversion failed' });
    }
});

// --- Lead Ingestion Pipeline (public capture: webhook / web form) ---

const INGEST_KEY = process.env.INGEST_KEY || '';

app.post('/api/ingest/:source', async (req, res) => {
    try {
        // Optional shared-secret gate (set INGEST_KEY in env to require ?key=)
        if (INGEST_KEY && req.query.key !== INGEST_KEY) {
            return res.status(401).json({ error: 'Invalid ingest key' });
        }
        const source = req.params.source || 'webhook';
        const tenantId = String(req.query.tenant || 'default');
        const useAI = req.query.ai === '1' || req.body?._ai === true;
        const dedupe = req.query.dedupe !== '0';

        const result = await ingestLead({ tenantId, source, payload: req.body || {}, useAI, dedupe });
        res.json(result);
    } catch (error) {
        console.error('Ingest error:', error);
        res.status(500).json({ error: 'Ingestion failed', details: error.message });
    }
});

// --- Global Search ---

app.get('/api/search', authenticateToken, async (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit) || 10, 30);
    if (q.length < 1) return res.json([]);
    try {
        const like = `%${q}%`;
        const rows = await db.all(
            `SELECT id, entity_type, primary_display, status
             FROM records
             WHERE tenant_id = ? AND (primary_display LIKE ? OR data LIKE ?)
             ORDER BY updated_at DESC
             LIMIT ?`,
            req.tenantId, like, like, limit
        );
        res.json(rows.map(r => ({
            id: r.id,
            entityType: r.entity_type,
            primaryDisplay: r.primary_display || '(untitled)',
            status: r.status,
        })));
    } catch (error) {
        console.error('Global search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// --- AI (Gemini) ---

app.get('/api/ai/status', authenticateToken, (req, res) => {
    res.json({ enabled: isAIEnabled() });
});

app.post('/api/ai/customer-insight', authenticateToken, async (req, res) => {
    try {
        const insight = await generateCustomerInsight(req.body || {});
        if (!insight) {
            // AI disabled or call failed — signal fallback to the client
            return res.json({ enabled: isAIEnabled(), insight: null });
        }
        res.json({ enabled: true, insight });
    } catch (error) {
        console.error('AI insight error:', error);
        res.json({ enabled: isAIEnabled(), insight: null });
    }
});

// --- Lead Generation Rules ---

function isAdmin(req) {
    return req.user.role === 'admin' || req.user.permissions?.admin;
}

app.get('/api/lead-rules', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all(
            'SELECT * FROM lead_rules WHERE tenant_id = ? ORDER BY created_at DESC',
            req.tenantId
        );
        const rules = rows.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            sourceEntity: r.source_entity,
            targetEntity: r.target_entity,
            conditions: r.conditions ? JSON.parse(r.conditions) : { match: 'all', rules: [] },
            fieldMapping: r.field_mapping ? JSON.parse(r.field_mapping) : {},
            defaultValues: r.default_values ? JSON.parse(r.default_values) : {},
            assignTo: r.assign_to,
            dedupe: !!r.dedupe,
            isActive: !!r.is_active,
            schedule: r.schedule || 'manual',
            intervalMinutes: r.interval_minutes,
            nextRunAt: r.next_run_at,
            lastRunAt: r.last_run_at,
            lastRunCount: r.last_run_count,
        }));
        res.json(rules);
    } catch (error) {
        console.error('Fetch lead rules error:', error);
        res.status(500).json({ error: 'Failed to fetch lead rules' });
    }
});

app.post('/api/lead-rules', authenticateToken, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    try {
        const b = req.body;
        if (!b.name || !b.sourceEntity) {
            return res.status(400).json({ error: 'name and sourceEntity are required' });
        }
        const id = b.id || uuidv4();
        const conditions = JSON.stringify(b.conditions || { match: 'all', rules: [] });
        const fieldMapping = JSON.stringify(b.fieldMapping || {});
        const defaultValues = JSON.stringify(b.defaultValues || {});

        const existing = b.id ? await db.get('SELECT id FROM lead_rules WHERE id = ? AND tenant_id = ?', id, req.tenantId) : null;

        const schedule = ['manual', 'realtime', 'interval'].includes(b.schedule) ? b.schedule : 'manual';
        const intervalMinutes = schedule === 'interval' ? (Number(b.intervalMinutes) || 60) : null;

        if (existing) {
            await db.run(
                `UPDATE lead_rules SET name = ?, description = ?, source_entity = ?, target_entity = ?,
                 conditions = ?, field_mapping = ?, default_values = ?, assign_to = ?, dedupe = ?, is_active = ?,
                 schedule = ?, interval_minutes = ?
                 WHERE id = ? AND tenant_id = ?`,
                b.name, b.description || '', b.sourceEntity, b.targetEntity || 'lead',
                conditions, fieldMapping, defaultValues, b.assignTo || null,
                b.dedupe === false ? 0 : 1, b.isActive === false ? 0 : 1,
                schedule, intervalMinutes,
                id, req.tenantId
            );
        } else {
            await db.run(
                `INSERT INTO lead_rules (id, tenant_id, name, description, source_entity, target_entity,
                 conditions, field_mapping, default_values, assign_to, dedupe, is_active, schedule, interval_minutes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                id, req.tenantId, b.name, b.description || '', b.sourceEntity, b.targetEntity || 'lead',
                conditions, fieldMapping, defaultValues, b.assignTo || null,
                b.dedupe === false ? 0 : 1, b.isActive === false ? 0 : 1,
                schedule, intervalMinutes
            );
        }
        res.json({ id, ...b });
    } catch (error) {
        console.error('Save lead rule error:', error);
        res.status(500).json({ error: 'Failed to save lead rule', details: error.message });
    }
});

app.delete('/api/lead-rules/:id', authenticateToken, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    try {
        await db.run('DELETE FROM lead_rules WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete lead rule' });
    }
});

// Preview (dry run) — returns matches without creating leads
app.post('/api/lead-rules/:id/preview', authenticateToken, async (req, res) => {
    try {
        const rule = await db.get('SELECT * FROM lead_rules WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        if (!rule) return res.status(404).json({ error: 'Lead rule not found' });
        const result = await runLeadRule(rule, req.tenantId, req.user.id, { dryRun: true });
        res.json(result);
    } catch (error) {
        console.error('Preview lead rule error:', error);
        res.status(500).json({ error: 'Failed to preview lead rule', details: error.message });
    }
});

// Run — creates leads for matches
app.post('/api/lead-rules/:id/run', authenticateToken, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    try {
        const rule = await db.get('SELECT * FROM lead_rules WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        if (!rule) return res.status(404).json({ error: 'Lead rule not found' });
        const result = await runLeadRule(rule, req.tenantId, req.user.id, { dryRun: false });
        res.json(result);
    } catch (error) {
        console.error('Run lead rule error:', error);
        res.status(500).json({ error: 'Failed to run lead rule', details: error.message });
    }
});

// Run all active rules
app.post('/api/lead-rules/run-all', authenticateToken, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    try {
        const results = await runAllActiveRules(req.tenantId, req.user.id);
        res.json({ results });
    } catch (error) {
        console.error('Run all lead rules error:', error);
        res.status(500).json({ error: 'Failed to run lead rules', details: error.message });
    }
});

app.get('/api/workflows', authenticateToken, async (req, res) => {
    try {
        const row = await db.get('SELECT flow_data FROM workflows WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', req.tenantId);
        if (row && row.flow_data) {
            res.json(JSON.parse(row.flow_data));
        } else {
            res.json({ nodes: [], edges: [] });
        }
    } catch (error) {
        console.error('Fetch workflows error:', error);
        res.status(500).json({ error: 'Failed to fetch workflows' });
    }
});

app.post('/api/workflows', authenticateToken, async (req, res) => {
    try {
        const { nodes, edges } = req.body;
        
        const triggerNode = nodes.find(n => n.type === 'trigger' || n.data?.type === 'trigger');
        let entityType = 'lead';
        let triggerType = 'create';
        let name = 'Automated Journey';
        let conditions = {};

        if (triggerNode) {
            const cfg = triggerNode.data?.config || {};
            const label = triggerNode.data?.label || '';
            // Prefer explicit config; fall back to label heuristic
            if (cfg.entityType) entityType = cfg.entityType;
            else if (label.toLowerCase().includes('customer')) entityType = 'customer';
            else if (label.toLowerCase().includes('case')) entityType = 'case';

            if (cfg.triggerType) triggerType = cfg.triggerType;
            else if (label.toLowerCase().includes('update')) triggerType = 'update';
            else if (label.toLowerCase().includes('delete')) triggerType = 'delete';

            if (cfg.conditions) conditions = cfg.conditions;
            name = cfg.name || label || name;
        }

        const actions = [];
        const actionNodes = nodes.filter(n => n.type === 'action' || n.data?.type === 'action');
        actionNodes.forEach(node => {
            const cfg = node.data?.config;
            // Structured action config wins
            if (cfg && cfg.type) {
                actions.push(cfg);
                return;
            }
            // Fallback: infer from the node label
            const label = (node.data?.label || '').toLowerCase();
            if (label.includes('email')) {
                actions.push({ type: 'email', to: '{email}', subject: 'Automated Notification', body: `Hi, this is an automated email regarding: ${node.data?.label || ''}` });
            } else if (label.includes('task')) {
                actions.push({ type: 'create_task', subject: 'Follow up' });
            } else if (label.includes('lead')) {
                actions.push({ type: 'create_lead', fields: {} });
            } else {
                actions.push({ type: 'update_record', fields: {} });
            }
        });

        const flowData = JSON.stringify({ nodes, edges });

        await db.run(`
            INSERT INTO workflows (id, tenant_id, name, entity_type, trigger_type, conditions, actions, is_active, flow_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                entity_type = excluded.entity_type,
                trigger_type = excluded.trigger_type,
                conditions = excluded.conditions,
                actions = excluded.actions,
                flow_data = excluded.flow_data
        `, 'default_workflow', req.tenantId, name, entityType, triggerType, JSON.stringify(conditions), JSON.stringify(actions), flowData);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Save workflow error:', error);
        res.status(500).json({ error: 'Failed to save workflow' });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startLeadRuleScheduler();
});
