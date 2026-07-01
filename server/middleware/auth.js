import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import db from '../database.js';

export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = user;
        req.tenantId = user.tenantId;

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
