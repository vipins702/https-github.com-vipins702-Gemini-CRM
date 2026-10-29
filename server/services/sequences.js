import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from './audit.js';

/**
 * Email Drip Sequences Service
 * Allows enrolling leads into multi-step email/task sequences.
 * Each step fires N days after the previous one.
 *
 * Step shape: { id, delay_days, type: 'email'|'task', subject, body, task_subject, task_priority }
 */

/** List all sequences for a tenant */
export async function listSequences(tenantId) {
    const rows = await db.all('SELECT * FROM sequences WHERE tenant_id = ? ORDER BY created_at DESC', tenantId);
    return rows.map(r => ({
        ...r,
        steps: parseJSON(r.steps, []),
    }));
}

/** Get a single sequence */
export async function getSequence(tenantId, sequenceId) {
    const row = await db.get('SELECT * FROM sequences WHERE id = ? AND tenant_id = ?', sequenceId, tenantId);
    if (!row) return null;
    return { ...row, steps: parseJSON(row.steps, []) };
}

/** Create or update a sequence */
export async function saveSequence(tenantId, { id, name, entity_type = 'lead', steps = [] }) {
    const seqId = id || uuidv4();
    await db.run(
        `INSERT INTO sequences (id, tenant_id, name, entity_type, steps)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, entity_type=excluded.entity_type, steps=excluded.steps`,
        seqId, tenantId, name, entity_type, JSON.stringify(steps)
    );
    return getSequence(tenantId, seqId);
}

/** Delete a sequence and its enrollments */
export async function deleteSequence(tenantId, sequenceId) {
    await db.run('DELETE FROM sequence_enrollments WHERE tenant_id = ? AND sequence_id = ?', tenantId, sequenceId);
    await db.run('DELETE FROM sequences WHERE id = ? AND tenant_id = ?', sequenceId, tenantId);
    return { success: true };
}

/** Enroll a lead/record into a sequence */
export async function enrollRecord(tenantId, sequenceId, recordId, actorId = 'system') {
    // Check not already active
    const existing = await db.get(
        `SELECT id FROM sequence_enrollments WHERE tenant_id = ? AND sequence_id = ? AND record_id = ? AND status = 'active'`,
        tenantId, sequenceId, recordId
    );
    if (existing) return { alreadyEnrolled: true, enrollmentId: existing.id };

    const seq = await getSequence(tenantId, sequenceId);
    if (!seq || seq.steps.length === 0) throw new Error('Sequence has no steps');

    const enrollId = uuidv4();
    // First step fires immediately (or delay_days=0) or in N days
    const firstDelay = Number(seq.steps[0]?.delay_days) || 0;
    const nextStepAt = addDays(new Date(), firstDelay).toISOString();

    await db.run(
        `INSERT INTO sequence_enrollments (id, tenant_id, sequence_id, record_id, step_index, next_step_at, status)
         VALUES (?, ?, ?, ?, 0, ?, 'active')`,
        enrollId, tenantId, sequenceId, recordId, nextStepAt
    );

    await logAudit({ tenantId, entityType: 'lead', recordId, action: 'update', actorId,
        details: { _via: 'sequence_enroll', sequenceId, sequenceName: seq.name } });

    console.log(`[sequences] Enrolled record ${recordId} in sequence "${seq.name}"`);
    return { success: true, enrollmentId: enrollId };
}

/** List active enrollments for a record */
export async function getEnrollments(tenantId, recordId) {
    const rows = await db.all(
        `SELECT e.*, s.name as sequence_name, s.steps FROM sequence_enrollments e
         LEFT JOIN sequences s ON s.id = e.sequence_id
         WHERE e.tenant_id = ? AND e.record_id = ? ORDER BY e.created_at DESC`,
        tenantId, recordId
    );
    return rows.map(r => ({ ...r, steps: parseJSON(r.steps, []) }));
}

/** Unenroll a record from a sequence */
export async function unenrollRecord(tenantId, enrollmentId) {
    await db.run(
        `UPDATE sequence_enrollments SET status = 'cancelled' WHERE id = ? AND tenant_id = ?`,
        enrollmentId, tenantId
    );
    return { success: true };
}

/**
 * Process all due sequence steps (called by scheduler every 5 minutes).
 * For each due enrollment, execute the current step then advance to the next.
 */
export async function processDueSequenceSteps() {
    try {
        // next_step_at is stored as an ISO string (toISOString), so compare against one.
        const due = await db.all(
            `SELECT e.*, s.steps, s.name as seq_name FROM sequence_enrollments e
             JOIN sequences s ON s.id = e.sequence_id
             WHERE e.status = 'active' AND e.next_step_at <= ?`,
            new Date().toISOString()
        );

        for (const enrollment of due) {
            const steps = parseJSON(enrollment.steps, []);
            const stepIndex = enrollment.step_index;

            if (stepIndex >= steps.length) {
                // Sequence complete
                await db.run(`UPDATE sequence_enrollments SET status = 'completed' WHERE id = ?`, enrollment.id);
                console.log(`[sequences] Enrollment ${enrollment.id} completed`);
                continue;
            }

            const step = steps[stepIndex];

            // Execute step
            try {
                await executeStep(enrollment.tenant_id, enrollment.record_id, step, enrollment.seq_name);
            } catch (e) {
                console.error(`[sequences] Step execution failed for enrollment ${enrollment.id}:`, e.message);
            }

            const nextIndex = stepIndex + 1;
            if (nextIndex >= steps.length) {
                // No more steps — mark completed
                await db.run(`UPDATE sequence_enrollments SET status = 'completed', step_index = ? WHERE id = ?`, nextIndex, enrollment.id);
            } else {
                const nextStep = steps[nextIndex];
                const nextAt = addDays(new Date(), Number(nextStep.delay_days) || 1).toISOString();
                await db.run(
                    `UPDATE sequence_enrollments SET step_index = ?, next_step_at = ? WHERE id = ?`,
                    nextIndex, nextAt, enrollment.id
                );
            }
        }

        if (due.length > 0) {
            console.log(`[sequences] Processed ${due.length} due step(s)`);
        }
    } catch (err) {
        console.error('[sequences] Scheduler error:', err.message);
    }
}

/** Execute a single step for a record */
async function executeStep(tenantId, recordId, step, seqName) {
    const recordRow = await db.get('SELECT data, primary_display FROM records WHERE id = ? AND tenant_id = ?', recordId, tenantId);
    if (!recordRow) return;

    let data = {};
    try { data = JSON.parse(recordRow.data); } catch {}

    const name = recordRow.primary_display || data.firstName || 'there';
    const email = data.email || '';

    if (step.type === 'email' && email) {
        // Log email message (simulated unless email service configured)
        const emailId = uuidv4();
        const subject = interpolate(step.subject || `Follow-up from ${seqName}`, data);
        const body = interpolate(step.body || 'Hi {firstName}, just checking in.', data);

        await db.run(
            `INSERT INTO email_messages (id, tenant_id, direction, contact_email, from_address, to_address, subject, body, matched_entity, matched_id, status)
             VALUES (?, ?, 'outbound', ?, 'crm@flowcrm.com', ?, ?, ?, 'lead', ?, 'simulated')`,
            emailId, tenantId, email, email, subject, body, recordId
        );
        console.log(`[sequences] Sent email step to ${email}: "${subject}"`);
    } else if (step.type === 'task') {
        const taskId = uuidv4();
        const subject = interpolate(step.task_subject || `Follow up with ${name}`, data);
        const taskData = {
            subject,
            status: 'New',
            priority: step.task_priority || 'Medium',
            relatedEntity: 'lead',
            relatedId: recordId,
            _via: 'sequence_step',
            _sequence: seqName,
        };
        await db.run(
            `INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, 'task', ?, 'New', ?)`,
            taskId, tenantId, subject, JSON.stringify(taskData)
        );
        console.log(`[sequences] Created task "${subject}" for record ${recordId}`);
    }
}

/** Start the sequence step processor (every 5 minutes) */
export function startSequenceScheduler() {
    const INTERVAL_MS = 5 * 60 * 1000;
    setInterval(() => { processDueSequenceSteps(); }, INTERVAL_MS);
    console.log('[sequences] Drip sequence scheduler started (checks every 5min)');
}

// Helpers
function parseJSON(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function interpolate(template, data) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, k) => data[k] ?? '');
}
