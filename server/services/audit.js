
import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';

export async function logAudit({ tenantId, entityType, recordId, action, actorId, details }) {
    try {
        const id = uuidv4();
        await db.run(`
            INSERT INTO audit_logs (id, tenant_id, entity_type, record_id, action, actor_id, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, id, tenantId, entityType, recordId, action, actorId, JSON.stringify(details || {}));
    } catch (error) {
        console.error('Audit Logging Failed:', error);
        // We log error but don't throw to prevent blocking the main action
    }
}
