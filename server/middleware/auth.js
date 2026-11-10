import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import db from '../database.js';

export const authenticateToken = async (req, res, next) => {
    if (req._authDone) return next(); // already signed in by the policy gate
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = user;
        req.tenantId = user.tenantId;

        // A token must stop working the moment the person is deactivated or loses
        // their role, not 24 hours later. Superadmins are checked the same way.
        const live = await db.get('SELECT is_active, role, token_version FROM users WHERE id = ? AND tenant_id = ?', user.id, user.tenantId);
        if (!live || !live.is_active) {
            return res.status(403).json({ error: 'Account is inactive' });
        }
        // Logging out, changing the password or an admin reset raises users.token_version; older tokens stop working.
        // (Tokens issued before this existed carry no "tv" and stay valid until they expire.)
        if (user.tv !== undefined && (live.token_version || 0) !== user.tv) {
            return res.status(401).json({ error: 'Session ended. Sign in again.' });
        }
        req.user.role = live.role;

        // Fetch Role Permissions
        if (req.user.isSuperadmin) {
            req.user.permissions = { admin: true };
            req.user.roleName = 'Superadmin';
        } else if (req.user.role === 'admin') {
            req.user.permissions = { admin: true };
            req.user.roleName = 'Admin';
        } else {
            // user.role is likely a UUID pointing to roles table
            const role = await db.get('SELECT * FROM roles WHERE id = ? AND tenant_id = ?', user.role, user.tenantId);
            if (role) {
                req.user.roleName = role.name;
                try {
                    req.user.permissions = JSON.parse(role.permissions);
                } catch (e) {
                    req.user.permissions = {};
                }
            } else {
                req.user.permissions = {};
                req.user.roleName = 'Unknown';
            }
        }
        // Admins can preview the app as any role: that role's permissions, scope and field rules
        // apply to everything they read, and nothing can be changed while previewing.
        const viewAs = req.headers['x-view-as-role'];
        if (viewAs && (req.user.role === 'admin' || req.user.isSuperadmin)) {
            const target = await db.get('SELECT id, name, permissions FROM roles WHERE id = ? AND tenant_id = ?', String(viewAs), user.tenantId);
            if (target) {
                if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
                    return res.status(409).json({ error: `Preview only: you are viewing as "${target.name}". Exit the preview to make changes.` });
                }
                try { req.user.permissions = JSON.parse(target.permissions); } catch { req.user.permissions = {}; }
                req.user.role = target.id;
                req.user.isSuperadmin = false;
                req.user.roleName = target.name;
                req.user.viewAs = target.name;
            }
        }
        req._authDone = true;
        next();
    } catch (err) {
        console.error('Auth Error:', err.message);
        if (err.name === 'TokenExpiredError') {
            return res.status(403).json({ error: 'Token expired' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
};

export const requireRole = (role) => {
    return (req, res, next) => {
        // user.role is ID. If we want to check name, use roleName.
        // But for backward compatibility if ID is passed:
        if (req.user && (req.user.role === role || req.user.roleName === role || req.user.role === 'admin')) {
            next();
        } else {
            res.status(403).json({ error: 'Insufficient permissions' });
        }
    };
};

export const requireSuperadmin = (req, res, next) => {
    if (req.user?.isSuperadmin) return next();
    res.status(403).json({ error: 'Superadmin access required' });
};

export const requirePermission = (resource, action) => {
    return (req, res, next) => {
        if (req.user.role === 'admin' || req.user.permissions?.admin) return next();

        const perms = req.user.permissions?.[resource];
        if (perms && (perms[action] || perms['manage'])) {
            next();
        } else {
            console.warn(`Access denied for ${req.user.email}: missing ${resource}.${action}`);
            res.status(403).json({ error: `Insufficient permissions for ${resource}` });
        }
    };
};
