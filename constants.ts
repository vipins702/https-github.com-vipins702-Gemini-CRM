

import { EntityDefinition, LayoutDefinition, CRMRecord, EntityType, Lead, WidgetConfig, Activity } from './types';

// --- SCHEMA DEFINITIONS ---
export const SCHEMAS: Record<EntityType, EntityDefinition> = {
  lead: {
    id: 'lead',
    label: 'Lead',
    pluralLabel: 'Leads',
    fields: [
      { name: 'firstName', label: 'First Name', type: 'text', required: true, system: true },
      { name: 'lastName', label: 'Last Name', type: 'text', required: true, system: true },
      { name: 'email', label: 'Email', type: 'email', system: true },
      { name: 'phone', label: 'Phone', type: 'phone' },
      { name: 'company', label: 'Company', type: 'text' },
      { name: 'title', label: 'Job Title', type: 'text' },
      { name: 'status', label: 'Status', type: 'status', options: ['New', 'Contacted', 'Qualified', 'Lost', 'Won'] },
      { name: 'score', label: 'Lead Score', type: 'number' },
      { name: 'source', label: 'Source', type: 'select', options: ['Web', 'Referral', 'Event', 'Ads'] },
      // New Fields
      { name: 'profileImage', label: 'Profile Photo', type: 'image' },
      { name: 'contractDoc', label: 'Contract PDF', type: 'attachment' },
      { name: 'linkedinProfile', label: 'LinkedIn Viewer', type: 'iframe', urlTemplate: 'https://www.linkedin.com/search/results/all/?keywords={firstName}%20{lastName}' },
      { name: 'relatedCustomer', label: 'Related Account', type: 'lookup', lookupTarget: 'customer' }
    ]
  },
  customer: {
    id: 'customer',
    label: 'Customer',
    pluralLabel: 'Customers',
    fields: [
      { name: 'name', label: 'Account Name', type: 'text', required: true, system: true },
      { name: 'industry', label: 'Industry', type: 'select', options: ['Tech', 'Finance', 'Retail', 'Health'] },
      { name: 'website', label: 'Website', type: 'text' },
      { name: 'annualRevenue', label: 'Annual Revenue', type: 'currency' },
      { name: 'status', label: 'Status', type: 'status', options: ['Active', 'Churned', 'Onboarding'] },
      { name: 'logo', label: 'Company Logo', type: 'image' },
      { name: 'accountManager', label: 'Account Manager', type: 'text' }
    ]
  },
  case: {
    id: 'case',
    label: 'Case',
    pluralLabel: 'Cases',
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true },
      { name: 'status', label: 'Status', type: 'status', options: ['New', 'In Progress', 'Escalated', 'Closed'] },
      { name: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'screenshots', label: 'Screenshots', type: 'attachment' }
    ]
  },
  task: {
    id: 'task',
    label: 'Task',
    pluralLabel: 'Tasks',
    fields: [
      { name: 'subject', label: 'Subject', type: 'text' },
      { name: 'dueDate', label: 'Due Date', type: 'date' },
      { name: 'status', label: 'Status', type: 'status', options: ['Todo', 'Done'] }
    ]
  },
  product: {
    id: 'product',
    label: 'Product',
    pluralLabel: 'Products',
    fields: [
        { name: 'name', label: 'Product Name', type: 'text'},
        { name: 'sku', label: 'SKU', type: 'text'},
        { name: 'price', label: 'Price', type: 'currency'},
        { name: 'image', label: 'Product Image', type: 'image' }
    ]
  }
};

// --- DEFAULT LAYOUTS ---
export const INITIAL_LAYOUTS: Record<EntityType, LayoutDefinition> = {
  lead: {
    entityType: 'lead',
    sections: [
      {
        id: 's1', title: 'Basic Information',
        columns: [
          { id: 'c1', width: 6, fields: ['firstName', 'lastName', 'title', 'company', 'email', 'phone'] },
          { id: 'c2', width: 6, fields: ['status', 'score', 'source', 'relatedCustomer'] }
        ]
      },
      {
        id: 's2', title: 'Documents & External',
        columns: [
          { id: 'c3', width: 12, fields: ['contractDoc', 'linkedinProfile'] }
        ]
      }
    ],
    fieldConfigs: {
      'score': { styles: { fontWeight: 'bold', textColor: 'text-indigo-600' } },
      'linkedinProfile': { styles: { backgroundColor: 'bg-gray-50' } },
      // Added Visibility Rule per request
      'company': {
         visibilityRule: { field: 'status', operator: '==', value: 'Qualified' }
      }
    }
  },
  customer: {
    entityType: 'customer',
    sections: [
      {
        id: 's1', title: 'Account Details',
        columns: [
          { id: 'c1', width: 6, fields: ['name', 'logo', 'website', 'industry'] },
          { id: 'c2', width: 6, fields: ['status', 'annualRevenue', 'accountManager'] }
        ]
      }
    ],
    fieldConfigs: {}
  },
  case: {
    entityType: 'case',
    sections: [
      {
        id: 's1', title: 'Ticket Info',
        columns: [{ id: 'c1', width: 12, fields: ['subject', 'priority', 'status', 'description', 'screenshots'] }]
      }
    ],
    fieldConfigs: {}
  },
  task: { entityType: 'task', sections: [], fieldConfigs: {} },
  product: { entityType: 'product', sections: [], fieldConfigs: {} }
};

// --- MOCK DATA ---
export const MOCK_LEADS: Lead[] = [
    { id: '1', firstName: 'Alice', lastName: 'Smith', title: 'CTO', email: 'alice@acme.com', company: 'Acme Corp', status: 'New', score: 45, source: 'Web', value: 12000, lastContacted: '2 days ago', relatedCustomer: '101' },
    { id: '2', firstName: 'Bob', lastName: 'Jones', title: 'VP Sales', email: 'bob@globex.com', company: 'Globex', status: 'Qualified', score: 85, source: 'Ads', value: 25000, lastContacted: '1 day ago', relatedCustomer: '102' },
    { id: '3', firstName: 'Charlie', lastName: 'Day', title: 'Manager', email: 'charlie@paddys.com', company: 'Paddys Pub', status: 'Won', score: 90, source: 'Referral', value: 5000, lastContacted: '1 week ago' },
    { id: '4', firstName: 'Dana', lastName: 'White', title: 'President', email: 'dana@ufc.com', company: 'UFC', status: 'Lost', score: 20, source: 'Event', value: 100000, lastContacted: '3 days ago' },
    { id: '5', firstName: 'Evan', lastName: 'Stone', title: 'Engineer', email: 'evan@tech.com', company: 'Tech Inc', status: 'New', score: 50, source: 'Web', value: 3000, lastContacted: 'Just now' },
];

export const MOCK_DB: Record<EntityType, CRMRecord[]> = {
  lead: MOCK_LEADS,
  customer: [
    { id: '101', name: 'Acme Corp', industry: 'Tech', website: 'acme.com', status: 'Active', annualRevenue: 1000000, logo: 'https://ui-avatars.com/api/?name=Acme+Corp&background=random' },
    { id: '102', name: 'Globex Inc', industry: 'Retail', website: 'globex.com', status: 'Onboarding', annualRevenue: 500000, logo: 'https://ui-avatars.com/api/?name=Globex&background=random' },
  ],
  case: [
    { id: '201', subject: 'Login issue', status: 'New', priority: 'High', description: 'User cannot login to portal' },
    { id: '202', subject: 'Billing question', status: 'In Progress', priority: 'Medium', description: 'Clarification on invoice #992' },
  ],
  task: [],
  product: []
};

// --- ACTIVITIES ---
export const MOCK_ACTIVITIES: Activity[] = [
  { id: 'a1', type: 'note', content: 'Met with the client to discuss Q3 goals. They are interested in the premium plan.', timestamp: '2 hours ago', author: 'John Admin' },
  { id: 'a2', type: 'email', content: 'Sent proposal v2.pdf', timestamp: '1 day ago', author: 'System' },
  { id: 'a3', type: 'status_change', content: 'Changed status from New to Qualified', timestamp: '2 days ago', author: 'Sarah Sales' },
  { id: 'a4', type: 'call', content: 'Call with Alice regarding technical requirements.', timestamp: '3 days ago', author: 'John Admin' },
];

// --- WORKFLOW INITIAL DATA ---
export const INITIAL_FLOW_NODES = [
  {
    id: '1',
    type: 'input',
    data: { label: 'On Lead Create', type: 'trigger', icon: 'zap' },
    position: { x: 250, y: 0 },
    className: 'bg-slate-900 border-slate-900 text-white border-2 rounded-xl p-3 shadow-lg w-48 text-center font-semibold',
  },
  {
    id: '2',
    data: { label: 'Score > 50?', type: 'condition', icon: 'git-branch' },
    position: { x: 250, y: 120 },
    className: 'bg-white border-indigo-200 border-2 rounded-xl p-3 shadow-sm w-48 text-center text-sm font-medium',
  },
  {
    id: '3',
    data: { label: 'Assign: Sales', type: 'action', icon: 'user-plus' },
    position: { x: 100, y: 250 },
    className: 'bg-white border-indigo-200 border-2 rounded-xl p-3 shadow-sm w-48 text-center text-sm font-medium',
  },
  {
    id: '4',
    data: { label: 'Send Welcome Email', type: 'action', icon: 'mail' },
    position: { x: 400, y: 250 },
    className: 'bg-white border-indigo-200 border-2 rounded-xl p-3 shadow-sm w-48 text-center text-sm font-medium',
  },
  {
    id: '5',
    data: { label: 'Wait 2 Days', type: 'wait', icon: 'clock' },
    position: { x: 400, y: 350 },
    className: 'bg-gray-50 border-gray-200 border-2 rounded-xl p-3 shadow-sm w-48 text-center text-sm font-medium text-gray-500',
  }
];

export const INITIAL_FLOW_EDGES = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3', label: 'Yes' },
  { id: 'e2-4', source: '2', target: '4', label: 'No' },
  { id: 'e4-5', source: '4', target: '5' },
];

// --- DEFAULT WIDGETS ---
export const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: 'w1', title: 'Total Revenue', type: 'stat', visible: true, order: 1, width: 'third' },
    { id: 'w2', title: 'Active Leads', type: 'stat', visible: true, order: 2, width: 'third' },
    { id: 'w3', title: 'Conversion Rate', type: 'stat', visible: true, order: 3, width: 'third' },
    { id: 'w4', title: 'Revenue Trend', type: 'chart', visible: true, order: 4, width: 'half' },
    { id: 'w5', title: 'Recent Leads', type: 'list', visible: true, order: 5, width: 'half' },
];
