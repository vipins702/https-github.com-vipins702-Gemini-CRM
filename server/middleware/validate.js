// Request-body checks for write routes whose handlers pass req.body straight into SQL.
// A missing or wrongly typed value used to surface as an exception (HTTP 500, and for one route a
// crashed server). Spec: { field: 'type' } where type is string | number | boolean | object | array | any,
// with `!` = required and `|null` = null allowed. Optional fields may be absent or null.
import db from '../database.js';
import { passwordProblem } from '../utils/passwordPolicy.js';

const typeOk = (t, v) => {
    switch (t) {
        case 'string': return typeof v === 'string';
        case 'number': return (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
        case 'boolean': return typeof v === 'boolean';
        case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
        case 'array': return Array.isArray(v);
        default: return true;
    }
};

export function checkBody(spec, body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
    for (const [field, raw] of Object.entries(spec)) {
        const required = raw.includes('!');
        const types = raw.replace('!', '').split('|');
        const nullable = types.includes('null');
        const wanted = types.filter(t => t !== 'null');
        const v = body[field];
        if (v === undefined || (v === null && !nullable)) {
            if (required) return `${field} is required`;
            continue;
        }
        if (v === null) continue;
        if (!wanted.some(t => typeOk(t, v))) return `${field} must be ${wanted.join(' or ')}`;
        if (wanted[0] === 'string' && required && !nullable && typeof v === 'string' && !v.trim()) return `${field} is required`;
    }
    return null;
}

/** Route middleware: `app.post(path, authenticateToken, validate(rules.roles), handler)`. */
export const validate = (spec, { defaults } = {}) => (req, res, next) => {
    const spec2 = typeof spec === 'function' ? spec(req.body || {}) : spec;
    const problem = checkBody(spec2, req.body);
    if (problem) return res.status(400).json({ error: 'Validation Failed', details: [problem] });
    if (defaults) for (const [k, v] of Object.entries(defaults)) if (req.body[k] === undefined || req.body[k] === null) req.body[k] = typeof v === 'function' ? v() : v;
    next();
};

/** When a password is supplied it must meet the password policy. */
export const validatePassword = (req, res, next) => {
    const pw = req.body?.password;
    if (pw === undefined || pw === null || pw === '') return next();
    const problem = passwordProblem(pw);
    if (problem) return res.status(400).json({ error: 'Validation Failed', details: [problem] });
    next();
};

/** A user's role must be the built-in admin role or a role of the caller's own workspace. */
export const validateRoleId = async (req, res, next) => {
    const id = req.body?.roleId;
    if (id === 'admin') return next();
    try {
        const row = await db.get('SELECT id FROM roles WHERE id = ? AND tenant_id = ?', id, req.tenantId);
        if (!row) return res.status(400).json({ error: 'Validation Failed', details: ['roleId must be "admin" or a role of this workspace'] });
        next();
    } catch (e) { next(e); }
};

// ── Workspace menu and settings: stored as given and read by every screen, so a wrong shape breaks the app ──
const menuProblem = (items, depth = 0) => {
    if (!Array.isArray(items)) return 'The menu must be a list of items';
    // An empty menu leaves nothing to click, including the Menu Builder that could repair it.
    if (depth === 0 && items.length === 0) return 'The menu needs at least one item';
    if (items.length > 200) return 'The menu has too many items';
    if (depth > 3) return 'The menu is nested too deeply';
    for (const [i, it] of items.entries()) {
        if (!it || typeof it !== 'object' || Array.isArray(it)) return `Menu item ${i + 1} must be an object`;
        if (typeof it.id !== 'string' || !it.id.trim() || it.id.length > 80) return `Menu item ${i + 1} needs an id`;
        if (typeof it.label !== 'string' || !it.label.trim() || it.label.length > 120) return `Menu item "${it.id}" needs a label`;
        if (it.type !== undefined && !['item', 'group'].includes(it.type)) return `Menu item "${it.id}" has an unknown type`;
        for (const k of ['view', 'icon']) if (it[k] !== undefined && it[k] !== null && (typeof it[k] !== 'string' || it[k].length > 80)) return `Menu item "${it.id}": ${k} must be text`;
        if (it.allowedRoles !== undefined && (!Array.isArray(it.allowedRoles) || it.allowedRoles.some(r => typeof r !== 'string'))) return `Menu item "${it.id}": allowedRoles must be a list of role ids`;
        if (it.children !== undefined) { const p = menuProblem(it.children, depth + 1); if (p) return p; }
    }
    return null;
};
export const validateMenu = (req, res, next) => {
    const problem = menuProblem(req.body);
    if (problem) return res.status(400).json({ error: 'Validation Failed', details: [problem] });
    next();
};

export const validateSettings = (req, res, next) => {
    const b = req.body;
    const fail = (m) => res.status(400).json({ error: 'Validation Failed', details: [m] });
    if (!b || typeof b !== 'object' || Array.isArray(b)) return fail('Settings must be an object');
    if (JSON.stringify(b).length > 20000) return fail('Settings are too large');
    if (typeof b.organizationName !== 'string') return fail('organizationName is required');
    if (b.theme !== undefined && !['light', 'dark', 'system'].includes(b.theme)) return fail('theme must be light, dark or system');
    if (b.primaryColor !== undefined && typeof b.primaryColor !== 'string') return fail('primaryColor must be text');
    if (b.customColor && !/^#[0-9a-fA-F]{6}$/.test(b.customColor)) return fail('customColor must look like #RRGGBB');
    if (b.logoUrl && !/^(https?:\/\/|\/)/i.test(String(b.logoUrl))) return fail('logoUrl must be an http(s) address or a path on this site');
    next();
};

export const rules = {
    roles: { id: 'string', name: 'string!', description: 'string', permissions: 'object' },
    users: (body) => ({ id: 'string', email: body.id ? 'string' : 'string!', password: 'string', roleId: 'string!', name: 'string', isActive: 'boolean' }),
    notes: { note: 'string!', stageName: 'string', kind: 'string' },
    scoringRules: { id: 'string', name: 'string!', field: 'string!', operator: 'string!' },
    assignmentRules: { id: 'string', name: 'string!', assign_to: 'string', mode: 'string' },
    sequences: { id: 'string', name: 'string!', entity_type: 'string', steps: 'array' },
    savedReports: { id: 'string', name: 'string!', entityType: 'string!', description: 'string', columns: 'array', filters: 'array', vizType: 'string' },
    workflows: { nodes: 'array!', edges: 'array' },
    notifications: { title: 'string!', userId: 'string', body: 'string', kind: 'string', recordId: 'string', entityType: 'string', scheduledAt: 'string' },
    logCall: { direction: 'string', from: 'string', to: 'string', status: 'string', entityType: 'string', recordId: 'string', name: 'string', outcome: 'string', notes: 'string' },
    webContent: { slug: 'string!', type: 'string!', title: 'string|null!', content: 'string|null!' },
    schemas: { entityType: 'string!', config: 'object!' },
    changePassword: { currentPassword: 'string!', newPassword: 'string!' },
    audit: { entityType: 'string', recordId: 'string!', action: 'string', details: 'object' },
    forgotPassword: { email: 'string!' },
    resetCheck: { token: 'string!' },
    resetPassword: { token: 'string!', newPassword: 'string!' },
    demoRequest: { name: 'string!', email: 'string!', company: 'string', phone: 'string', industry: 'string', message: 'string', website: 'string' },
};
