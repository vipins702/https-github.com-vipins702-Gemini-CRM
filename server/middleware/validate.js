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
};
