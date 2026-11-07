// One place that decides who may do what. Roles hold, per module (entity type):
//   { read, create, edit, delete, manage, scope: 'all' | 'team' | 'own', fields: { <name>: { read, edit } } }
// `manage` allows everything on the module; legacy `write` allows read + create + edit.
// Admins (role "admin", platform superadmins) bypass every check.
import db from '../database.js';
import { authenticateToken } from './auth.js';

export const isAdminUser = (req) =>
    req.user?.role === 'admin' || !!req.user?.isSuperadmin || !!req.user?.permissions?.admin;

const modulePerms = (req, entity) => {
    const p = req.user?.permissions?.[entity];
    return p && typeof p === 'object' ? p : null;
};

/** May this user do `action` (read | create | edit | delete) on `entity`? */
export function can(req, entity, action) {
    if (isAdminUser(req)) return true;
    const p = modulePerms(req, entity);
    if (!p) return false;
    if (p.manage) return true;
    if (action === 'read') return !!(p.read || p.write);
    if (action === 'create') return !!(p.create || p.write);
    if (action === 'edit') return !!(p.edit || p.write);
    if (action === 'delete') return !!p.delete;
    return false;
}

export const canAny = (req, entities, action) => entities.some(e => can(req, e, action));

/** Has at least one module permission (an empty role can use nothing). */
export function hasAnyAccess(req) {
    if (isAdminUser(req)) return true;
    return Object.values(req.user?.permissions || {}).some(p =>
        p && typeof p === 'object' && (p.read || p.create || p.edit || p.delete || p.manage || p.write));
}

/** Role scope "own": only records the user owns (records.owner_id). */
export const isOwnOnly = (req, entity) => !isAdminUser(req) && modulePerms(req, entity)?.scope === 'own';

/** "team" has no meaning yet (no teams exist), so it is treated like "own" rather than silently like "all". */
export const isRestrictedScope = (req, entity) => {
    const s = modulePerms(req, entity)?.scope;
    return !isAdminUser(req) && (s === 'own' || s === 'team');
};

// ── Field-level rules ───────────────────────────────────────────────────────
const fieldMap = (req, entity) => (isAdminUser(req) ? null : modulePerms(req, entity)?.fields || null);

export function hiddenFields(req, entity) {
    const f = fieldMap(req, entity);
    return f ? Object.keys(f).filter(k => f[k]?.read === false) : [];
}

/** Fields the user may see but not change (edit off) or not even see (read off). */
export function lockedFields(req, entity) {
    const f = fieldMap(req, entity);
    return f ? Object.keys(f).filter(k => f[k]?.read === false || f[k]?.edit === false) : [];
}

export function filterFields(req, entity, data) {
    const hide = hiddenFields(req, entity);
    if (!hide.length) return data;
    const out = { ...data };
    for (const k of hide) delete out[k];
    return out;
}

/** Put back the stored value of every locked field so an edit cannot change it (new records just drop them). */
export function protectFields(req, entity, incoming, existing = {}) {
    for (const k of lockedFields(req, entity)) {
        if (existing && Object.prototype.hasOwnProperty.call(existing, k)) incoming[k] = existing[k];
        else delete incoming[k];
    }
    return incoming;
}

// ── Policy table for routes that carry no check of their own ────────────────
const DENY = (m) => m;
const adminOnly = (req) => (isAdminUser(req) ? null : DENY('Administrator access required'));
const access = (req) => (hasAnyAccess(req) ? null : DENY('Your role has no module access'));
const ent = (entity, action) => (req) => (can(req, entity, action) ? null : DENY(`Insufficient permissions to ${action} ${entity}`));
const anyOf = (entities, action) => (req) => (canAny(req, entities, action) ? null : DENY(`Insufficient permissions to ${action} ${entities.join('/')}`));

/** The record behind /:entity/:id must be one this user may touch: module permission plus "own" scope. */
const rec = (action) => async (req, g) => {
    const [entity, id] = g;
    if (!can(req, entity, action)) return DENY(`Insufficient permissions to ${action} ${entity}`);
    if (isRestrictedScope(req, entity)) {
        const row = await db.get('SELECT owner_id FROM records WHERE id = ? AND tenant_id = ?', id, req.tenantId);
        if (!row || row.owner_id !== req.user.id) return DENY(`You can only ${action === 'read' ? 'view' : 'change'} ${entity} records you own`);
    }
    return null;
};

/** Rows keyed by their own id (a note, an attachment): check the record they hang off. */
const viaRow = (table, action) => async (req, g) => {
    const row = await db.get(`SELECT entity_type, record_id FROM ${table} WHERE id = ? AND tenant_id = ?`, g[0], req.tenantId);
    if (!row) return null; // route answers 404
    return rec(action)(req, [row.entity_type, row.record_id]);
};

const LC = ['lead', 'customer'];
const POLICY = [
    // record-bound helpers
    ['GET',    /^\/notes\/([^/]+)\/([^/]+)$/,                 rec('read')],
    ['POST',   /^\/notes\/([^/]+)\/([^/]+)$/,                 rec('edit')],
    ['DELETE', /^\/notes\/([^/]+)$/,                          viaRow('record_notes', 'edit')],
    ['GET',    /^\/records\/([^/]+)\/([^/]+)\/related-activity$/, rec('read')],
    ['GET',    /^\/audit\/([^/]+)\/([^/]+)$/,                 rec('read')],
    ['GET',    /^\/attachments\/([^/]+)\/([^/]+)$/,           rec('read')],
    ['POST',   /^\/attachments\/([^/]+)\/([^/]+)$/,           rec('edit')],
    ['DELETE', /^\/attachments\/([^/]+)$/,                    viaRow('attachments', 'edit')],
    ['POST',   /^\/upload\/profile\/([^/]+)\/([^/]+)$/,       rec('edit')],
    ['GET',    /^\/data\/([^/]+)\/([^/]+)\/related\/([^/]+)$/, async (req, g) => (await rec('read')(req, g)) || ent(g[2], 'read')(req)],
    ['POST',   /^\/data\/([^/]+)\/([^/]+)\/status$/,          rec('edit')],
    ['POST',   /^\/data\/([^/]+)\/import$/,                   (req, g) => ent(g[0], 'create')(req)],
    ['GET',    /^\/data\/([^/]+)\/import-template$/,          (req, g) => ent(g[0], 'create')(req)],
    ['GET',    /^\/leads\/check-duplicate$/,                  ent('lead', 'read')],

    // people and activity feeds
    ['GET',    /^\/users$/,                                   access],
    ['GET',    /^\/audit-logs$/,                              adminOnly],
    ['GET',    /^\/audit\/recent$/,                           adminOnly],
    ['POST',   /^\/audit$/,                                   access],

    // sales objects without a module of their own: follow the customer / task / lead modules
    ['GET',    /^\/quotes(\/[^/]+)?$/,                        ent('customer', 'read')],
    ['POST',   /^\/quotes(\/[^/]+(\/(status|email|convert))?)?$/, ent('customer', 'edit')],
    ['GET',    /^\/tasks$/,                                   ent('task', 'read')],
    ['POST',   /^\/tasks\/[^/]+\/assign$/,                    ent('task', 'edit')],
    ['GET',    /^\/campaigns(\/[^/]+(\/submissions)?)?$/,     ent('lead', 'read')],
    ['POST',   /^\/campaigns(\/preview|\/[^/]+\/send)?$/,     ent('lead', 'edit')],

    // conversations and calls
    ['GET',    /^\/(whatsapp\/(conversations|thread\/[^/]+)|email\/(conversations|thread\/[^/]+)|cti\/calls)$/, anyOf(LC, 'read')],
    ['GET',    /^\/(whatsapp|email)\/status$/,                access],
    ['POST',   /^\/(whatsapp\/send|email\/send|cti\/log-call|cti\/route)$/, anyOf(LC, 'edit')],
    ['POST',   /^\/whatsapp\/simulate-incoming$/,             adminOnly],

    // rules and sequences: readable with lead access, changed by admins
    ['GET',    /^\/(scoring-rules|assignment-rules|lead-rules|sequences)(\/[^/]+)?$/, ent('lead', 'read')],
    ['GET',    /^\/sequences\/enrollments\/[^/]+$/,           ent('lead', 'read')],
    ['POST',   /^\/sequences\/[^/]+\/enroll$/,                ent('lead', 'edit')],
    ['POST',   /^\/sequences\/enrollments\/[^/]+\/cancel$/,   ent('lead', 'edit')],
    ['POST',   /^\/(scoring-rules|assignment-rules|lead-rules|sequences)(\/.*)?$/, adminOnly],
    ['DELETE', /^\/(scoring-rules|assignment-rules|lead-rules|sequences)\/[^/]+$/, adminOnly],
    ['POST',   /^\/processes\/[^/]+$/,                        adminOnly],

    // dashboards and reports
    ['GET',    /^\/(dashboard\/.*|reports(\/packs)?|saved-reports)$/, access],
    ['POST',   /^\/(reports\/[^/]+\/run|reports\/packs\/[^/]+\/run|saved-reports(\/run)?)$/, access],
    ['DELETE', /^\/saved-reports\/[^/]+$/,                    access],
    ['POST',   /^\/dashboard\/widgets$/,                      adminOnly],
    ['GET',    /^\/reports\/cache\/stats$/,                   adminOnly],
    ['DELETE', /^\/reports\/cache$/,                          adminOnly],
];

/** Mounted once on /api: signs the caller in and applies the table above to the routes it lists. */
export function policyGate(req, res, next) {
    const hit = POLICY.find(([m, re]) => m === req.method && re.test(req.path));
    if (!hit) return next();
    const groups = req.path.match(hit[1]).slice(1).map(x => (x === undefined ? x : decodeURIComponent(x)));
    authenticateToken(req, res, async () => {
        try {
            const denied = await hit[2](req, groups);
            if (denied) return res.status(403).json({ error: denied });
            next();
        } catch (e) {
            console.error('Policy error:', e);
            res.status(500).json({ error: 'Permission check failed' });
        }
    });
}
