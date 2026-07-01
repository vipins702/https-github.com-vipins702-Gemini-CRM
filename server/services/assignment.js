import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Assignment Engine
 * Handles lead distribution (round-robin, etc) and notifications.
 */
export async function assignLead(tenantId, leadId, leadData) {
    // 1. Fetch available users for this tenant
    const users = await db.all(
        'SELECT id, email, first_name FROM users WHERE tenant_id = ? AND is_active = 1',
        tenantId
    );
    if (users.length === 0) return null;

    // TODO: Implement complex rules (territory, workload, explicit round-robin state).
    // For now, simple random/round-robin (pick first or random).
    const assignedUser = users[Math.floor(Math.random() * users.length)];

    // 2. Update lead with owner_id
    leadData.owner_id = assignedUser.id;
    leadData._assigned_to = assignedUser.id; // legacy compat

    await db.run(
        'UPDATE records SET owner_id = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
        assignedUser.id, JSON.stringify(leadData), leadId, tenantId
    );

    // 3. Create Notification
    const notifId = uuidv4();
    const title = 'New Lead Assigned';
    const body = `You have been assigned a new lead: ${leadData.firstName || leadData.name || 'Unknown'}`;
    
    await db.run(
        `INSERT INTO notifications (id, tenant_id, user_id, title, body, kind, record_id, entity_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        notifId, tenantId, assignedUser.id, title, body, 'alert', leadId, 'lead'
    );

    console.log(`[assignment] Assigned lead ${leadId} to user ${assignedUser.id}`);
    return assignedUser.id;
}
