import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configurable cascading category trees (e.g. a Product matrix: Card → Elite/Premium).
 * One tree per (tenant, setKey). Stored as JSON: [{ name, children: [{ name }] }].
 * Metadata-driven: any entity field of type 'cascade' references a setKey.
 */

const DEFAULT_PRODUCT_TREE = [
    { name: 'Card', children: [{ name: 'Elite Card' }, { name: 'Premium Card' }, { name: 'Platinum Card' }] },
    { name: 'Loan', children: [{ name: 'Home Loan' }, { name: 'Personal Loan' }, { name: 'Auto Loan' }] },
    { name: 'Insurance', children: [{ name: 'Life' }, { name: 'Health' }, { name: 'Motor' }] },
    { name: 'Account', children: [{ name: 'Savings' }, { name: 'Current' }, { name: 'Salary' }] },
];

function normalizeTree(tree) {
    if (!Array.isArray(tree)) return [];
    return tree
        .filter(n => n && n.name)
        .map(n => ({
            name: String(n.name).trim(),
            children: Array.isArray(n.children)
                ? n.children.filter(c => c && c.name).map(c => ({ name: String(c.name).trim() }))
                : [],
        }));
}

export async function getTree(tenantId, setKey) {
    const row = await db.get('SELECT tree FROM category_trees WHERE tenant_id = ? AND set_key = ?', tenantId, setKey);
    if (!row) return [];
    try { return normalizeTree(JSON.parse(row.tree)); } catch { return []; }
}

export async function saveTree(tenantId, setKey, tree) {
    const norm = normalizeTree(tree);
    const existing = await db.get('SELECT id FROM category_trees WHERE tenant_id = ? AND set_key = ?', tenantId, setKey);
    if (existing) {
        await db.run('UPDATE category_trees SET tree = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', JSON.stringify(norm), existing.id);
    } else {
        await db.run('INSERT INTO category_trees (id, tenant_id, set_key, tree) VALUES (?, ?, ?, ?)', uuidv4(), tenantId, setKey, JSON.stringify(norm));
    }
    return norm;
}

/** Seed a default 'product' tree for a tenant if none exists. */
export async function ensureDefaultTree(tenantId, setKey = 'product') {
    const row = await db.get('SELECT id FROM category_trees WHERE tenant_id = ? AND set_key = ?', tenantId, setKey);
    if (!row) await saveTree(tenantId, setKey, DEFAULT_PRODUCT_TREE);
}
