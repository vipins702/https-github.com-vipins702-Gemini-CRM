// Agency pack: digital, creative, marketing and consulting agencies.
//
//   Client (the existing Customer) ── Contact
//        │                          └─ Opportunity ──(won)──▶ Project ── Deliverable
//        ├─ Retainer ◀── Time entry ──▶ Project                      └─ Invoice
//
// A pack is plain data. The installer (services/packs.js) only ADDS what is missing and never changes what a workspace
// already has. Journeys install switched OFF so they can be reviewed first. Customer keeps its name in the app: in an
// agency it is the client.

const f = (name, label, type, extra = {}) => ({ name, label, type, ...extra });
const text = (n, l, x) => f(n, l, 'text', x);
const sel = (n, l, options, x) => f(n, l, 'select', { options, ...x });
const join = (n, l, to, x) => f(n, l, 'lookup', { lookupTarget: to, ...x });

const R = (field, operator, value) => ({ type: 'rule', field, operator, value });
const G = (op, ...children) => ({ type: 'group', op, children });
const trigger = (entityType, triggerType, label, extra = {}) => ({ id: 't', type: 'trigger', data: { type: 'trigger', label, icon: 'zap', config: { entityType, triggerType, ...extra } } });
const action = (id, label, icon, config) => ({ id, type: 'action', data: { type: 'action', label, icon, config } });
const wait = (id, amount, unit) => ({ id, type: 'wait', data: { type: 'wait', label: `Wait ${amount} ${unit === 'days' && amount === 1 ? 'day' : unit}`, icon: 'clock', config: { amount, unit } } });
const chain = (...nodes) => ({
    nodes: nodes.map((n, i) => ({ ...n, position: { x: 260, y: 20 + i * 130 } })),
    edges: nodes.slice(1).map((n, i) => ({ id: `e${i}`, source: nodes[i].id, target: n.id })),
});
const P = (read, create, edit, del, scope = 'all') => ({ read, create, edit, delete: del, scope });

export default {
    id: 'agency',
    name: 'Agency',
    version: 1,
    description: 'For digital, creative, marketing and consulting agencies: clients and contacts, a proposal pipeline, projects with deliverables, monthly retainers with hours, time entries and invoices, with the follow-ups, reminders and alerts that go with them.',
    audience: 'Agencies, studios, consultancies',

    objects: [
        {
            id: 'contact', label: 'Contact', pluralLabel: 'Contacts', icon: 'Contact', keyField: 'email',
            fields: [
                text('firstName', 'First name', { required: true }), text('lastName', 'Last name', { required: true }),
                join('clientId', 'Client', 'customer'), text('role', 'Role / title'),
                f('decisionMaker', 'Decision maker', 'checkbox'),
                f('email', 'E-mail', 'email', { unique: true }), f('phone', 'Phone', 'phone'), f('linkedin', 'LinkedIn', 'url'),
                f('notes', 'Notes', 'textarea'),
            ],
        },
        {
            id: 'opportunity', label: 'Opportunity', pluralLabel: 'Opportunities', icon: 'Target',
            fields: [
                text('name', 'Opportunity', { required: true }), join('clientId', 'Client', 'customer'),
                f('services', 'Services', 'multiselect', { options: ['SEO', 'Paid ads', 'Social media', 'Branding', 'Web design', 'Content', 'PR', 'Consulting'] }),
                f('value', 'Value', 'currency'), f('probability', 'Probability', 'percent'),
                f('weightedValue', 'Weighted value', 'formula', { formula: '{value} * {probability} / 100' }),
                f('expectedClose', 'Expected close', 'date'),
                f('status', 'Stage', 'status', { required: true, options: ['Lead', 'Discovery', 'Proposal sent', 'Negotiation', 'Won', 'Lost'] }),
                sel('lostReason', 'Lost reason', ['Price', 'Timing', 'Went with a competitor', 'No budget', 'No response', 'Other']),
                f('accountLead', 'Account lead', 'user'),
                sel('source', 'Source', ['Referral', 'Website', 'Social media', 'Event', 'Outbound', 'Partner']),
                f('notes', 'Notes', 'textarea'),
            ],
        },
        {
            id: 'project', label: 'Project', pluralLabel: 'Projects', icon: 'FolderKanban',
            fields: [
                text('name', 'Project', { required: true }), f('ref', 'Project no.', 'autonumber', { prefix: 'PRJ-', padding: 4 }),
                join('clientId', 'Client', 'customer'), join('opportunityId', 'From opportunity', 'opportunity'),
                sel('type', 'Billing', ['Retainer', 'Fixed fee', 'Time & materials']),
                f('status', 'Status', 'status', { required: true, options: ['Planning', 'Active', 'On hold', 'Completed', 'Cancelled'] }),
                f('projectManager', 'Project manager', 'user'),
                f('startDate', 'Start', 'date'), f('endDate', 'End', 'date'),
                f('budget', 'Budget', 'currency'), f('hoursBudget', 'Hours budget', 'number'),
                f('hoursUsed', 'Hours used', 'rollup', { rollup: { entity: 'time_entry', field: 'projectId', fn: 'sum', target: 'hours' } }),
                f('cost', 'Cost so far', 'rollup', { rollup: { entity: 'time_entry', field: 'projectId', fn: 'sum', target: 'cost' } }),
                f('margin', 'Margin', 'formula', { formula: '{budget} - {cost}' }),
                f('deliverableCount', 'Deliverables', 'rollup', { rollup: { entity: 'deliverable', field: 'projectId', fn: 'count' } }),
                f('notes', 'Notes', 'textarea'),
            ],
        },
        {
            id: 'deliverable', label: 'Deliverable', pluralLabel: 'Deliverables', icon: 'ListChecks',
            fields: [
                text('name', 'Deliverable', { required: true }), join('projectId', 'Project', 'project'), f('owner', 'Owner', 'user'),
                f('dueDate', 'Due', 'date'),
                f('status', 'Status', 'status', { required: true, options: ['Planned', 'In progress', 'In review', 'Approved', 'Delivered'] }),
                f('clientApproved', 'Client approved', 'checkbox'), f('approvedOn', 'Approved on', 'date'), f('fileLink', 'File link', 'url'),
                f('notes', 'Notes', 'textarea'),
            ],
        },
        {
            id: 'retainer', label: 'Retainer', pluralLabel: 'Retainers', icon: 'Repeat',
            fields: [
                text('name', 'Retainer', { required: true }), f('ref', 'Retainer no.', 'autonumber', { prefix: 'RET-', padding: 4 }),
                join('clientId', 'Client', 'customer'),
                f('monthlyFee', 'Monthly fee', 'currency'), f('hoursIncluded', 'Hours included per month', 'number'),
                f('hoursUsed', 'Billable hours used', 'rollup', { rollup: { entity: 'time_entry', field: 'retainerId', fn: 'sum', target: 'hours', where: [{ field: 'billable', value: 'true' }] } }),
                f('usagePercent', 'Hours used (%)', 'formula', { formula: '{hoursUsed} / {hoursIncluded} * 100' }),
                f('renewalDate', 'Renewal date', 'date'), f('autoRenew', 'Auto-renews', 'checkbox'),
                f('overAlertSent', 'Over-hours alert sent', 'checkbox'),
                f('status', 'Status', 'status', { required: true, options: ['Active', 'Paused', 'Ended'] }),
                f('accountLead', 'Account lead', 'user'),
                f('notes', 'Notes', 'textarea'),
            ],
        },
        {
            id: 'time_entry', label: 'Time entry', pluralLabel: 'Time entries', icon: 'Clock',
            fields: [
                text('subject', 'What was done', { required: true }), f('person', 'Person', 'user'),
                join('projectId', 'Project', 'project'), join('retainerId', 'Retainer', 'retainer'),
                f('date', 'Date', 'date'), f('hours', 'Hours', 'number', { required: true }),
                f('billable', 'Billable', 'checkbox'), f('rate', 'Cost rate per hour', 'currency'),
                f('cost', 'Cost', 'formula', { formula: '{hours} * {rate}' }),
            ],
        },
        {
            id: 'invoice', label: 'Invoice', pluralLabel: 'Invoices', icon: 'Receipt',
            fields: [
                f('number', 'Invoice no.', 'autonumber', { prefix: 'INV-', padding: 4 }),
                text('name', 'Description', { required: true }), join('clientId', 'Client', 'customer', { required: true }), join('projectId', 'Project', 'project'),
                f('issueDate', 'Issued', 'date'), f('dueDate', 'Due', 'date'),
                f('amount', 'Amount', 'currency', { required: true }), f('gstPercent', 'GST', 'percent'),
                f('gstAmount', 'GST amount', 'formula', { formula: '{amount} * {gstPercent} / 100' }),
                f('total', 'Total', 'formula', { formula: '{amount} + {gstAmount}' }),
                f('status', 'Status', 'status', { required: true, options: ['Draft', 'Sent', 'Partially paid', 'Paid', 'Overdue'] }),
                f('notes', 'Notes', 'textarea'),
            ],
        },
    ],

    // Fields added to an object the workspace already has (Customer = the client).
    extend: [
        {
            id: 'customer', sectionTitle: 'Agency',
            fields: [
                f('accountLead', 'Account lead', 'user'), sel('health', 'Health', ['Green', 'Amber', 'Red']),
                f('contractStart', 'Contract start', 'date'), f('billingEmail', 'Billing e-mail', 'email'), text('gstin', 'GSTIN'),
                f('servicesBought', 'Services bought', 'multiselect', { options: ['SEO', 'Paid ads', 'Social media', 'Branding', 'Web design', 'Content', 'PR', 'Consulting'] }),
                f('contactCount', 'Contacts', 'rollup', { rollup: { entity: 'contact', field: 'clientId', fn: 'count' } }),
                f('openProjects', 'Active projects', 'rollup', { rollup: { entity: 'project', field: 'clientId', fn: 'count', where: [{ field: 'status', value: 'Active' }] } }),
                f('lifetimeValue', 'Paid to date', 'rollup', { rollup: { entity: 'invoice', field: 'clientId', fn: 'sum', target: 'total', where: [{ field: 'status', value: 'Paid' }] } }),
            ],
        },
    ],

    roles: [
        {
            name: 'Account Manager', description: 'Works their own clients: contacts, opportunities, projects, deliverables and retainers. Sees only records they created or own.',
            permissions: {
                customer: P(true, true, true, false, 'own'), contact: P(true, true, true, false, 'own'), opportunity: P(true, true, true, false, 'own'),
                project: P(true, false, true, false, 'own'), deliverable: P(true, true, true, false, 'own'), retainer: P(true, false, true, false, 'own'),
                invoice: P(true, false, false, false, 'own'), time_entry: P(true, false, false, false, 'own'),
                lead: P(true, true, true, false, 'own'), task: P(true, true, true, false, 'own'), case: P(true, false, false, false, 'own'),
            },
        },
        {
            name: 'Project Manager', description: 'Runs projects, deliverables and time entries for their team (people who report to them), and reads clients and contacts.',
            permissions: {
                customer: P(true, false, false, false), contact: P(true, false, false, false),
                project: P(true, true, true, false, 'team'), deliverable: P(true, true, true, true, 'team'), time_entry: P(true, true, true, true, 'team'),
                retainer: P(true, false, false, false, 'team'), task: P(true, true, true, false, 'team'),
            },
        },
        {
            name: 'Finance', description: 'Raises and tracks invoices; reads clients, projects, retainers and time entries across the agency.',
            permissions: {
                invoice: P(true, true, true, true), retainer: P(true, false, true, false), project: P(true, false, false, false),
                time_entry: P(true, false, false, false), customer: P(true, false, false, false), opportunity: P(true, false, false, false),
            },
        },
    ],

    // Before-save rules (Configuration → Field Triggers)
    triggers: [
        { entityType: 'opportunity', name: 'Won opportunities are 100% likely', conditions: G('and', R('status', '==', 'Won')), actions: [{ field: 'probability', value: '100' }] },
        { entityType: 'opportunity', name: 'Lost opportunities are 0% likely', conditions: G('and', R('status', '==', 'Lost')), actions: [{ field: 'probability', value: '0' }] },
        { entityType: 'project', name: 'Stamp the end date when a project completes', conditions: G('and', R('status', '==', 'Completed'), R('endDate', 'empty')), actions: [{ field: 'endDate', value: '{today}' }] },
        { entityType: 'deliverable', name: 'Record client approval', conditions: G('and', R('status', '==', 'Approved'), R('approvedOn', 'empty')), actions: [{ field: 'approvedOn', value: '{today}' }, { field: 'clientApproved', value: 'true' }] },
    ],

    // Journeys install switched OFF: review, then turn on.
    journeys: [
        {
            name: 'Opportunity won: start the project',
            ...chain(
                trigger('opportunity', 'status_change', 'Opportunity won', { to: 'Won' }),
                action('a1', 'Create the project', 'file-text', { type: 'create_record', entityType: 'project', fields: { name: '{name}', clientId: '{clientId}', opportunityId: '{id}', budget: '{value}', status: 'Planning', type: 'Fixed fee' } }),
                action('a2', 'Tell the owner', 'bell', { type: 'notify', title: 'Project created', message: 'A project was created for the won opportunity "{name}". Add the team and deliverables.' }),
            ),
        },
        {
            name: 'Proposal sent: follow up',
            ...chain(
                trigger('opportunity', 'status_change', 'Proposal sent', { to: 'Proposal sent', exitConditions: G('or', R('status', '==', 'Won'), R('status', '==', 'Lost')) }),
                wait('w1', 3, 'days'),
                action('a1', 'Task: follow up', 'user-plus', { type: 'create_task', subject: 'Follow up on the proposal: {name}', dueInDays: 1 }),
                wait('w2', 4, 'days'),
                action('a2', 'Tell the owner', 'bell', { type: 'notify', title: 'No reply yet', message: 'The proposal "{name}" has had no reply for a week.' }),
            ),
        },
        {
            name: 'Deliverable in review: chase approval',
            ...chain(
                trigger('deliverable', 'status_change', 'Sent for review', { to: 'In review', exitConditions: G('and', R('status', '!=', 'In review')) }),
                wait('w1', 2, 'days'),
                action('a1', 'Remind the owner', 'bell', { type: 'notify', title: 'Waiting for approval', message: '"{name}" has waited 2 days for client approval.' }),
                wait('w2', 3, 'days'),
                action('a2', 'Remind again', 'bell', { type: 'notify', title: 'Still waiting', message: '"{name}" has waited 5 days for client approval. Time for a call.' }),
            ),
        },
        {
            name: 'Time logged: refresh the retainer',
            ...chain(
                trigger('time_entry', 'create', 'Time entry added', { conditions: G('and', R('retainerId', 'is_not_empty')) }),
                action('a1', 'Update the retainer', 'link', { type: 'update_linked', via: 'retainerId', fields: {} }),
            ),
        },
        {
            name: 'Retainer: 90% of hours used',
            ...chain(
                trigger('retainer', 'update', 'Retainer updated', { conditions: G('and', R('usagePercent', '>=', '90'), R('overAlertSent', '!=', 'true')) }),
                action('a1', 'Alert the owner', 'bell', { type: 'notify', title: 'Retainer nearly used up', message: '"{name}" has used {usagePercent}% of its {hoursIncluded} hours this month. Talk to the client before going over.' }),
                action('a2', 'Mark alert sent', 'file-text', { type: 'update_record', fields: { overAlertSent: 'true' } }),
            ),
        },
        {
            name: 'Retainer renewal in 30 days',
            ...chain(
                trigger('retainer', 'date_arrives', '30 days before renewal', { field: 'renewalDate', offsetDays: -30, conditions: G('and', R('status', '==', 'Active')) }),
                action('a1', 'Notify the owner', 'bell', { type: 'notify', title: 'Renewal coming up', message: 'Retainer "{name}" renews on {renewalDate}. Plan the review.' }),
            ),
        },
        {
            name: 'Retainer renewal in 7 days',
            ...chain(
                trigger('retainer', 'date_arrives', '7 days before renewal', { field: 'renewalDate', offsetDays: -7, conditions: G('and', R('status', '==', 'Active')) }),
                action('a1', 'Task: renewal call', 'user-plus', { type: 'create_task', subject: 'Renewal call: {name}', dueInDays: 3 }),
                action('a2', 'Notify the owner', 'bell', { type: 'notify', title: 'Renewal in a week', message: 'Retainer "{name}" renews on {renewalDate}.' }),
            ),
        },
        {
            name: 'Invoice due in 3 days',
            ...chain(
                trigger('invoice', 'date_arrives', '3 days before due', { field: 'dueDate', offsetDays: -3, conditions: G('and', R('status', '!=', 'Paid'), R('status', '!=', 'Draft')) }),
                action('a1', 'Notify the owner', 'bell', { type: 'notify', title: 'Invoice due soon', message: 'Invoice {number} ({total}) is due on {dueDate}.' }),
            ),
        },
        {
            name: 'Invoice overdue',
            ...chain(
                trigger('invoice', 'date_arrives', 'Day after due date', { field: 'dueDate', offsetDays: 1, conditions: G('and', R('status', '!=', 'Paid'), R('status', '!=', 'Draft')) }),
                action('a1', 'Mark overdue', 'file-text', { type: 'update_record', fields: { status: 'Overdue' } }),
                action('a2', 'Notify the owner', 'bell', { type: 'notify', title: 'Invoice overdue', message: 'Invoice {number} ({total}) was due on {dueDate} and is not paid.' }),
            ),
        },
    ],
};
