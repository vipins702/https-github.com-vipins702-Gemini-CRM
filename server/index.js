import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PORT, JWT_SECRET } from './config.js';
import { initDB } from './database.js';
import db from './database.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticateToken, requirePermission, requireSuperadmin } from './middleware/auth.js';
import { listTenants, createTenant, updateTenant, ensureSuperadmin } from './services/platform.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { logAudit } from './services/audit.js';
import { sendEmail, getConversations as getEmailConversations, getThread as getEmailThread, isConfigured as emailConfigured } from './services/email.js';
import { evaluateWorkflows } from './services/workflow.js';
import { runLeadRule, runAllActiveRules, evaluateRealtimeLeadRules, startLeadRuleScheduler } from './services/leadgen.js';
import { generateCustomerInsight, isAIEnabled, generateLeadFollowupTasks } from './services/ai.js';
import { ingestLead, mapPayload } from './services/ingest.js';
import { lookupByPhone, logCall, getRecentCalls, convertLeadToCustomer, handleInboundCall, routeInbound } from './services/cti.js';
import { listReports, runReport, listPacks, runPack } from './services/reporting.js';
import { reportCache } from './services/reportCache.js';
import { verifyWebhook, parseWebhookPayload, handleIncomingMessage, sendMessage, getConversations, getThread, isConfigured as waConfigured, authenticateMessages as waAuthenticateMessages } from './services/whatsapp.js';
import { listForClient as listIntegrations, getForClient as getIntegration, saveIntegration, getIngestKey, rotateIngestKey, resolveTenantByIngestKey, encryptStoredSecrets } from './services/integrations.js';
import { listQuotes, getQuote, saveQuote, setQuoteStatus, emailQuote, convertQuote } from './services/quotes.js';
import { getProcess, saveProcess, configurableEntities, findStage, missingForStage, runStageEntryActions } from './services/processes.js';
import { getTree as getCategoryTree, saveTree as saveCategoryTree, ensureDefaultTree } from './services/categories.js';
import { listCampaigns, getCampaign, saveCampaign as saveCampaignSvc, previewAudience, sendCampaign, trackOpen } from './services/campaigns.js';
import { calculateLeadScore } from './services/scoring.js';
import { assignLead } from './services/assignment.js';
import { listSequences, getSequence, saveSequence, deleteSequence, enrollRecord, getEnrollments, unenrollRecord, startSequenceScheduler } from './services/sequences.js';
import { createReadStream } from 'fs';

const app = express();

app.use(cors());
app.use(express.json({
    // Webhook signatures are computed over the exact bytes received, so keep them.
    verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf; },
}));

// Tenant for public inbound endpoints (lead ingest, telephony). A logged-in caller
// uses their own tenant; an external system must present the tenant's ingest key
// (?key= or X-Ingest-Key). The tenant is never taken from the request itself.
const resolveInboundTenant = async (req, res, next) => {
    if (req.headers['authorization']) return authenticateToken(req, res, next);
    try {
        const tenantId = await resolveTenantByIngestKey(req.get('x-ingest-key') || req.query.key);
        if (!tenantId) return res.status(401).json({ error: 'Valid ingest key required' });
        req.tenantId = tenantId;
        next();
    } catch (e) {
        res.status(500).json({ error: 'Failed to verify ingest key' });
    }
};

// --- Uploads (attachments) ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Initialize Database
// Initialize Database
await initDB();
await encryptStoredSecrets();

// Idempotent menu patch: ensure existing tenant menus expose the Reports view.
async function ensureReportsMenuItem() {
    try {
        const menus = await db.all('SELECT id, tenant_id, config FROM menus');
        for (const m of menus) {
            let cfg;
            try { cfg = JSON.parse(m.config); } catch { continue; }
            if (!Array.isArray(cfg)) continue;
            const has = JSON.stringify(cfg).includes('"view":"reports"') || JSON.stringify(cfg).includes('"view": "reports"');
            if (has) continue;
            const item = { id: 'reports', label: 'Reports', icon: 'BarChart3', type: 'item', view: 'reports', allowedRoles: ['*'] };
            const idx = cfg.findIndex((i) => i?.view === 'dashboard');
            if (idx >= 0) cfg.splice(idx + 1, 0, item); else cfg.unshift(item);
            await db.run('UPDATE menus SET config = ? WHERE id = ?', JSON.stringify(cfg), m.id);
            console.log(`[reports] Added Reports menu item for tenant ${m.tenant_id}`);
        }
    } catch (e) {
        console.warn('[reports] Could not patch menu:', e.message);
    }
}
await ensureReportsMenuItem();

// Idempotent menu patch: ensure existing tenant menus expose the WhatsApp inbox.
async function ensureWhatsAppMenuItem() {
    try {
        const menus = await db.all('SELECT id, tenant_id, config FROM menus');
        for (const m of menus) {
            let cfg;
            try { cfg = JSON.parse(m.config); } catch { continue; }
            if (!Array.isArray(cfg)) continue;
            if (JSON.stringify(cfg).replace(/\s/g, '').includes('"view":"whatsapp"')) continue;
            const item = { id: 'whatsapp', label: 'WhatsApp', icon: 'MessageCircle', type: 'item', view: 'whatsapp', allowedRoles: ['*'] };
            const idx = cfg.findIndex((i) => i?.view === 'reports');
            if (idx >= 0) cfg.splice(idx + 1, 0, item); else cfg.push(item);
            await db.run('UPDATE menus SET config = ? WHERE id = ?', JSON.stringify(cfg), m.id);
            console.log(`[whatsapp] Added WhatsApp menu item for tenant ${m.tenant_id}`);
        }
    } catch (e) {
        console.warn('[whatsapp] Could not patch menu:', e.message);
    }
}
await ensureWhatsAppMenuItem();
await ensureSuperadmin().catch(e => console.warn('[platform] ensureSuperadmin failed:', e.message));

// Idempotent menu patch: ensure existing tenant menus expose the Email inbox.
async function ensureEmailMenuItem() {
    try {
        const menus = await db.all('SELECT id, tenant_id, config FROM menus');
        for (const m of menus) {
            let cfg;
            try { cfg = JSON.parse(m.config); } catch { continue; }
            if (!Array.isArray(cfg)) continue;
            if (JSON.stringify(cfg).replace(/\s/g, '').includes('"view":"email-inbox"')) continue;
            const item = { id: 'email-inbox', label: 'Email', icon: 'Mail', type: 'item', view: 'email-inbox', allowedRoles: ['*'] };
            const idx = cfg.findIndex((i) => i?.view === 'whatsapp');
            if (idx >= 0) cfg.splice(idx + 1, 0, item); else cfg.push(item);
            await db.run('UPDATE menus SET config = ? WHERE id = ?', JSON.stringify(cfg), m.id);
            console.log(`[email] Added Email menu item for tenant ${m.tenant_id}`);
        }
    } catch (e) {
        console.warn('[email] Could not patch menu:', e.message);
    }
}
await ensureEmailMenuItem();

// Idempotent menu patch: ensure existing tenant menus expose the Calendar & Tasks view.
async function ensureCalendarMenuItem() {
    try {
        const menus = await db.all('SELECT id, tenant_id, config FROM menus');
        for (const m of menus) {
            let cfg;
            try { cfg = JSON.parse(m.config); } catch { continue; }
            if (!Array.isArray(cfg)) continue;
            if (JSON.stringify(cfg).replace(/\s/g, '').includes('"view":"calendar"')) continue;
            const item = { id: 'calendar', label: 'Calendar & Tasks', icon: 'Calendar', type: 'item', view: 'calendar', allowedRoles: ['*'] };
            const idx = cfg.findIndex((i) => i?.view === 'dashboard');
            if (idx >= 0) cfg.splice(idx + 1, 0, item); else cfg.unshift(item);
            await db.run('UPDATE menus SET config = ? WHERE id = ?', JSON.stringify(cfg), m.id);
            console.log(`[calendar] Added Calendar menu item for tenant ${m.tenant_id}`);
        }
    } catch (e) {
        console.warn('[calendar] Could not patch menu:', e.message);
    }
}
await ensureCalendarMenuItem();

// Idempotent menu patch: ensure existing tenant menus expose the Quotes view.
async function ensureQuotesMenuItem() {
    try {
        const menus = await db.all('SELECT id, tenant_id, config FROM menus');
        for (const m of menus) {
            let cfg;
            try { cfg = JSON.parse(m.config); } catch { continue; }
            if (!Array.isArray(cfg)) continue;
            if (JSON.stringify(cfg).replace(/\s/g, '').includes('"view":"quotes"')) continue;
            const item = { id: 'quotes', label: 'Quotes', icon: 'FileText', type: 'item', view: 'quotes', allowedRoles: ['*'] };
            const idx = cfg.findIndex((i) => i?.view === 'reports');
            if (idx >= 0) cfg.splice(idx + 1, 0, item); else cfg.push(item);
            await db.run('UPDATE menus SET config = ? WHERE id = ?', JSON.stringify(cfg), m.id);
            console.log(`[quotes] Added Quotes menu item for tenant ${m.tenant_id}`);
        }
    } catch (e) {
        console.warn('[quotes] Could not patch menu:', e.message);
    }
}
await ensureQuotesMenuItem();

// Seed default category tree + ensure cascade category + product image fields exist.
async function ensureCategoryFieldsAndTree() {
    try {
        const tenants = await db.all('SELECT id FROM tenants');
        for (const t of tenants) await ensureDefaultTree(t.id, 'product');

        const defs = await db.all('SELECT id, tenant_id, entity_type, config FROM entity_definitions WHERE entity_type IN (?, ?, ?)', 'product', 'lead', 'case');
        for (const d of defs) {
            let cfg; try { cfg = JSON.parse(d.config); } catch { continue; }
            if (!cfg.fields) continue;
            let changed = false;

            // Upgrade/insert a cascading 'category' field (references the 'product' set)
            const cat = cfg.fields.find(f => f.name === 'category');
            if (!cat) {
                cfg.fields.push({ name: 'category', label: 'Category', type: 'cascade', categorySet: 'product' });
                changed = true;
            } else if (cat.type !== 'cascade') {
                cat.type = 'cascade'; cat.categorySet = 'product'; delete cat.options;
                changed = true;
            }

            // Product gets an image field (uses the existing base64 image renderer)
            if (d.entity_type === 'product' && !cfg.fields.find(f => f.name === 'image')) {
                cfg.fields.push({ name: 'image', label: 'Product Image', type: 'image' });
                changed = true;
            }

            if (changed) {
                await db.run('UPDATE entity_definitions SET config = ? WHERE id = ?', JSON.stringify(cfg), d.id);
                console.log(`[categories] Patched ${d.entity_type} schema for tenant ${d.tenant_id}`);
            }
        }
    } catch (e) {
        console.warn('[categories] Could not patch schemas/tree:', e.message);
    }
}
await ensureCategoryFieldsAndTree();

// Idempotent menu patch: expose Product Categories (admin).
async function ensureCategoriesMenuItem() {
    try {
        const menus = await db.all('SELECT id, tenant_id, config FROM menus');
        for (const m of menus) {
            let cfg; try { cfg = JSON.parse(m.config); } catch { continue; }
            if (!Array.isArray(cfg)) continue;
            if (JSON.stringify(cfg).replace(/\s/g, '').includes('"view":"categories"')) continue;
            cfg.push({ id: 'categories', label: 'Product Categories', icon: 'Layers', type: 'item', view: 'categories', allowedRoles: ['admin'] });
            await db.run('UPDATE menus SET config = ? WHERE id = ?', JSON.stringify(cfg), m.id);
            console.log(`[categories] Added Categories menu item for tenant ${m.tenant_id}`);
        }
    } catch (e) { console.warn('[categories] menu patch failed:', e.message); }
}
await ensureCategoriesMenuItem();

// Idempotent menu patch: ensure existing tenant menus expose the Pipeline (kanban) view.
async function ensurePipelineMenuItem() {
    try {
        const menus = await db.all('SELECT id, tenant_id, config FROM menus');
        for (const m of menus) {
            let cfg;
            try { cfg = JSON.parse(m.config); } catch { continue; }
            if (!Array.isArray(cfg)) continue;
            if (JSON.stringify(cfg).replace(/\s/g, '').includes('"view":"pipeline"')) continue;
            const item = { id: 'pipeline', label: 'Pipeline', icon: 'GitBranch', type: 'item', view: 'pipeline', allowedRoles: ['*'] };
            const idx = cfg.findIndex((i) => i?.view === 'dashboard');
            if (idx >= 0) cfg.splice(idx + 1, 0, item); else cfg.unshift(item);
            await db.run('UPDATE menus SET config = ? WHERE id = ?', JSON.stringify(cfg), m.id);
            console.log(`[pipeline] Added Pipeline menu item for tenant ${m.tenant_id}`);
        }
    } catch (e) {
        console.warn('[pipeline] Could not patch menu:', e.message);
    }
}
await ensurePipelineMenuItem();

// Idempotent menu patch: ensure existing tenant menus expose the Process Builder.
async function ensureProcessesMenuItem() {
    try {
        const menus = await db.all('SELECT id, tenant_id, config FROM menus');
        for (const m of menus) {
            let cfg;
            try { cfg = JSON.parse(m.config); } catch { continue; }
            if (!Array.isArray(cfg)) continue;
            if (JSON.stringify(cfg).replace(/\s/g, '').includes('"view":"processes"')) continue;
            const item = { id: 'processes', label: 'Process Builder', icon: 'Workflow', type: 'item', view: 'processes', allowedRoles: ['admin'] };
            const idx = cfg.findIndex((i) => i?.view === 'pipeline');
            if (idx >= 0) cfg.splice(idx + 1, 0, item); else cfg.push(item);
            await db.run('UPDATE menus SET config = ? WHERE id = ?', JSON.stringify(cfg), m.id);
            console.log(`[processes] Added Process Builder menu item for tenant ${m.tenant_id}`);
        }
    } catch (e) {
        console.warn('[processes] Could not patch menu:', e.message);
    }
}
await ensureProcessesMenuItem();

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

        const isSuperadmin = !!user.is_superadmin;

        // Block login for users of a suspended tenant (superadmin is exempt).
        if (!isSuperadmin) {
            const tenant = await db.get('SELECT status FROM tenants WHERE id = ?', user.tenant_id);
            if (tenant && tenant.status === 'suspended') {
                console.log('Login failed: tenant suspended', user.tenant_id);
                return res.status(403).json({ error: 'This workspace is suspended. Contact the platform administrator.' });
            }
        }

        console.log('Login successful', email);

        // Fetch Permissions
        let permissions = {};
        if (isSuperadmin || user.role === 'admin') {
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

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, tenantId: user.tenant_id, isSuperadmin }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.first_name + ' ' + user.last_name,
                isSuperadmin,
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

// Parameterized CRM Data View endpoint (public — tenant resolved from slug)
app.get('/api/web-content/:slug/data', async (req, res) => {
    const { slug } = req.params;
    const queryParams = req.query; // e.g. ?city=Mumbai&status=active
    try {
        const row = await db.get(
            "SELECT * FROM web_content WHERE slug = ? AND type = 'crm'",
            slug
        );
        if (!row) return res.status(404).json({ error: 'CRM view not found' });

        let config = {};
        try { config = JSON.parse(row.content || '{}'); } catch {}
        const meta = (() => { try { return JSON.parse(row.metadata || '{}'); } catch { return {}; } })();

        const entity = config.entity || meta.crmEntity || 'lead';
        const filters = config.filters || meta.crmFilters || [];
        const tenantId = row.tenant_id || 'default';

        // Fetch all records for entity
        const allRows = await db.all(
            'SELECT data FROM records WHERE tenant_id = ? AND entity_type = ?',
            tenantId, entity
        );
        let records = allRows.map(r => {
            try { return JSON.parse(r.data || '{}'); } catch { return {}; }
        });

        // Apply filters with param substitution
        records = records.filter(r => filters.every(f => {
            if (!f.field) return true;
            const resolved = f.value.replace(/\{(\w+)\}/g, (_, k) => queryParams[k] ?? '');
            const rv = String(r[f.field] ?? '');
            if (f.op === 'eq')       return rv === resolved;
            if (f.op === 'neq')      return rv !== resolved;
            if (f.op === 'contains') return rv.toLowerCase().includes(resolved.toLowerCase());
            if (f.op === 'starts')   return rv.toLowerCase().startsWith(resolved.toLowerCase());
            if (f.op === 'gt')       return Number(rv) > Number(resolved);
            if (f.op === 'lt')       return Number(rv) < Number(resolved);
            return true;
        }));

        res.json({ entity, count: records.length, data: records });
    } catch (err) {
        console.error('CRM view data error:', err);
        res.status(500).json({ error: err.message });
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

    // Security enhancement: ensure query always scopes to tenant
    if (!cleanQuery.includes('tenant_id')) {
        return res.status(400).json({ error: 'Query must include tenant_id filter for security.' });
    }

    try {
        // Use parameterized binding instead of string replacement for :tenantId
        const paramMatches = query.match(/:tenantId/gi) || [];
        const safeQuery = query.replace(/:tenantId/gi, '?');
        const params = paramMatches.map(() => req.tenantId);

        const rows = await db.all(safeQuery, ...params);
        res.json(rows);
    } catch (error) {
        console.error('Execute SQL error:', error);
        res.status(500).json({ error: error.message });
    }
});
// --- Saved Reports & Analytics Engine ---

app.get('/api/saved-reports', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM saved_reports WHERE tenant_id = ? ORDER BY created_at DESC', req.tenantId);
        res.json(rows.map(r => ({
            ...r,
            columns: JSON.parse(r.columns || '[]'),
            filters: JSON.parse(r.filters || '[]'),
            groupBy: JSON.parse(r.group_by || '[]'),
            sortBy: JSON.parse(r.sort_by || '[]')
        })));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch saved reports' });
    }
});

app.post('/api/saved-reports', authenticateToken, async (req, res) => {
    const { id, name, description, entityType, columns, filters, groupBy, sortBy, vizType } = req.body;
    try {
        const reportId = id || uuidv4();
        await db.run(`
            INSERT INTO saved_reports (id, tenant_id, name, description, entity_type, columns, filters, group_by, sort_by, viz_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name, description = excluded.description, entity_type = excluded.entity_type,
                columns = excluded.columns, filters = excluded.filters, group_by = excluded.group_by,
                sort_by = excluded.sort_by, viz_type = excluded.viz_type
        `, reportId, req.tenantId, name, description || '', entityType, 
           JSON.stringify(columns || []), JSON.stringify(filters || []), 
           JSON.stringify(groupBy || []), JSON.stringify(sortBy || []), vizType || 'table');
        res.json({ success: true, id: reportId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to save report' });
    }
});

app.delete('/api/saved-reports/:id', authenticateToken, async (req, res) => {
    try {
        await db.run('DELETE FROM saved_reports WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

app.post('/api/saved-reports/run', authenticateToken, async (req, res) => {
    const { entityType, columns = [], filters = [], groupBy = [], sortBy = [] } = req.body;
    
    if (!entityType) return res.status(400).json({ error: 'Entity type is required' });

    // Field names and aggregates come from the client, so quote/whitelist them —
    // only values travel as bound parameters.
    const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const AGGREGATES = { count: 'COUNT', sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX' };

    try {
        let selectParts = [];
        let groupByParts = [];
        let params = [req.tenantId, entityType];

        let sql = `SELECT `;
        const fromClause = ` FROM records WHERE tenant_id = ? AND entity_type = ?`;

        // 1. SELECT and GROUP BY Builder
        if (groupBy.length > 0) {
            // Group By mode
            for (const g of groupBy) {
                const path = db.json('data', g);
                selectParts.push(`${path} AS ${ident(g)}`);
                // Group by the expression, not the alias: an alias like "status" would
                // otherwise resolve to the real records.status column.
                groupByParts.push(path);
            }
            // Aggregations
            let hasAgg = false;
            for (const c of columns) {
                const agg = AGGREGATES[String(c.aggregate || '').toLowerCase()];
                if (agg) {
                    const path = agg === 'COUNT' ? db.json('data', c.field) : db.jsonNum('data', c.field);
                    selectParts.push(`${agg}(${path}) AS ${ident(c.field)}`);
                    hasAgg = true;
                }
            }
            if (!hasAgg) selectParts.push(`COUNT(id) as "count"`);

            sql += selectParts.join(', ') + fromClause;
            sql += ` GROUP BY ` + groupByParts.join(', ');
        } else {
            // Raw mode
            selectParts.push('id');
            for (const c of columns) {
                const path = db.json('data', c.field);
                selectParts.push(`${path} AS ${ident(c.field)}`);
            }
            if (selectParts.length === 1) selectParts.push('data'); // Fallback to raw JSON if no cols
            sql += selectParts.join(', ') + fromClause;
        }

        // 2. Filter Builder
        for (const f of filters) {
            if (!f.field || !f.value) continue;
            const path = db.json('data', f.field);
            const num = Number(f.value);
            switch (f.op) {
                case 'eq': sql += ` AND ${path} = ?`; params.push(f.value); break;
                case 'neq': sql += ` AND ${path} != ?`; params.push(f.value); break;
                case 'contains': sql += ` AND ${path} ${db.like} ?`; params.push('%' + f.value + '%'); break;
                case 'gt': sql += ` AND ${db.jsonNum('data', f.field)} > ?`; params.push(Number.isFinite(num) ? num : null); break;
                case 'lt': sql += ` AND ${db.jsonNum('data', f.field)} < ?`; params.push(Number.isFinite(num) ? num : null); break;
            }
        }

        // 3. Sort Builder
        if (sortBy.length > 0) {
            const sorts = sortBy.map(s => `${ident(s.field)} ${String(s.dir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`);
            sql += ` ORDER BY ` + sorts.join(', ');
        } else {
            if (groupBy.length === 0) sql += ` ORDER BY created_at DESC`;
        }

        sql += ` LIMIT 1000`; // Safety limit

        const rows = await db.all(sql, ...params);
        res.json({ rows, total: rows.length });
    } catch (e) {
        console.error('Report Run Error:', e);
        res.status(500).json({ error: 'Failed to run report: ' + e.message });
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
            // Auto-score leads before insert
            let finalData = { ...jsonData };
            if (entityType === 'lead') {
                try {
                    const computedScore = await calculateLeadScore(finalData, req.tenantId);
                    if (computedScore > 0) finalData.score = computedScore;
                } catch (_) { /* non-fatal */ }
            }

            await db.run(`
            INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data)
            VALUES (?, ?, ?, ?, ?, ?)
        `, id, req.tenantId, entityType, primaryDisplay, status, JSON.stringify(finalData));

            // Log Audit
            await logAudit({
                tenantId: req.tenantId,
                entityType,
                recordId: id,
                action: 'create',
                actorId,
                details: finalData
            });

            // Auto-assign leads
            if (entityType === 'lead') {
                try { await assignLead(req.tenantId, id, finalData); } catch (_) { /* non-fatal */ }
            }

            // Trigger Workflows (include the server-generated id so actions can target this record)
            await evaluateWorkflows({
                tenantId: req.tenantId,
                entityType,
                triggerType: 'create',
                record: { ...finalData, id },
                actorId
            });

            // Trigger realtime lead-generation rules for this entity
            await evaluateRealtimeLeadRules({
                tenantId: req.tenantId,
                entityType,
                record: { ...finalData, id },
                actorId
            });
        }

        // Invalidate report cache so dashboard tiles reflect new data immediately
        reportCache.invalidateTenant(req.tenantId);

        // Auto-create task_due notification when a task with a dueDate is saved
        if (entityType === 'task' && recordData.dueDate) {
            try {
                const targetUserId = recordData.assigneeId || actorId;
                const notifId = uuidv4();
                const subj = recordData.subject || 'Task';
                const timeStr = recordData.dueTime || '';
                const timeDisplay = timeStr ? ` at ${timeStr}` : '';
                const isoStr = recordData.dueDate + (timeStr ? `T${timeStr}:00` : 'T00:00:00');
                let scheduled = null;
                try { scheduled = new Date(isoStr).toISOString(); } catch {}
                await db.run(
                    `INSERT INTO notifications (id, tenant_id, user_id, title, body, kind, record_id, entity_type, scheduled_at) VALUES (?,?,?,?,?,?,?,?,?)`,
                    notifId, req.tenantId, targetUserId,
                    `Task due: ${subj}`,
                    `Due on ${recordData.dueDate}${timeDisplay}`,
                    'task_due', id, 'task', scheduled
                );
            } catch (_) { /* non-fatal */ }
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

        reportCache.invalidateTenant(req.tenantId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

// Lightweight status transition (kanban drag, etc.) — updates ONLY status,
// bypassing full-form validation so under-populated records can still move stage.
app.post('/api/data/:entityType/:id/status', authenticateToken, async (req, res) => {
    const { entityType, id } = req.params;
    const { status, note } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is required' });
    try {
        const row = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', id, req.tenantId, entityType);
        if (!row) return res.status(404).json({ error: 'Record not found' });
        let data = {};
        try { data = JSON.parse(row.data); } catch { data = {}; }
        const prevStatus = data.status || row.status;

        // Configurable process: enforce the target stage's entry requirements.
        const targetStage = await findStage(req.tenantId, entityType, status);
        if (targetStage) {
            const missing = missingForStage(targetStage, data);
            if (missing.length) {
                return res.status(400).json({ error: `Can't move to "${status}" — required first: ${missing.join(', ')}`, missingFields: missing });
            }
            if (targetStage.requireNote && !String(note || '').trim()) {
                return res.status(400).json({ error: `A note is required to move into "${status}".`, requireNote: true });
            }
        }

        data.status = status;
        await db.run(
            'UPDATE records SET status = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
            status, JSON.stringify(data), id, req.tenantId
        );
        await logAudit({ tenantId: req.tenantId, entityType, recordId: id, action: 'status', actorId: req.user.id, details: { from: prevStatus, to: status, note: String(note || '').trim() || undefined, _via: 'pipeline' } });

        // Fire the stage's entry actions (create task / email / webhook) — best-effort.
        if (targetStage && prevStatus !== status) {
            await runStageEntryActions(req.tenantId, entityType, id, { ...data, id }, targetStage, req.user.id);
        }

        reportCache.invalidateTenant(req.tenantId);
        res.json({ id, status });
    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// ---- Configurable processes / stages ----
app.get('/api/processes', authenticateToken, (req, res) => {
    res.json({ entities: configurableEntities() });
});
app.get('/api/processes/:entityType', authenticateToken, async (req, res) => {
    try { res.json(await getProcess(req.tenantId, req.params.entityType)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/processes/:entityType', authenticateToken, async (req, res) => {
    try {
        const result = await saveProcess(req.tenantId, req.params.entityType, req.body || {});
        reportCache.invalidateTenant(req.tenantId);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Related activity for a record (Customer 360 / lead profile) — joined server-side
// so the linked tasks/quotes/emails/whatsapp/calls are reliably resolved.
app.get('/api/records/:entityType/:id/related-activity', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const t = req.tenantId;
    const J = (f) => db.json('data', f);
    try {
        const [taskRows, quoteRows, emails, whatsapp, calls, histRows] = await Promise.all([
            db.all(`SELECT id, primary_display, status, data FROM records WHERE tenant_id = ? AND entity_type = 'task' AND (${J('relatedId')} = ? OR ${J('customerId')} = ?) ORDER BY created_at DESC LIMIT 50`, t, id, id),
            db.all(`SELECT id, status, data FROM records WHERE tenant_id = ? AND entity_type = 'quote' AND ${J('customerId')} = ? ORDER BY created_at DESC LIMIT 50`, t, id),
            db.all(`SELECT id, direction, subject, status, created_at FROM email_messages WHERE tenant_id = ? AND matched_id = ? ORDER BY created_at DESC LIMIT 50`, t, id),
            db.all(`SELECT id, direction, body, status, created_at FROM wa_messages WHERE tenant_id = ? AND matched_id = ? ORDER BY created_at DESC LIMIT 50`, t, id),
            db.all(`SELECT id, direction, from_number, to_number, outcome, status, created_at FROM call_logs WHERE tenant_id = ? AND matched_id = ? ORDER BY created_at DESC LIMIT 50`, t, id),
            db.all(`SELECT a.id, a.details, a.created_at, COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email, 'system') AS actor
                    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
                    WHERE a.tenant_id = ? AND a.record_id = ? AND a.action = 'status' ORDER BY a.created_at DESC LIMIT 50`, t, id),
        ]);

        const parse = (r) => { try { return JSON.parse(r.data); } catch { return {}; } };
        const tasks = taskRows.map(r => { const d = parse(r); return { id: r.id, subject: d.subject || r.primary_display, status: d.status || r.status, priority: d.priority || 'Medium', dueDate: d.dueDate || '', assignee: d.assignee || '' }; });
        const quotes = quoteRows.map(r => { const d = parse(r); return { id: r.id, quoteNumber: d.quoteNumber || '', total: Number(d.total) || 0, currency: d.currency || 'USD', status: d.status || r.status }; });
        const stageHistory = histRows.map(r => { let d = {}; try { d = JSON.parse(r.details); } catch { d = {}; } return { id: r.id, from: d.from || '', to: d.to || '', note: d.note || '', actor: r.actor, created_at: r.created_at }; });

        res.json({ tasks, quotes, emails, whatsapp, calls, stageHistory });
    } catch (e) {
        console.error('Related activity error:', e);
        res.status(500).json({ error: 'Failed to fetch related activity' });
    }
});

// --- Campaigns (bulk outreach) ---
app.get('/api/campaigns', authenticateToken, async (req, res) => {
    try { res.json(await listCampaigns(req.tenantId)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/campaigns/:id', authenticateToken, async (req, res) => {
    try { const c = await getCampaign(req.tenantId, req.params.id); if (!c) return res.status(404).json({ error: 'Not found' }); res.json(c); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/campaigns', authenticateToken, async (req, res) => {
    try { res.json(await saveCampaignSvc(req.tenantId, req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/campaigns/preview', authenticateToken, async (req, res) => {
    try { res.json(await previewAudience(req.tenantId, req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/campaigns/:id/send', authenticateToken, async (req, res) => {
    try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        res.json(await sendCampaign(req.tenantId, req.params.id, baseUrl, req.user.id));
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Public 1x1 tracking pixel for email opens
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
app.get('/api/track/open/:sendId', async (req, res) => {
    try { await trackOpen(req.params.sendId); } catch { /* ignore */ }
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store');
    res.end(PIXEL);
});

// --- Category trees (configurable cascading picklists) ---
app.get('/api/categories/:setKey', authenticateToken, async (req, res) => {
    try { res.json(await getCategoryTree(req.tenantId, req.params.setKey)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/categories/:setKey', authenticateToken, async (req, res) => {
    try { res.json(await saveCategoryTree(req.tenantId, req.params.setKey, req.body?.tree || [])); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

// --- Attachments (files/images on any record) ---
const attachmentRow = (r) => ({
    id: r.id, entityType: r.entity_type, recordId: r.record_id,
    filename: r.filename, mime: r.mime, size: r.size, kind: r.kind,
    url: `/uploads/${r.stored_name}`, uploadedBy: r.uploaded_by, created_at: r.created_at,
});

app.get('/api/attachments/:entityType/:id', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all(
            'SELECT * FROM attachments WHERE tenant_id = ? AND entity_type = ? AND record_id = ? ORDER BY created_at DESC',
            req.tenantId, req.params.entityType, req.params.id
        );
        res.json(rows.map(attachmentRow));
    } catch (e) { res.status(500).json({ error: 'Failed to list attachments' }); }
});

app.post('/api/attachments/:entityType/:id', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const { entityType, id } = req.params;
        const kind = (req.file.mimetype || '').startsWith('image/') ? 'image' : 'file';
        const attId = uuidv4();
        await db.run(
            `INSERT INTO attachments (id, tenant_id, entity_type, record_id, filename, stored_name, mime, size, kind, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            attId, req.tenantId, entityType, id, req.file.originalname, req.file.filename,
            req.file.mimetype, req.file.size, kind, req.user.id
        );
        await logAudit({ tenantId: req.tenantId, entityType, recordId: id, action: 'attach', actorId: req.user.id, details: { filename: req.file.originalname, kind } });
        const row = await db.get('SELECT * FROM attachments WHERE id = ?', attId);
        res.json(attachmentRow(row));
    } catch (e) {
        console.error('Attachment upload error:', e);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.delete('/api/attachments/:id', authenticateToken, async (req, res) => {
    try {
        const row = await db.get('SELECT * FROM attachments WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        if (!row) return res.status(404).json({ error: 'Not found' });
        await db.run('DELETE FROM attachments WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        try { fs.unlinkSync(path.join(UPLOAD_DIR, row.stored_name)); } catch { /* ignore missing file */ }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Delete failed' }); }
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
app.post('/api/lookups/:lookupId/import', authenticateToken, async (req, res) => {
    const { lookupId } = req.params;
    const { values } = req.body; // Expecting array of { valueId, value, sortOrder }

    if (!Array.isArray(values)) {
        return res.status(400).json({ error: 'Values must be an array' });
    }

    try {
        await db.transaction(async (tx) => {
            for (const item of values) {
                await tx.run(`
                    INSERT INTO lookup_values (id, tenant_id, lookup_id, value_id, value, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(tenant_id, lookup_id, value_id) DO UPDATE SET value = excluded.value, sort_order = excluded.sort_order`,
                    uuidv4(), req.tenantId, lookupId,
                    item.valueId || item.value.toLowerCase().replace(/\s+/g, '_'), // Auto-generate ID if missing
                    item.value, item.sortOrder || 0
                );
            }
        });
        res.json({ success: true, count: values.length });
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ error: 'Failed to import values' });
    }
});

// --- LIVE LOOKUP SOURCES ---

// Get live source config for a lookup
app.get('/api/lookups/:lookupId/live-source', authenticateToken, async (req, res) => {
    const { lookupId } = req.params;
    try {
        const source = await db.get(
            'SELECT * FROM lookup_sources WHERE tenant_id = ? AND lookup_id = ? AND is_active = 1',
            req.tenantId, lookupId
        );
        res.json(source || null);
    } catch (error) {
        console.error('Get live source error:', error);
        res.status(500).json({ error: 'Failed to get live source' });
    }
});

// Configure live source for a lookup
app.post('/api/lookups/:lookupId/live-source', authenticateToken, async (req, res) => {
    const { lookupId } = req.params;
    const { sourceType, sourceEntity, valueField = 'id', labelField = 'name', sqlQuery } = req.body;

    if (!sourceType) {
        return res.status(400).json({ error: 'sourceType is required' });
    }

    try {
        await db.run(`
            INSERT INTO lookup_sources (id, tenant_id, lookup_id, source_type, source_entity, value_field, label_field, sql_query)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tenant_id, lookup_id) DO UPDATE SET
                source_type = excluded.source_type,
                source_entity = excluded.source_entity,
                value_field = excluded.value_field,
                label_field = excluded.label_field,
                sql_query = excluded.sql_query,
                is_active = 1
        `, uuidv4(), req.tenantId, lookupId, sourceType, sourceEntity || null, valueField, labelField, sqlQuery || null);

        res.json({ success: true, message: 'Live source configured' });
    } catch (error) {
        console.error('Configure live source error:', error);
        res.status(500).json({ error: 'Failed to configure live source' });
    }
});

// Remove live source config (revert to static values)
app.delete('/api/lookups/:lookupId/live-source', authenticateToken, async (req, res) => {
    const { lookupId } = req.params;
    try {
        await db.run(
            'UPDATE lookup_sources SET is_active = 0 WHERE tenant_id = ? AND lookup_id = ?',
            req.tenantId, lookupId
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Delete live source error:', error);
        res.status(500).json({ error: 'Failed to remove live source' });
    }
});

// Delete a lookup value
app.delete('/api/lookups/:lookupId/:valueId', authenticateToken, async (req, res) => {
    const { lookupId, valueId } = req.params;
    try {
        await db.run(
            'UPDATE lookup_values SET is_active = 0 WHERE tenant_id = ? AND lookup_id = ? AND value_id = ?',
            req.tenantId, lookupId, valueId
        );
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
        await db.transaction(async (tx) => {
            for (let i = 0; i < rows.length; i++) {
                await tx.run(`
                    INSERT INTO lookup_values (id, tenant_id, lookup_id, value_id, value, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(tenant_id, lookup_id, value_id) DO UPDATE SET value = excluded.value`,
                    uuidv4(), req.tenantId, lookupId, rows[i].value_id, rows[i].value || 'Unnamed', i
                );
            }
        });
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
        await db.transaction(async (tx) => {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                await tx.run(`
                    INSERT INTO lookup_values (id, tenant_id, lookup_id, value_id, value, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(tenant_id, lookup_id, value_id) DO UPDATE SET value = excluded.value`,
                    uuidv4(), req.tenantId, lookupId,
                    String(row[valueColumn] || row.value_id || row.id || i),
                    String(row[labelColumn] || row.value || row.name || row.label || 'Unnamed'),
                    i
                );
            }
        });
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
app.get('/api/data/:entityType/:recordId/related/:targetEntity', authenticateToken, async (req, res) => {
    const { entityType, recordId, targetEntity } = req.params;
    try {
        // Find the relationship definition
        const relationship = await db.get(`
            SELECT * FROM relationships
            WHERE tenant_id = ? AND source_entity = ? AND target_entity = ?
        `, req.tenantId, entityType, targetEntity);

        if (!relationship) {
            // Try reverse relationship (target -> source)
            const reverseRel = await db.get(`
                SELECT * FROM relationships
                WHERE tenant_id = ? AND source_entity = ? AND target_entity = ?
            `, req.tenantId, targetEntity, entityType);

            if (reverseRel) {
                // Find records where the foreign key points to our record
                const rows = await db.all(`
                    SELECT * FROM records
                    WHERE tenant_id = ? AND entity_type = ?
                    AND ${db.json('data', reverseRel.source_field)} = ?
                `, req.tenantId, targetEntity, recordId);

                const records = rows.map(row => ({ ...JSON.parse(row.data), id: row.id, status: row.status }));
                return res.json(records);
            }
            return res.json([]);
        }

        // Get the source record to find the FK value
        const sourceRecord = await db.get('SELECT data FROM records WHERE id = ? AND tenant_id = ?', recordId, req.tenantId);
        if (!sourceRecord) {
            return res.json([]);
        }

        const sourceData = JSON.parse(sourceRecord.data);
        const fkValue = sourceData[relationship.source_field];

        if (!fkValue) {
            return res.json([]);
        }

        // Get the related record
        const relatedRow = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?',
            fkValue, req.tenantId, targetEntity);

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
            const defaultPassword = Math.random().toString(36).slice(-10) + 'A1!';
            const hashedPassword = bcrypt.hashSync(password || defaultPassword, 10);
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

// Email send — matches to a contact, stores to email_messages, logs the timeline.
// Accepts { to, subject, body } (preferred) or legacy { html, text }.
app.post('/api/email/send', authenticateToken, async (req, res) => {
    const { to, subject, body, html, text } = req.body || {};
    if (!to || !subject) {
        return res.status(400).json({ error: 'to and subject are required' });
    }
    try {
        const result = await sendEmail({
            to, subject, html: body || html, text,
            tenantId: req.tenantId, actorId: req.user.id,
        });
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message });
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
app.post('/api/cti/incoming', resolveInboundTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { key: _key, ...query } = req.query;
        const body = { ...query, ...req.body };
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

// ---- Reporting engine (tenant-safe, parameterized) ----
app.get('/api/reports', authenticateToken, async (req, res) => {
    try {
        res.json(listReports());
    } catch (error) {
        console.error('List reports error:', error);
        res.status(500).json({ error: 'Failed to list reports' });
    }
});

app.post('/api/reports/:id/run', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        const result = await runReport(req.tenantId, req.params.id, {
            params: b.params || {}, filters: b.filters || [],
            sort: b.sort, page: b.page, pageSize: b.pageSize,
        });
        res.json(result);
    } catch (error) {
        console.error('Run report error:', error);
        res.status(400).json({ error: error.message || 'Failed to run report' });
    }
});

// ---- Report Packs (multi-dataset, cached) ----
app.get('/api/reports/packs', authenticateToken, (req, res) => {
    try { res.json(listPacks()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reports/packs/:packId/run', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        const result = await runPack(req.tenantId, req.params.packId, {
            params:   b.params   || {},
            datasets: b.datasets || null,
            page:     b.page,
            pageSize: b.pageSize,
        });
        res.json(result);
    } catch (e) {
        console.error('Run pack error:', e);
        res.status(400).json({ error: e.message || 'Failed to run pack' });
    }
});

// ---- WhatsApp Business (Meta Cloud API) ----
// Public webhook — Meta calls these. Each message routes to the tenant that owns its
// phone_number_id and must carry a valid X-Hub-Signature-256 for that tenant's app secret.
app.get('/api/webhooks/whatsapp', async (req, res) => {
    const challenge = await verifyWebhook(req.query);
    if (challenge) return res.status(200).send(challenge);
    res.sendStatus(403);
});

app.post('/api/webhooks/whatsapp', async (req, res) => {
    const messages = parseWebhookPayload(req.body);
    let accepted;
    try {
        accepted = await waAuthenticateMessages(messages, req.rawBody, req.get('x-hub-signature-256'));
    } catch (e) {
        console.error('[whatsapp] webhook verification error:', e.message);
        return res.sendStatus(500);
    }
    // Payloads with messages but none authentic are forged or misrouted. Status-only
    // payloads (no messages) are acknowledged so Meta does not retry them.
    if (messages.length > 0 && accepted.length === 0) return res.sendStatus(401);
    // Acknowledge quickly — Meta retries on non-2xx and we must not loop.
    res.sendStatus(200);
    try {
        for (const { tenantId, msg } of accepted) {
            const r = await handleIncomingMessage(tenantId, msg);
            if (r.isNewLead) console.log(`[whatsapp] New lead from ${msg.from} (${msg.profileName || 'unknown'}) → tenant ${tenantId}`);
        }
    } catch (e) {
        console.error('[whatsapp] webhook error:', e.message);
    }
});

// Authenticated inbox APIs
app.get('/api/whatsapp/status', authenticateToken, async (req, res) => {
    const configured = await waConfigured(req.tenantId);
    res.json({ configured, mode: configured ? 'live' : 'simulated' });
});

app.get('/api/whatsapp/conversations', authenticateToken, async (req, res) => {
    try {
        res.json(await getConversations(req.tenantId));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/whatsapp/thread/:phone', authenticateToken, async (req, res) => {
    try {
        res.json(await getThread(req.tenantId, req.params.phone));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/whatsapp/send', authenticateToken, async (req, res) => {
    try {
        const { to, body } = req.body || {};
        const result = await sendMessage(req.tenantId, { to, body }, req.user.id);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Dev/demo helper: simulate an inbound message (same path as the real webhook)
app.post('/api/whatsapp/simulate-incoming', authenticateToken, async (req, res) => {
    try {
        const { from, body, profileName } = req.body || {};
        if (!from || !body) return res.status(400).json({ error: 'from and body are required' });
        const result = await handleIncomingMessage(req.tenantId, {
            from, body, profileName: profileName || '', waMessageId: `sim-${Date.now()}`,
        }, req.user.id);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Platform (superadmin): cross-tenant management ----
app.get('/api/platform/tenants', authenticateToken, requireSuperadmin, async (req, res) => {
    try { res.json(await listTenants()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/platform/tenants', authenticateToken, requireSuperadmin, async (req, res) => {
    try {
        const { name, adminEmail, adminPassword, adminName } = req.body || {};
        res.json(await createTenant({ name, adminEmail, adminPassword, adminName }, req.user.id));
    } catch (e) { res.status(400).json({ error: e.message }); }
});

app.patch('/api/platform/tenants/:id', authenticateToken, requireSuperadmin, async (req, res) => {
    try {
        const { name, status } = req.body || {};
        res.json(await updateTenant(req.params.id, { name, status }, req.user.id));
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Integrations (per-tenant credentials: WhatsApp / Facebook / Instagram / Email) ----
// Admin-only. Secrets are masked on read and preserved on blank save.
const requireAdmin = (req, res, next) => {
    if (req.user?.role === 'admin' || req.user?.permissions?.admin) return next();
    res.status(403).json({ error: 'Admin access required' });
};

app.get('/api/integrations', authenticateToken, requireAdmin, async (req, res) => {
    try { res.json(await listIntegrations(req.tenantId)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/integrations/:provider', authenticateToken, requireAdmin, async (req, res) => {
    try { res.json(await getIntegration(req.tenantId, req.params.provider)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/integrations/:provider', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { config, enabled } = req.body || {};
        const saved = await saveIntegration(req.tenantId, req.params.provider, { config, enabled }, req.user.id);
        res.json(saved);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Tenant ingest key for public inbound URLs (lead capture, telephony webhooks).
app.get('/api/ingest-key', authenticateToken, requireAdmin, async (req, res) => {
    try { res.json({ key: await getIngestKey(req.tenantId) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ingest-key/rotate', authenticateToken, requireAdmin, async (req, res) => {
    try { res.json({ key: await rotateIngestKey(req.tenantId, req.user.id) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Email (SMTP, simulated when unconfigured) ----
app.get('/api/email/status', authenticateToken, (req, res) => {
    res.json({ configured: emailConfigured(), mode: emailConfigured() ? 'live' : 'simulated' });
});

app.get('/api/email/conversations', authenticateToken, async (req, res) => {
    try { res.json(await getEmailConversations(req.tenantId)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/email/thread/:email', authenticateToken, async (req, res) => {
    try { res.json(await getEmailThread(req.tenantId, req.params.email)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Tasks & assignment (calendar / "my work") ----
// Tasks are records with entity_type='task'; we read assignee/dueDate from their JSON data.
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const { mine, assigneeId, status, from, to } = req.query;
        const rows = await db.all(
            'SELECT id, primary_display, status, data, created_at, updated_at FROM records WHERE tenant_id = ? AND entity_type = ?',
            req.tenantId, 'task'
        );
        let tasks = rows.map((r) => {
            let d = {};
            try { d = JSON.parse(r.data); } catch { d = {}; }
            return {
                id: r.id,
                subject: d.subject || r.primary_display || 'Untitled task',
                status: d.status || r.status || 'Not Started',
                priority: d.priority || 'Medium',
                assignee: d.assignee || '',
                assigneeId: d.assigneeId || '',
                dueDate: d.dueDate || '',
                startDate: d.startDate || '',
                category: d.category || '',
                customerId: d.customerId || '',
                relatedEntity: d.relatedEntity || (d.customerId ? 'customer' : ''),
                relatedId: d.relatedId || d.customerId || '',
                relatedName: d.relatedName || '',
                created_at: r.created_at,
            };
        });

        if (mine === '1') tasks = tasks.filter((t) => t.assigneeId === req.user.id);
        if (assigneeId) tasks = tasks.filter((t) => t.assigneeId === assigneeId);
        if (status) tasks = tasks.filter((t) => t.status === status);
        if (from) tasks = tasks.filter((t) => t.dueDate && t.dueDate >= from);
        if (to) tasks = tasks.filter((t) => t.dueDate && t.dueDate <= to);

        // Sort by dueDate asc (undated last), then created desc
        tasks.sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return new Date(b.created_at) - new Date(a.created_at);
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
        });
        res.json(tasks);
    } catch (e) {
        console.error('Tasks list error:', e);
        res.status(500).json({ error: 'Failed to list tasks' });
    }
});

// Assign / reschedule a task — updates the record's JSON + logs to its timeline.
app.post('/api/tasks/:id/assign', authenticateToken, async (req, res) => {
    try {
        const { assigneeId, assigneeName, dueDate, status } = req.body || {};
        const row = await db.get('SELECT * FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', req.params.id, req.tenantId, 'task');
        if (!row) return res.status(404).json({ error: 'Task not found' });

        let data = {};
        try { data = JSON.parse(row.data); } catch { data = {}; }
        if (assigneeId !== undefined) { data.assigneeId = assigneeId; data.assignee = assigneeName || data.assignee || ''; }
        if (dueDate !== undefined) data.dueDate = dueDate;
        if (status !== undefined) data.status = status;

        const newStatus = status !== undefined ? status : row.status;
        await db.run(
            'UPDATE records SET status = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
            newStatus, JSON.stringify(data), req.params.id, req.tenantId
        );
        await logAudit({
            tenantId: req.tenantId, entityType: 'task', recordId: req.params.id, action: 'assign',
            actorId: req.user.id, details: { assignee: data.assignee, dueDate: data.dueDate, status: newStatus, _via: 'calendar' },
        });
        reportCache.invalidateTenant(req.tenantId);
        res.json({ id: req.params.id, ...data, status: newStatus });
    } catch (e) {
        console.error('Task assign error:', e);
        res.status(500).json({ error: 'Failed to assign task' });
    }
});

// ---- Quotes (metadata-driven; totals computed server-side) ----
app.get('/api/quotes', authenticateToken, async (req, res) => {
    try { res.json(await listQuotes(req.tenantId)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/quotes/:id', authenticateToken, async (req, res) => {
    try {
        const q = await getQuote(req.tenantId, req.params.id);
        if (!q) return res.status(404).json({ error: 'Quote not found' });
        res.json(q);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/quotes', authenticateToken, async (req, res) => {
    try { res.json(await saveQuote(req.tenantId, req.body || {}, req.user.id)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/quotes/:id/status', authenticateToken, async (req, res) => {
    try { res.json(await setQuoteStatus(req.tenantId, req.params.id, req.body?.status, req.user.id)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/quotes/:id/email', authenticateToken, async (req, res) => {
    try { res.json(await emailQuote(req.tenantId, req.params.id, req.user.id)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/quotes/:id/convert', authenticateToken, async (req, res) => {
    try {
        const result = await convertQuote(req.tenantId, req.params.id, req.user.id);
        reportCache.invalidateTenant(req.tenantId);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Cache management (admin only)
app.get('/api/reports/cache/stats', authenticateToken, (req, res) => {
    res.json(reportCache.stats());
});
app.delete('/api/reports/cache', authenticateToken, (req, res) => {
    const { packId } = req.query;
    const n = packId
        ? reportCache.invalidatePack(req.tenantId, packId)
        : reportCache.invalidateTenant(req.tenantId);
    res.json({ invalidated: n });
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

app.post('/api/ingest/:source', resolveInboundTenant, async (req, res) => {
    try {
        const source = req.params.source || 'webhook';
        const tenantId = req.tenantId;
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
             WHERE tenant_id = ? AND (primary_display ${db.like} ? OR CAST(data AS TEXT) ${db.like} ?)
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

app.post('/api/ai/lead-tasks/:leadId', authenticateToken, async (req, res) => {
    try {
        const leadId = req.params.leadId;
        const tenantId = req.tenantId;
        const actorId = req.user.id;
        const force = req.query.force === '1';

        const leadRow = await db.get('SELECT data FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', leadId, tenantId, 'lead');
        if (!leadRow) return res.status(404).json({ error: 'Lead not found' });
        
        let leadData = {};
        try { leadData = JSON.parse(leadRow.data); } catch (e) {}

        // Debounce: check if we ran this recently (unless forced)
        if (!force && leadData._last_ai_task_run) {
            const lastRun = new Date(leadData._last_ai_task_run).getTime();
            const now = Date.now();
            if (now - lastRun < 10 * 60 * 1000) {
                return res.json({ skipped: true, reason: 'debounced', message: 'AI tasks were generated recently.' });
            }
        }

        // Fetch recent notes
        const notes = await db.all(
            `SELECT note, kind, actor_name, created_at FROM record_notes WHERE tenant_id = ? AND entity_type = 'lead' AND record_id = ? ORDER BY created_at DESC LIMIT 20`,
            tenantId, leadId
        );
        if (notes.length === 0 && !force) return res.json({ skipped: true, reason: 'no_notes', message: 'No notes to analyze.' });

        const notesContext = notes.map(n => `[${n.created_at}] ${n.kind} by ${n.actor_name || 'System'}: ${n.note}`).join('\n');
        
        const tasks = await generateLeadFollowupTasks(notesContext);
        if (!tasks || tasks.length === 0) return res.json({ success: true, created: 0 });

        let createdCount = 0;
        
        for (const t of tasks) {
            // Idempotency guard: check if identical open task exists
            const existingTasks = await db.all(
                `SELECT data FROM records WHERE tenant_id = ? AND entity_type = 'task' AND status != 'Completed'`,
                tenantId
            );
            
            const isDuplicate = existingTasks.some(row => {
                try {
                    const d = JSON.parse(row.data);
                    return d.subject === t.subject && d._linked_lead === leadId;
                } catch (e) { return false; }
            });

            if (isDuplicate) continue;

            const taskId = uuidv4();
            const taskData = {
                subject: t.subject,
                status: 'New',
                priority: t.priority,
                dueInDays: t.dueInDays,
                _linked_lead: leadId,
                _via: 'ai_task_generation'
            };
            
            await db.run(
                'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                taskId, tenantId, 'task', t.subject, 'New', JSON.stringify(taskData), leadData.owner_id || actorId
            );
            await logAudit({ tenantId, entityType: 'task', recordId: taskId, action: 'create', actorId, details: taskData });
            createdCount++;
        }

        // Update last run time
        leadData._last_ai_task_run = new Date().toISOString();
        await db.run('UPDATE records SET data = ? WHERE id = ? AND tenant_id = ?', JSON.stringify(leadData), leadId, tenantId);

        res.json({ success: true, created: createdCount });
    } catch (error) {
        console.error('AI lead task generation error:', error);
        res.status(500).json({ error: 'Task generation failed' });
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


// ─── Record Notes (Pipeline Comments Timeline) ───────────────────────────────

app.get('/api/notes/:entityType/:recordId', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all(
            `SELECT * FROM record_notes WHERE tenant_id=? AND entity_type=? AND record_id=? ORDER BY created_at ASC`,
            req.tenantId, req.params.entityType, req.params.recordId
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes/:entityType/:recordId', authenticateToken, async (req, res) => {
    try {
        const { note, stageName, kind = 'comment' } = req.body;
        if (!note?.trim()) return res.status(400).json({ error: 'note required' });
        const id = uuidv4();
        const actor = req.user ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email : 'System';
        await db.run(
            `INSERT INTO record_notes (id, tenant_id, entity_type, record_id, stage_name, note, kind, actor_id, actor_name) VALUES (?,?,?,?,?,?,?,?,?)`,
            id, req.tenantId, req.params.entityType, req.params.recordId, stageName || null, note.trim(), kind, req.userId, actor
        );
        res.json(await db.get('SELECT * FROM record_notes WHERE id=?', id));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notes/:noteId', authenticateToken, async (req, res) => {
    try {
        await db.run('DELETE FROM record_notes WHERE id=? AND tenant_id=?', req.params.noteId, req.tenantId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Notifications ────────────────────────────────────────────────────────────

app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all(
            `SELECT * FROM notifications WHERE tenant_id=? AND user_id=? ORDER BY created_at DESC LIMIT 50`,
            req.tenantId, req.userId
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
    try {
        const row = await db.get(
            `SELECT COUNT(*) as count FROM notifications WHERE tenant_id=? AND user_id=? AND is_read=0`,
            req.tenantId, req.userId
        );
        res.json({ count: row?.count || 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/mark-read', authenticateToken, async (req, res) => {
    try {
        const { ids } = req.body; // array or 'all'
        if (ids === 'all') {
            await db.run(`UPDATE notifications SET is_read=1 WHERE tenant_id=? AND user_id=?`, req.tenantId, req.userId);
        } else if (Array.isArray(ids)) {
            for (const id of ids) await db.run(`UPDATE notifications SET is_read=1 WHERE id=? AND tenant_id=?`, id, req.tenantId);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create notification (internal helper exposed for testing)
app.post('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const { userId, title, body, kind = 'info', recordId, entityType, scheduledAt } = req.body;
        const id = uuidv4();
        await db.run(
            `INSERT INTO notifications (id, tenant_id, user_id, title, body, kind, record_id, entity_type, scheduled_at) VALUES (?,?,?,?,?,?,?,?,?)`,
            id, req.tenantId, userId || req.userId, title, body || null, kind, recordId || null, entityType || null, scheduledAt || null
        );
        res.json(await db.get('SELECT * FROM notifications WHERE id=?', id));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Saved Reports ────────────────────────────────────────────────────────────

app.get('/api/saved-reports', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all(
            `SELECT * FROM saved_reports WHERE tenant_id=? ORDER BY created_at DESC`,
            req.tenantId
        );
        res.json(rows.map(r => ({
            ...r,
            columns: JSON.parse(r.columns || '[]'),
            filters: JSON.parse(r.filters || '[]'),
            group_by: JSON.parse(r.group_by || '[]'),
            sort_by: JSON.parse(r.sort_by || '[]'),
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/saved-reports', authenticateToken, async (req, res) => {
    try {
        const { name, description, entityType, columns, filters, groupBy, sortBy, vizType } = req.body;
        if (!name || !entityType || !columns?.length) return res.status(400).json({ error: 'name, entityType, columns required' });
        const id = req.body.id || uuidv4();
        await db.run(
            `INSERT INTO saved_reports (id, tenant_id, name, description, entity_type, columns, filters, group_by, sort_by, viz_type, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
               entity_type=excluded.entity_type, columns=excluded.columns, filters=excluded.filters,
               group_by=excluded.group_by, sort_by=excluded.sort_by, viz_type=excluded.viz_type`,
            id, req.tenantId, name, description || '', entityType,
            JSON.stringify(columns), JSON.stringify(filters || []), JSON.stringify(groupBy || []),
            JSON.stringify(sortBy || []), vizType || 'table', req.userId
        );
        res.json(await db.get('SELECT * FROM saved_reports WHERE id=?', id));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/saved-reports/:id', authenticateToken, async (req, res) => {
    try {
        await db.run('DELETE FROM saved_reports WHERE id=? AND tenant_id=?', req.params.id, req.tenantId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Run a report query dynamically against real records
app.post('/api/saved-reports/run', authenticateToken, async (req, res) => {
    try {
        const { entityType, columns = [], filters = [], groupBy = [], sortBy = [] } = req.body;
        // Fetch all records for entity, parse JSON data, apply filters + grouping in JS
        const rows = await db.all(
            `SELECT id, primary_display, status, created_at, data FROM records WHERE tenant_id=? AND entity_type=?`,
            req.tenantId, entityType
        );

        // Parse + flatten records
        let records = rows.map(r => {
            let d = {}; try { d = JSON.parse(r.data || '{}'); } catch {}
            return { id: r.id, _display: r.primary_display, _status: r.status, _created_at: r.created_at, ...d };
        });

        // Apply filters
        const OPS = { eq: (a,b)=>String(a??'')===String(b), neq: (a,b)=>String(a??'')!==String(b),
            contains: (a,b)=>String(a??'').toLowerCase().includes(String(b).toLowerCase()),
            gt: (a,b)=>Number(a)>Number(b), lt: (a,b)=>Number(a)<Number(b) };
        for (const f of filters) {
            if (!f.field || f.value===undefined || f.value===null || f.value==='') continue;
            const fn = OPS[f.op] || OPS.eq;
            records = records.filter(r => fn(r[f.field], f.value));
        }

        // Group by
        let resultRows;
        if (groupBy.length > 0) {
            const groupField = groupBy[0];
            const groups = {};
            for (const r of records) {
                const key = r[groupField] ?? '(empty)';
                if (!groups[key]) groups[key] = { [groupField]: key, count: 0, _sum: {}, _records: [] };
                groups[key].count++;
                groups[key]._records.push(r);
                for (const col of columns) {
                    if (col.aggregate === 'sum') {
                        groups[key]._sum[col.field] = (groups[key]._sum[col.field] || 0) + (Number(r[col.field]) || 0);
                    }
                }
            }
            resultRows = Object.values(groups).map(g => {
                const out = { [groupField]: g[groupField], count: g.count };
                for (const col of columns) if (col.aggregate === 'sum') out[col.field] = g._sum[col.field] || 0;
                return out;
            });
        } else {
            // Return selected columns only
            const fieldNames = columns.map(c => c.field);
            resultRows = records.map(r => {
                const out = {};
                for (const f of fieldNames) out[f] = r[f];
                out.id = r.id;
                return out;
            });
        }

        // Sort
        if (sortBy.length > 0) {
            const { field, dir = 'asc' } = sortBy[0];
            resultRows.sort((a, b) => {
                const av = a[field] ?? '', bv = b[field] ?? '';
                return (dir === 'desc' ? -1 : 1) * (String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0);
            });
        }

        res.json({ rows: resultRows, total: resultRows.length });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─── Campaign Form Submissions (public) ──────────────────────────────────────

// Public: get form definition for a campaign
app.get('/api/public/form/:campaignId', async (req, res) => {
    try {
        const row = await db.get(
            `SELECT id, name, entity_type, form_template FROM campaigns WHERE id=? AND channel='web_form'`,
            req.params.campaignId
        );
        if (!row) return res.status(404).json({ error: 'Form not found' });
        res.json({
            id: row.id, name: row.name, entityType: row.entity_type,
            template: JSON.parse(row.form_template || 'null'),
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Public: submit form data (no auth required)
app.post('/api/public/form/:campaignId/submit', async (req, res) => {
    try {
        const row = await db.get(
            `SELECT * FROM campaigns WHERE id=? AND channel='web_form'`,
            req.params.campaignId
        );
        if (!row) return res.status(404).json({ error: 'Form not found' });

        const template = JSON.parse(row.form_template || 'null');
        const submitted = req.body;
        const entityType = row.entity_type || 'lead';

        // Map form fields to entity data using mapTo
        const entityData = {};
        if (template?.fields) {
            for (const field of template.fields) {
                const val = submitted[field.name];
                if (val !== undefined && val !== '') {
                    const target = field.mapTo || field.name;
                    entityData[target] = val;
                }
            }
        }

        // Set primary display
        const display = entityData.name || `${entityData.firstName || ''} ${entityData.lastName || ''}`.trim()
            || entityData.email || 'Web Form Submission';

        // Create record
        const recordId = uuidv4();
        await db.run(
            `INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data)
             VALUES (?,?,?,?,?,?)`,
            recordId, row.tenant_id, entityType, display, 'New', JSON.stringify(entityData)
        );

        // Save submission log
        const subId = uuidv4();
        await db.run(
            `INSERT INTO form_submissions (id, tenant_id, campaign_id, record_id, data, submitter_ip)
             VALUES (?,?,?,?,?,?)`,
            subId, row.tenant_id, row.id, recordId, JSON.stringify(submitted),
            req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
        );

        // Increment submission count
        await db.run(`UPDATE campaigns SET submission_count = submission_count + 1 WHERE id=?`, row.id);

        res.json({ success: true, message: template?.successMessage || 'Thank you!' });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Authenticated: list submissions for a campaign
app.get('/api/campaigns/:id/submissions', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all(
            `SELECT * FROM form_submissions WHERE tenant_id=? AND campaign_id=? ORDER BY created_at DESC LIMIT 100`,
            req.tenantId, req.params.id
        );
        res.json(rows.map(r => ({ ...r, data: JSON.parse(r.data || '{}') })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Profile image upload ---
app.post('/api/upload/profile/:entityType/:recordId', authenticateToken, (req, res, next) => {
    const dir = path.join(UPLOAD_DIR, req.tenantId, req.params.entityType, req.params.recordId);
    fs.mkdirSync(dir, { recursive: true });
    multer({
        storage: multer.diskStorage({
            destination: (req2, file, cb) => cb(null, dir),
            filename: (req2, file, cb) => cb(null, `profile${path.extname(file.originalname).toLowerCase()}`),
        }),
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (req2, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Images only')),
    }).single('file')(req, res, next);
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const { entityType, recordId } = req.params;
        const url = `/uploads/${req.tenantId}/${entityType}/${recordId}/${req.file.filename}`;
        const row = await db.get('SELECT data FROM records WHERE id = ? AND tenant_id = ?', recordId, req.tenantId);
        if (!row) return res.status(404).json({ error: 'Record not found' });
        let data = {};
        try { data = JSON.parse(row.data || '{}'); } catch {}
        data.profileImage = url;
        await db.run('UPDATE records SET data = ? WHERE id = ? AND tenant_id = ?', JSON.stringify(data), recordId, req.tenantId);
        await logAudit({ tenantId: req.tenantId, entityType, recordId, action: 'update', actorId: req.user.id, details: { profileImage: url } });
        res.json({ url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Notifications ---
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all(
            `SELECT * FROM notifications WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50`,
            req.tenantId, req.user.id
        );
        res.json(rows);
    } catch (error) {
        console.error('Notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await db.run(
            `UPDATE notifications SET is_read = 1 WHERE id = ? AND tenant_id = ? AND user_id = ?`,
            req.params.id, req.tenantId, req.user.id
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark read' });
    }
});

app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await db.run(
            `UPDATE notifications SET is_read = 1 WHERE tenant_id = ? AND user_id = ?`,
            req.tenantId, req.user.id
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark all read' });
    }
});

// ═══════════════════════════════════════════════════════
// CSV IMPORT ROUTES
// ═══════════════════════════════════════════════════════

// Download a CSV template dynamically built from entity field definitions
app.get('/api/data/:entityType/import-template', authenticateToken, async (req, res) => {
    const { entityType } = req.params;
    try {
        const defRow = await db.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', req.tenantId, entityType);
        if (!defRow) return res.status(404).json({ error: 'Entity not found' });
        const def = JSON.parse(defRow.config);
        const skipTypes = ['image', 'iframe', 'attachment'];
        const fields = def.fields.filter(f => !skipTypes.includes(f.type));
        const headers = fields.map(f => f.name).join(',');
        const sampleRow1 = fields.map(f => {
            if (f.type === 'email') return 'john.doe@example.com';
            if (f.type === 'phone') return '9876543210';
            if (f.type === 'number' || f.type === 'currency') return '0';
            if (f.options && f.options.length) return f.options[0];
            return `Sample ${f.label}`;
        }).join(',');
        const sampleRow2 = fields.map(f => {
            if (f.type === 'email') return 'jane.smith@example.com';
            if (f.type === 'phone') return '9123456789';
            if (f.type === 'number' || f.type === 'currency') return '100';
            if (f.options && f.options.length) return f.options[0];
            return `Another ${f.label}`;
        }).join(',');
        const csv = [headers, sampleRow1, sampleRow2].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${entityType}_import_template.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CSV upload for bulk import
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/data/:entityType/import', authenticateToken, csvUpload.single('file'), async (req, res) => {
    const { entityType } = req.params;
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const content = req.file.buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length < 2) return res.status(400).json({ error: 'CSV must have at least a header row and one data row' });

        const columnMap = req.body.columnMap ? JSON.parse(req.body.columnMap) : null;
        const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

        // Get entity definition for field types
        const defRow = await db.get('SELECT config FROM entity_definitions WHERE tenant_id = ? AND entity_type = ?', req.tenantId, entityType);
        const def = defRow ? JSON.parse(defRow.config) : { fields: [] };

        let imported = 0, skipped = 0;
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            // Simple CSV parse (handles quoted fields)
            const values = [];
            let cur = '', inQuote = false;
            for (const ch of line) {
                if (ch === '"') { inQuote = !inQuote; }
                else if (ch === ',' && !inQuote) { values.push(cur.trim()); cur = ''; }
                else { cur += ch; }
            }
            values.push(cur.trim());

            // Build raw row object from CSV headers
            const raw = {};
            rawHeaders.forEach((h, idx) => {
                const targetField = columnMap ? (columnMap[h] || h) : h;
                raw[targetField] = values[idx] !== undefined ? values[idx] : '';
            });

            // Map aliases (for leads)
            const mapped = entityType === 'lead' ? mapPayload(raw) : raw;

            // Dedupe for leads: by email
            if (entityType === 'lead' && mapped.email) {
                const existEmail = await db.get(
                    `SELECT id FROM records WHERE tenant_id = ? AND entity_type = 'lead' AND ${db.json('data', 'email')} = ?`,
                    req.tenantId, mapped.email
                );
                if (existEmail) { skipped++; continue; }
            }

            // Dedupe for leads: by phone
            if (entityType === 'lead' && (mapped.phone || mapped.mobile)) {
                const phone = mapped.phone || mapped.mobile;
                const existPhone = await db.get(
                    `SELECT id FROM records WHERE tenant_id = ? AND entity_type = 'lead' AND ${db.json('data', 'phone')} = ?`,
                    req.tenantId, phone
                );
                if (existPhone) { skipped++; continue; }
            }

            try {
                const recordId = uuidv4();
                const primaryDisplay = mapped.name ||
                    [mapped.firstName, mapped.lastName].filter(Boolean).join(' ') ||
                    mapped.email || mapped.company || 'Imported Record';
                const status = mapped.status || 'New';

                // Auto-score leads
                if (entityType === 'lead') {
                    try {
                        const score = await calculateLeadScore(mapped, req.tenantId);
                        if (score > 0) mapped.score = score;
                    } catch (_) {}
                }

                mapped._imported_via = 'csv';
                mapped._imported_at = new Date().toISOString();

                await db.run(
                    'INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)',
                    recordId, req.tenantId, entityType, primaryDisplay, status, JSON.stringify(mapped)
                );

                await logAudit({ tenantId: req.tenantId, entityType, recordId, action: 'create', actorId: req.user.id, details: { ...mapped, _via: 'csv_import' } });

                // Auto-assign leads
                if (entityType === 'lead') {
                    try { await assignLead(req.tenantId, recordId, mapped); } catch (_) {}
                }

                imported++;
            } catch (e) {
                errors.push({ row: i, error: e.message });
            }
        }

        reportCache.invalidateTenant(req.tenantId);
        res.json({ success: true, imported, skipped, errors, total: lines.length - 1 });
    } catch (err) {
        console.error('[import]', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════
// DUPLICATE CHECK
// ═══════════════════════════════════════════════════════

app.get('/api/leads/check-duplicate', authenticateToken, async (req, res) => {
    const { phone, email } = req.query;
    try {
        if (phone) {
            const suffix = String(phone).replace(/\D/g, '').slice(-10);
            const leads = await db.all(`SELECT id, primary_display, data FROM records WHERE tenant_id = ? AND entity_type = 'lead'`, req.tenantId);
            for (const r of leads) {
                const d = JSON.parse(r.data || '{}');
                const p = String(d.phone || d.mobile || '').replace(/\D/g, '').slice(-10);
                if (p && p === suffix) return res.json({ duplicate: true, type: 'lead', id: r.id, name: r.primary_display });
            }
            const customers = await db.all(`SELECT id, primary_display, data FROM records WHERE tenant_id = ? AND entity_type = 'customer'`, req.tenantId);
            for (const r of customers) {
                const d = JSON.parse(r.data || '{}');
                const p = String(d.phone || d.mobile || '').replace(/\D/g, '').slice(-10);
                if (p && p === suffix) return res.json({ duplicate: true, type: 'customer', id: r.id, name: r.primary_display });
            }
        }
        if (email) {
            const emailLower = email.toLowerCase();
            const lead = await db.get(`SELECT id, primary_display FROM records WHERE tenant_id = ? AND entity_type = 'lead' AND ${db.json('data', 'email')} = ?`, req.tenantId, emailLower);
            if (lead) return res.json({ duplicate: true, type: 'lead', id: lead.id, name: lead.primary_display });
        }
        res.json({ duplicate: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════
// AUDIT LOG VIEWER
// ═══════════════════════════════════════════════════════

app.get('/api/audit-logs', authenticateToken, async (req, res) => {
    const { entityType, action, userId, from, to, page = 1, pageSize = 50 } = req.query;
    try {
        let sql = `SELECT al.*, u.email as actor_email, u.first_name as actor_first, u.last_name as actor_last
                   FROM audit_logs al
                   LEFT JOIN users u ON u.id = al.actor_id
                   WHERE al.tenant_id = ?`;
        const params = [req.tenantId];
        if (entityType) { sql += ` AND al.entity_type = ?`; params.push(entityType); }
        if (action) { sql += ` AND al.action = ?`; params.push(action); }
        if (userId) { sql += ` AND al.actor_id = ?`; params.push(userId); }
        if (from) { sql += ` AND al.created_at >= ?`; params.push(from); }
        if (to) { sql += ` AND al.created_at <= ?`; params.push(to); }
        sql += ` ORDER BY al.created_at DESC`;
        const offset = (Number(page) - 1) * Number(pageSize);
        sql += ` LIMIT ? OFFSET ?`;
        params.push(Number(pageSize), offset);
        const rows = await db.all(sql, ...params);
        const countRow = await db.get(`SELECT COUNT(*) as total FROM audit_logs WHERE tenant_id = ?`, req.tenantId);
        res.json({ rows: rows.map(r => ({ ...r, details: (() => { try { return JSON.parse(r.details); } catch { return r.details; } })() })), total: countRow.total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════
// SCORING RULES
// ═══════════════════════════════════════════════════════

app.get('/api/scoring-rules', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM scoring_rules WHERE tenant_id = ? ORDER BY created_at ASC', req.tenantId);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/scoring-rules', authenticateToken, async (req, res) => {
    const { id, name, field, operator, value, points, is_active } = req.body;
    try {
        const ruleId = id || uuidv4();
        await db.run(
            `INSERT INTO scoring_rules (id, tenant_id, name, field, operator, value, points, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, field=excluded.field, operator=excluded.operator,
             value=excluded.value, points=excluded.points, is_active=excluded.is_active`,
            ruleId, req.tenantId, name, field, operator, value ?? null, Number(points) || 0, is_active !== false ? 1 : 0
        );
        res.json({ success: true, id: ruleId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/scoring-rules/:id', authenticateToken, async (req, res) => {
    try {
        await db.run('DELETE FROM scoring_rules WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// ASSIGNMENT RULES
// ═══════════════════════════════════════════════════════

app.get('/api/assignment-rules', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM assignment_rules WHERE tenant_id = ? ORDER BY priority DESC, created_at ASC', req.tenantId);
        res.json(rows.map(r => ({ ...r, conditions: (() => { try { return JSON.parse(r.conditions); } catch { return {}; } })() })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/assignment-rules', authenticateToken, async (req, res) => {
    const { id, name, conditions, assign_to, mode, priority, is_active } = req.body;
    try {
        const ruleId = id || uuidv4();
        await db.run(
            `INSERT INTO assignment_rules (id, tenant_id, name, conditions, assign_to, mode, priority, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, conditions=excluded.conditions,
             assign_to=excluded.assign_to, mode=excluded.mode, priority=excluded.priority, is_active=excluded.is_active`,
            ruleId, req.tenantId, name, JSON.stringify(conditions || {}),
            assign_to || null, mode || 'specific', Number(priority) || 0, is_active !== false ? 1 : 0
        );
        res.json({ success: true, id: ruleId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/assignment-rules/:id', authenticateToken, async (req, res) => {
    try {
        await db.run('DELETE FROM assignment_rules WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// DRIP SEQUENCES
// ═══════════════════════════════════════════════════════

app.get('/api/sequences', authenticateToken, async (req, res) => {
    try { res.json(await listSequences(req.tenantId)); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sequences/:id', authenticateToken, async (req, res) => {
    try {
        const seq = await getSequence(req.tenantId, req.params.id);
        if (!seq) return res.status(404).json({ error: 'Sequence not found' });
        res.json(seq);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sequences', authenticateToken, async (req, res) => {
    try { res.json(await saveSequence(req.tenantId, req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/sequences/:id', authenticateToken, async (req, res) => {
    try { res.json(await deleteSequence(req.tenantId, req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sequences/:id/enroll', authenticateToken, async (req, res) => {
    const { recordId } = req.body;
    if (!recordId) return res.status(400).json({ error: 'recordId is required' });
    try { res.json(await enrollRecord(req.tenantId, req.params.id, recordId, req.user.id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sequences/enrollments/:recordId', authenticateToken, async (req, res) => {
    try { res.json(await getEnrollments(req.tenantId, req.params.recordId)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sequences/enrollments/:enrollmentId/cancel', authenticateToken, async (req, res) => {
    try { res.json(await unenrollRecord(req.tenantId, req.params.enrollmentId)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════════════

const server = app.listen(PORT, () => {
    console.log(`FlowCRM Backend running on http://localhost:${PORT}`);
    startLeadRuleScheduler();
    startSequenceScheduler();
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌  Port ${PORT} is already in use.`);
        console.error(`   Run this to free it:  npx kill-port ${PORT}\n`);
    } else {
        console.error('Server error:', err);
    }
    process.exit(1);
});
