// HTTP routes for journeys (see journeys.js). Building and testing journeys is admin-only; the history of one record
// is readable by anyone who may read that record (see the policy table in middleware/access.js).
import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { checkJourney, triggerOf, rowToJourney, summarizeTrigger, testJourney, processDue, scanTimeTriggers, recordWithLabels, TRIGGERS } from './journeys.js';
import { logAudit } from './audit.js';

const MAX_JOURNEYS = 50;
const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const bad = (res, details) => res.status(400).json({ error: 'Validation Failed', details });

export async function loadSchemas(tenantId) {
    const rows = await db.all('SELECT entity_type, config FROM entity_definitions WHERE tenant_id = ?', tenantId);
    const out = {};
    for (const r of rows) { const c = parse(r.config, null); if (c) out[r.entity_type] = { ...c, id: c.id || r.entity_type }; }
    return out;
}

/** Create or update a journey from a graph. Returns { journey } or { errors }. */
export async function saveJourney(tenantId, userId, body, forceId = null) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length > 120) return { errors: ['name is too long (up to 120 characters)'] };
    const schemas = await loadSchemas(tenantId);
    const graph = { nodes: body.nodes, edges: Array.isArray(body.edges) ? body.edges : [] };
    const errors = checkJourney(graph, schemas);
    if (errors.length) return { errors };
    const t = triggerOf(graph);
    const finalName = name || t.name || 'Journey';
    let id = forceId || body.id;
    let existing = null;
    if (id !== undefined) {
        if (typeof id !== 'string') return { errors: ['id must be text'] };
        existing = await db.get('SELECT id FROM journeys WHERE id = ? AND tenant_id = ?', id, tenantId);
        if (!existing) return { status: 404, errors: ['Journey not found'] };
    } else {
        const n = await db.get('SELECT COUNT(*) AS n FROM journeys WHERE tenant_id = ?', tenantId);
        if ((n?.n || 0) >= MAX_JOURNEYS) return { errors: [`a workspace can have up to ${MAX_JOURNEYS} journeys`] };
    }
    const active = body.isActive === false ? 0 : 1;
    if (existing) {
        await db.run('UPDATE journeys SET name = ?, entity_type = ?, trigger_type = ?, trigger_config = ?, graph = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
            finalName, t.entityType, t.triggerType, JSON.stringify(t.config), JSON.stringify(graph), body.isActive === undefined ? 1 : active, existing.id, tenantId);
    } else {
        await db.run('INSERT INTO journeys (id, tenant_id, name, entity_type, trigger_type, trigger_config, graph, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            id = uuidv4(), tenantId, finalName, t.entityType, t.triggerType, JSON.stringify(t.config), JSON.stringify(graph), active, userId);
    }
    await logAudit({ tenantId, entityType: 'journey', recordId: id, action: existing ? 'update' : 'create', actorId: userId, details: { name: finalName } });
    return { journey: rowToJourney(await db.get('SELECT * FROM journeys WHERE id = ?', id)) };
}

export function registerJourneyRoutes(app, { authenticateToken, requireAdmin }) {
    const admin = [authenticateToken, requireAdmin];

    app.get('/api/journeys', ...admin, async (req, res) => {
        const schemas = await loadSchemas(req.tenantId);
        const rows = await db.all('SELECT * FROM journeys WHERE tenant_id = ? ORDER BY created_at', req.tenantId);
        const counts = await db.all('SELECT journey_id, status, COUNT(*) AS n FROM journey_runs WHERE tenant_id = ? GROUP BY journey_id, status', req.tenantId);
        res.json(rows.map(r => {
            const j = rowToJourney(r);
            const c = { running: 0, waiting: 0, done: 0, failed: 0, cancelled: 0 };
            for (const x of counts) if (x.journey_id === r.id && x.status in c) c[x.status] = x.n;
            return { id: j.id, name: j.name, entityType: j.entityType, triggerType: j.triggerType, trigger: summarizeTrigger(j, schemas), isActive: j.isActive, steps: j.nodes.length - 1, runs: c, updatedAt: j.updatedAt };
        }));
    });

    // Specific paths first, so they are not taken for an id.
    app.get('/api/journeys/records/:entityType/:recordId/runs', authenticateToken, async (req, res) => {
        const rows = await db.all('SELECT id, journey_id, journey_name, status, error, due_at, steps, created_at, updated_at FROM journey_runs WHERE tenant_id = ? AND entity_type = ? AND record_id = ? ORDER BY created_at DESC LIMIT 50',
            req.tenantId, req.params.entityType, req.params.recordId);
        res.json(rows.map(r => ({ id: r.id, journeyId: r.journey_id, journeyName: r.journey_name, status: r.status, error: r.error, dueAt: r.due_at, steps: parse(r.steps, []), createdAt: r.created_at, updatedAt: r.updated_at })));
    });

    app.post('/api/journeys/process-due', ...admin, async (req, res) => {
        let asOf = new Date();
        if (req.body?.asOf !== undefined) { asOf = new Date(req.body.asOf); if (Number.isNaN(asOf.getTime())) return bad(res, ['asOf must be a date']); }
        const started = await scanTimeTriggers(asOf);
        const moved = await processDue(asOf);
        res.json({ started, moved });
    });

    app.post('/api/journeys/runs/:runId/cancel', ...admin, async (req, res) => {
        const out = await db.run("UPDATE journey_runs SET status = 'cancelled', due_at = NULL, updated_at = ? WHERE id = ? AND tenant_id = ? AND status IN ('waiting', 'running')", new Date().toISOString(), req.params.runId, req.tenantId);
        if (!(out?.changes ?? out?.rowCount)) return res.status(404).json({ error: 'That run is not waiting or running' });
        res.json({ success: true });
    });

    app.get('/api/journeys/:id', ...admin, async (req, res) => {
        const row = await db.get('SELECT * FROM journeys WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        if (!row) return res.status(404).json({ error: 'Journey not found' });
        res.json(rowToJourney(row));
    });

    app.post('/api/journeys', ...admin, async (req, res) => {
        const b = req.body;
        if (!b || typeof b !== 'object' || Array.isArray(b)) return bad(res, ['body must be an object']);
        if (b.name !== undefined && typeof b.name !== 'string') return bad(res, ['name must be text']);
        if (b.isActive !== undefined && typeof b.isActive !== 'boolean') return bad(res, ['isActive must be true or false']);
        const out = await saveJourney(req.tenantId, req.user.id, b);
        if (out.errors) return res.status(out.status || 400).json({ error: out.status === 404 ? out.errors[0] : 'Validation Failed', details: out.errors });
        res.json(out.journey);
    });

    app.post('/api/journeys/:id/active', ...admin, async (req, res) => {
        if (typeof req.body?.active !== 'boolean') return bad(res, ['active must be true or false']);
        const out = await db.run('UPDATE journeys SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?', req.body.active ? 1 : 0, req.params.id, req.tenantId);
        if (!(out?.changes ?? out?.rowCount)) return res.status(404).json({ error: 'Journey not found' });
        await logAudit({ tenantId: req.tenantId, entityType: 'journey', recordId: req.params.id, action: 'update', actorId: req.user.id, details: { isActive: req.body.active } });
        res.json({ success: true, isActive: req.body.active });
    });

    app.delete('/api/journeys/:id', ...admin, async (req, res) => {
        const row = await db.get('SELECT id, name FROM journeys WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        if (!row) return res.status(404).json({ error: 'Journey not found' });
        await db.run("UPDATE journey_runs SET status = 'cancelled', due_at = NULL, updated_at = ? WHERE journey_id = ? AND tenant_id = ? AND status IN ('waiting', 'running')", new Date().toISOString(), row.id, req.tenantId);
        await db.run('DELETE FROM journeys WHERE id = ? AND tenant_id = ?', row.id, req.tenantId);
        await logAudit({ tenantId: req.tenantId, entityType: 'journey', recordId: row.id, action: 'delete', actorId: req.user.id, details: { name: row.name } });
        res.json({ success: true });
    });

    app.post('/api/journeys/:id/test', ...admin, async (req, res) => {
        const row = await db.get('SELECT * FROM journeys WHERE id = ? AND tenant_id = ?', req.params.id, req.tenantId);
        if (!row) return res.status(404).json({ error: 'Journey not found' });
        if (typeof req.body?.recordId !== 'string') return bad(res, ['recordId is required: pick a record to test with']);
        const rec = await db.get('SELECT id, status, data, owner_id FROM records WHERE id = ? AND tenant_id = ? AND entity_type = ?', req.body.recordId, req.tenantId, row.entity_type);
        if (!rec) return res.status(404).json({ error: 'That record was not found' });
        const data = parse(rec.data, {});
        res.json(testJourney(parse(row.graph, { nodes: [], edges: [] }), await recordWithLabels(req.tenantId, row.entity_type, { ...data, id: rec.id, status: data.status ?? rec.status, owner_id: rec.owner_id })));
    });

    app.get('/api/journeys/:id/runs', ...admin, async (req, res) => {
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const status = typeof req.query.status === 'string' && ['running', 'waiting', 'done', 'failed', 'cancelled'].includes(req.query.status) ? req.query.status : null;
        const rows = await db.all(
            `SELECT r.id, r.record_id, r.status, r.error, r.due_at, r.steps, r.created_at, r.updated_at, rec.primary_display AS record_name
             FROM journey_runs r LEFT JOIN records rec ON rec.id = r.record_id AND rec.tenant_id = r.tenant_id
             WHERE r.tenant_id = ? AND r.journey_id = ?${status ? ' AND r.status = ?' : ''} ORDER BY r.created_at DESC LIMIT ${limit}`,
            ...[req.tenantId, req.params.id, ...(status ? [status] : [])]);
        res.json(rows.map(r => ({ id: r.id, recordId: r.record_id, recordName: r.record_name, status: r.status, error: r.error, dueAt: r.due_at, steps: parse(r.steps, []), createdAt: r.created_at, updatedAt: r.updated_at })));
    });

    // Older callers (and the old single-journey screen) use /api/workflows: it is the workspace's first journey.
    app.get('/api/workflows', authenticateToken, async (req, res) => {
        const row = await db.get('SELECT graph FROM journeys WHERE tenant_id = ? ORDER BY created_at LIMIT 1', req.tenantId);
        res.json(row ? parse(row.graph, { nodes: [], edges: [] }) : { nodes: [], edges: [] });
    });
    return { TRIGGERS };
}
