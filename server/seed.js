
import db, { initDB } from './database.js';
import { v4 as uuidv4 } from 'uuid';

initDB();

const TENANT_ID = 'default';

// 1. Initial Menu
const INITIAL_MENU = [
    { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', type: 'item', view: 'dashboard', allowedRoles: ['*'] },
    { id: 'campaigns', label: 'Campaigns', icon: 'Megaphone', type: 'item', view: 'campaigns', allowedRoles: ['*'] },
    {
        id: 'crm_modules',
        label: 'CRM Modules',
        type: 'group',
        allowedRoles: ['*'],
        children: [
            { id: 'lead', label: 'Leads', icon: 'FolderOpen', type: 'item', view: 'lead', allowedRoles: ['*'] },
            { id: 'customer', label: 'Customers', icon: 'FolderOpen', type: 'item', view: 'customer', allowedRoles: ['*'] },
            { id: 'case', label: 'Cases', icon: 'FolderOpen', type: 'item', view: 'case', allowedRoles: ['*'] },
            { id: 'task', label: 'Tasks', icon: 'FolderOpen', type: 'item', view: 'task', allowedRoles: ['*'] },
            { id: 'product', label: 'Products', icon: 'FolderOpen', type: 'item', view: 'product', allowedRoles: ['*'] }
        ]
    },
    {
        id: 'tools',
        label: 'Configuration',
        type: 'group',
        allowedRoles: ['admin'],
        children: [
            { id: 'object-manager', label: 'Object Manager', icon: 'Database', type: 'item', view: 'object-manager', allowedRoles: ['admin'] },
            { id: 'menu-manager', label: 'Menu Builder', icon: 'Menu', type: 'item', view: 'menu-manager', allowedRoles: ['admin'] },
            { id: 'lookups', label: 'Lookup Manager', icon: 'List', type: 'item', view: 'lookups', allowedRoles: ['admin'] },
            { id: 'autoflow', label: 'Journeys', icon: 'Workflow', type: 'item', view: 'autoflow', allowedRoles: ['admin'] },
            { id: 'lead-rules', label: 'Lead Rules', icon: 'Zap', type: 'item', view: 'lead-rules', allowedRoles: ['admin'] },
            { id: 'lead-capture', label: 'Lead Capture', icon: 'Inbox', type: 'item', view: 'lead-capture', allowedRoles: ['admin'] },
            { id: 'agent-console', label: 'Agent Console', icon: 'PhoneCall', type: 'item', view: 'agent-console', allowedRoles: ['admin'] },
            { id: 'layout', label: 'Form Designer', icon: 'PaintBucket', type: 'item', view: 'layout', allowedRoles: ['admin'] },
            { id: 'web-presenter', label: 'Web Presenter', icon: 'Globe', type: 'item', view: 'web-presenter', allowedRoles: ['admin'] },
            { id: 'users', label: 'Users & Roles', icon: 'Users', type: 'item', view: 'users', allowedRoles: ['admin'] },
        ]
    }
];

// 2. Initial Schemas (Comprehensive Fields)
const SCHEMAS = {
    lead: {
        id: 'lead', label: 'Lead', pluralLabel: 'Leads',
        fields: [
            { name: 'firstName', label: 'First Name', type: 'text', required: true, system: true },
            { name: 'lastName', label: 'Last Name', type: 'text', required: true, system: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'phone', label: 'Phone', type: 'phone' },
            { name: 'company', label: 'Company', type: 'text' },
            { name: 'title', label: 'Job Title', type: 'text' },
            { name: 'customerId', label: 'Related Customer', type: 'lookup', lookupTarget: 'customer' },
            { name: 'status', label: 'Status', type: 'status', required: true, options: ['New', 'Contacted', 'Qualified', 'Lost', 'Won'] },
            { name: 'score', label: 'Lead Score', type: 'number' },
            { name: 'source', label: 'Source', type: 'select', options: ['Web', 'Referral', 'Event', 'Ads', 'Cold Call'] },
            { name: 'website', label: 'Website', type: 'url' },
            { name: 'address', label: 'Address', type: 'textarea' },
            { name: 'notes', label: 'Notes', type: 'textarea' }
        ]
    },
    customer: {
        id: 'customer', label: 'Customer', pluralLabel: 'Customers',
        fields: [
            { name: 'name', label: 'Account Name', type: 'text', required: true, system: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'phone', label: 'Phone', type: 'phone' },
            { name: 'industry', label: 'Industry', type: 'select', options: ['Tech', 'Finance', 'Retail', 'Health', 'Manufacturing', 'Services'] },
            { name: 'status', label: 'Status', type: 'status', required: true, options: ['Active', 'Churned', 'Onboarding', 'Suspended'] },
            { name: 'website', label: 'Website', type: 'url' },
            { name: 'address', label: 'Billing Address', type: 'textarea' },
            { name: 'annualRevenue', label: 'Annual Revenue', type: 'currency' },
            { name: 'employeeCount', label: 'Employee Count', type: 'number' },
            { name: 'type', label: 'Account Type', type: 'select', options: ['Prospect', 'Customer', 'Partner', 'Vendor'] },
            { name: 'rating', label: 'Rating', type: 'select', options: ['Hot', 'Warm', 'Cold'] },
            { name: 'notes', label: 'Notes', type: 'textarea' }
        ]
    },
    case: {
        id: 'case', label: 'Case', pluralLabel: 'Cases',
        fields: [
            { name: 'subject', label: 'Subject', type: 'text', required: true, system: true },
            { name: 'customerId', label: 'Related Customer', type: 'lookup', lookupTarget: 'customer' },
            { name: 'description', label: 'Description', type: 'textarea', required: true },
            { name: 'status', label: 'Status', type: 'status', required: true, options: ['New', 'In Progress', 'Escalated', 'Resolved', 'Closed'] },
            { name: 'priority', label: 'Priority', type: 'select', required: true, options: ['Low', 'Medium', 'High', 'Critical'] },
            { name: 'category', label: 'Category', type: 'select', options: ['Billing', 'Technical', 'Sales', 'General', 'Feature Request'] },
            { name: 'contactEmail', label: 'Contact Email', type: 'email' },
            { name: 'contactPhone', label: 'Contact Phone', type: 'phone' },
            { name: 'dueDate', label: 'Due Date', type: 'date' },
            { name: 'resolution', label: 'Resolution Notes', type: 'textarea' }
        ]
    },
    task: {
        id: 'task', label: 'Task', pluralLabel: 'Tasks',
        fields: [
            { name: 'subject', label: 'Subject', type: 'text', required: true, system: true },
            { name: 'customerId', label: 'Related Customer', type: 'lookup', lookupTarget: 'customer' },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'status', label: 'Status', type: 'status', required: true, options: ['Not Started', 'In Progress', 'Completed', 'Deferred'] },
            { name: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
            { name: 'dueDate', label: 'Due Date', type: 'date' },
            { name: 'startDate', label: 'Start Date', type: 'date' },
            { name: 'assignee', label: 'Assigned To', type: 'text' },
            { name: 'category', label: 'Category', type: 'select', options: ['Call', 'Email', 'Meeting', 'Follow-up', 'Research', 'Other'] },
            { name: 'reminderDate', label: 'Reminder Date', type: 'date' }
        ]
    },
    product: {
        id: 'product', label: 'Product', pluralLabel: 'Products',
        fields: [
            { name: 'name', label: 'Product Name', type: 'text', required: true, system: true },
            { name: 'sku', label: 'SKU', type: 'text', required: true },
            { name: 'customerId', label: 'Related Customer', type: 'lookup', lookupTarget: 'customer' },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'price', label: 'Price', type: 'currency', required: true },
            { name: 'costPrice', label: 'Cost Price', type: 'currency' },
            { name: 'category', label: 'Category', type: 'select', options: ['Electronics', 'Software', 'Services', 'Hardware', 'Accessories'] },
            { name: 'status', label: 'Status', type: 'status', required: true, options: ['Active', 'Inactive', 'Discontinued'] },
            { name: 'stockQuantity', label: 'Stock Quantity', type: 'number' },
            { name: 'reorderLevel', label: 'Reorder Level', type: 'number' },
            { name: 'unit', label: 'Unit', type: 'select', options: ['Each', 'Box', 'Pack', 'License'] }
        ]
    }
};

// 3. Initial Layouts (Organized Sections)
const LAYOUTS = {
    lead: {
        entityType: 'lead',
        sections: [
            {
                id: 's1', title: 'Contact Information',
                columns: [
                    { id: 'c1', width: 6, fields: ['firstName', 'lastName', 'email', 'phone'] },
                    { id: 'c2', width: 6, fields: ['company', 'title', 'website'] }
                ]
            },
            {
                id: 's2', title: 'Lead Details',
                columns: [
                    { id: 'c1', width: 6, fields: ['customerId', 'status', 'source', 'score'] },
                    { id: 'c2', width: 6, fields: ['address'] }
                ]
            },
            {
                id: 's3', title: 'Additional Information',
                columns: [
                    { id: 'c1', width: 12, fields: ['notes'] }
                ]
            }
        ],
        fieldConfigs: {}
    },
    customer: {
        entityType: 'customer',
        sections: [
            {
                id: 's1', title: 'Account Information',
                columns: [
                    { id: 'c1', width: 6, fields: ['name', 'email', 'phone', 'website'] },
                    { id: 'c2', width: 6, fields: ['status', 'type', 'rating', 'industry'] }
                ]
            },
            {
                id: 's2', title: 'Business Details',
                columns: [
                    { id: 'c1', width: 6, fields: ['annualRevenue', 'employeeCount'] },
                    { id: 'c2', width: 6, fields: ['address'] }
                ]
            },
            {
                id: 's3', title: 'Notes',
                columns: [
                    { id: 'c1', width: 12, fields: ['notes'] }
                ]
            }
        ],
        fieldConfigs: {}
    },
    case: {
        entityType: 'case',
        sections: [
            {
                id: 's1', title: 'Case Information',
                columns: [
                    { id: 'c1', width: 8, fields: ['subject'] },
                    { id: 'c2', width: 4, fields: ['customerId'] }
                ]
            },
            {
                id: 's2', title: 'Details',
                columns: [
                    { id: 'c1', width: 6, fields: ['status', 'priority', 'category', 'dueDate'] },
                    { id: 'c2', width: 6, fields: ['contactEmail', 'contactPhone'] }
                ]
            },
            {
                id: 's3', title: 'Description & Resolution',
                columns: [
                    { id: 'c1', width: 6, fields: ['description'] },
                    { id: 'c2', width: 6, fields: ['resolution'] }
                ]
            }
        ],
        fieldConfigs: {}
    },
    task: {
        entityType: 'task',
        sections: [
            {
                id: 's1', title: 'Task Information',
                columns: [
                    { id: 'c1', width: 8, fields: ['subject'] },
                    { id: 'c2', width: 4, fields: ['customerId'] }
                ]
            },
            {
                id: 's2', title: 'Details',
                columns: [
                    { id: 'c1', width: 6, fields: ['status', 'priority', 'category', 'assignee'] },
                    { id: 'c2', width: 6, fields: ['startDate', 'dueDate', 'reminderDate'] }
                ]
            },
            {
                id: 's3', title: 'Description',
                columns: [
                    { id: 'c1', width: 12, fields: ['description'] }
                ]
            }
        ],
        fieldConfigs: {}
    },
    product: {
        entityType: 'product',
        sections: [
            {
                id: 's1', title: 'Product Information',
                columns: [
                    { id: 'c1', width: 6, fields: ['name', 'sku', 'status'] },
                    { id: 'c2', width: 6, fields: ['category', 'unit'] }
                ]
            },
            {
                id: 's2', title: 'Pricing & Inventory',
                columns: [
                    { id: 'c1', width: 6, fields: ['price', 'costPrice'] },
                    { id: 'c2', width: 6, fields: ['stockQuantity', 'reorderLevel'] }
                ]
            },
            {
                id: 's3', title: 'Description',
                columns: [
                    { id: 'c1', width: 12, fields: ['description'] }
                ]
            }
        ],
        fieldConfigs: {}
    }
};

console.log("Seeding Database...");

// Seed Menu
const menuCount = db.prepare('SELECT COUNT(*) as count FROM menus WHERE tenant_id = ?').get(TENANT_ID).count;
if (menuCount === 0) {
    db.prepare('INSERT INTO menus (id, tenant_id, config) VALUES (?, ?, ?)').run(uuidv4(), TENANT_ID, JSON.stringify(INITIAL_MENU));
    console.log("Seeded Menu");
}

// Seed Schemas
for (const [key, value] of Object.entries(SCHEMAS)) {
    db.prepare(`
       INSERT OR REPLACE INTO entity_definitions (id, tenant_id, entity_type, config) 
       VALUES (?, ?, ?, ?)
    `).run(uuidv4(), TENANT_ID, key, JSON.stringify(value));
}
console.log("Seeded Schemas");

// Seed Layouts
for (const [key, value] of Object.entries(LAYOUTS)) {
    db.prepare(`
       INSERT OR REPLACE INTO layouts (id, tenant_id, entity_type, config) 
       VALUES (?, ?, ?, ?)
    `).run(uuidv4(), TENANT_ID, key, JSON.stringify(value));
}
console.log("Seeded Layouts");

// Seed Records (Mock Leads)
// Seed Records (Mock Data with Relationships)
const recordCount = db.prepare("SELECT COUNT(*) as count FROM records WHERE tenant_id = ?").get(TENANT_ID).count;
if (recordCount === 0) {
    console.log("Seeding Records...");

    // 1. Create a Customer
    const customerId = 'c1234567-89ab-cdef-0123-456789abcdef';
    const customer = {
        id: customerId,
        name: 'Acme Corp',
        email: 'contact@acme.com',
        phone: '555-0100',
        rating: 'Hot',
        status: 'Active',
        industry: 'Tech',
        annualRevenue: 1000000,
        employeeCount: 50
    };
    db.prepare(`INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)`).run(customerId, TENANT_ID, 'customer', customer.name, customer.status, JSON.stringify(customer));

    // 2. Create Related Lead
    const leadId = uuidv4();
    const lead = {
        id: leadId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@acme.com',
        company: 'Acme Corp',
        title: 'CTO',
        customerId: customerId, // LINKED
        status: 'New',
        score: 85
    };
    db.prepare(`INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)`).run(leadId, TENANT_ID, 'lead', `${lead.firstName} ${lead.lastName}`, lead.status, JSON.stringify(lead));

    // 3. Create Related Case
    const caseId = uuidv4();
    const caseRec = {
        id: caseId,
        subject: 'Product Installation Issue',
        customerId: customerId, // LINKED
        description: 'Customer is having trouble installing v2.0',
        status: 'In Progress',
        priority: 'High',
        category: 'Technical'
    };
    db.prepare(`INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)`).run(caseId, TENANT_ID, 'case', caseRec.subject, caseRec.status, JSON.stringify(caseRec));

    // 4. Create Related Task
    const taskId = uuidv4();
    const task = {
        id: taskId,
        subject: 'Follow up on Case #123',
        customerId: customerId, // LINKED
        status: 'Not Started',
        priority: 'Medium',
        dueDate: new Date().toISOString().split('T')[0]
    };
    db.prepare(`INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)`).run(taskId, TENANT_ID, 'task', task.subject, task.status, JSON.stringify(task));

    // 5. Create Related Product
    const productId = uuidv4();
    const product = {
        id: productId,
        name: 'Enterprise License',
        sku: 'ENT-2024',
        customerId: customerId, // LINKED
        price: 5000,
        status: 'Active',
        category: 'Software'
    };
    db.prepare(`INSERT INTO records (id, tenant_id, entity_type, primary_display, status, data) VALUES (?, ?, ?, ?, ?, ?)`).run(productId, TENANT_ID, 'product', product.name, product.status, JSON.stringify(product));

    console.log("Seeded Related Records");
}

console.log("Seeding Complete!");
