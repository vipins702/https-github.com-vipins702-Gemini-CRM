

import { 
  SCHEMAS, 
  INITIAL_LAYOUTS, 
  MOCK_DB, 
  INITIAL_FLOW_NODES, 
  INITIAL_FLOW_EDGES,
  DEFAULT_WIDGETS,
  MOCK_ACTIVITIES
} from '../constants';
import { 
  EntityDefinition, 
  LayoutDefinition, 
  CRMRecord, 
  EntityType, 
  FlowNode, 
  FlowEdge,
  User,
  Role,
  AuthSession,
  WidgetConfig,
  Activity,
  FieldDefinition,
  Campaign,
  MenuItem,
  SystemSettings
} from '../types';

const STORAGE_KEYS = {
  SCHEMAS: 'flowcrm_schemas',
  LAYOUTS: 'flowcrm_layouts',
  DB: 'flowcrm_db',
  FLOW_NODES: 'flowcrm_flow_nodes',
  FLOW_EDGES: 'flowcrm_flow_edges',
  USERS: 'flowcrm_users',
  ROLES: 'flowcrm_roles',
  SESSION: 'flowcrm_session',
  DASHBOARD: 'flowcrm_dashboard',
  CAMPAIGNS: 'flowcrm_campaigns',
  MENU: 'flowcrm_menu',
  SETTINGS: 'flowcrm_settings'
};

// Seed Data for RBAC
const INITIAL_ROLES: Role[] = [
  {
    id: 'admin',
    name: 'System Administrator',
    description: 'Full access to all modules and system settings.',
    permissions: {
      lead: { read: true, create: true, edit: true, delete: true, scope: 'all' },
      customer: { read: true, create: true, edit: true, delete: true, scope: 'all' },
      case: { read: true, create: true, edit: true, delete: true, scope: 'all' },
      task: { read: true, create: true, edit: true, delete: true, scope: 'all' },
      product: { read: true, create: true, edit: true, delete: true, scope: 'all' }
    }
  },
  {
    id: 'sales_rep',
    name: 'Sales Representative',
    description: 'Can manage own leads and view all customers.',
    permissions: {
      lead: { read: true, create: true, edit: true, delete: false, scope: 'own' },
      customer: { read: true, create: false, edit: false, delete: false, scope: 'all' },
      case: { read: true, create: true, edit: true, delete: false, scope: 'own' },
      task: { read: true, create: true, edit: true, delete: true, scope: 'own' },
      product: { read: true, create: false, edit: false, delete: false, scope: 'all' }
    }
  },
  {
    id: 'support_agent',
    name: 'Support Agent',
    description: 'Focus on Cases and Customers.',
    permissions: {
      lead: { read: false, create: false, edit: false, delete: false, scope: 'all' },
      customer: { read: true, create: false, edit: true, delete: false, scope: 'all' },
      case: { read: true, create: true, edit: true, delete: false, scope: 'team' },
      task: { read: true, create: true, edit: true, delete: false, scope: 'own' },
      product: { read: true, create: false, edit: false, delete: false, scope: 'all' }
    }
  }
];

const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'John Admin', email: 'admin@flowcrm.com', roleId: 'admin', isActive: true, avatar: 'https://ui-avatars.com/api/?name=John+Admin&background=random' },
  { id: 'u2', name: 'Sarah Sales', email: 'sarah@flowcrm.com', roleId: 'sales_rep', isActive: true, avatar: 'https://ui-avatars.com/api/?name=Sarah+Sales&background=random' },
  { id: 'u3', name: 'Mike Support', email: 'mike@flowcrm.com', roleId: 'support_agent', isActive: false, avatar: 'https://ui-avatars.com/api/?name=Mike+Support&background=random' },
];

const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: 'c1',
    name: 'Summer Sale 2024',
    subject: 'Exclusive Early Access to Summer Styles',
    status: 'Active',
    targetProduct: 'p1',
    templateHtml: '<p>Welcome to our sale!</p>',
    stats: { sent: 1200, opened: 450, clicked: 120, submissions: 15 }
  }
];

const INITIAL_MENU: MenuItem[] = [
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
      { id: 'autoflow', label: 'Journeys', icon: 'Workflow', type: 'item', view: 'autoflow', allowedRoles: ['admin'] },
      { id: 'layout', label: 'Form Designer', icon: 'PaintBucket', type: 'item', view: 'layout', allowedRoles: ['admin'] },
      { id: 'web-presenter', label: 'Web Presenter', icon: 'Globe', type: 'item', view: 'web-presenter', allowedRoles: ['admin'] },
      { id: 'users', label: 'Users & Roles', icon: 'Users', type: 'item', view: 'users', allowedRoles: ['admin'] },
    ]
  }
];

const DEFAULT_SETTINGS: SystemSettings = {
  theme: 'light',
  primaryColor: 'indigo',
  density: 'comfortable',
  fontFamily: 'sans',
  organizationName: 'FlowCRM Inc.'
};

// Simulation of network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  // --- BOOTSTRAP ---
  async initialize() {
    // Check if data exists, if not, seed it from constants
    if (!localStorage.getItem(STORAGE_KEYS.SCHEMAS)) {
      localStorage.setItem(STORAGE_KEYS.SCHEMAS, JSON.stringify(SCHEMAS));
      localStorage.setItem(STORAGE_KEYS.LAYOUTS, JSON.stringify(INITIAL_LAYOUTS));
      localStorage.setItem(STORAGE_KEYS.DB, JSON.stringify(MOCK_DB));
      localStorage.setItem(STORAGE_KEYS.FLOW_NODES, JSON.stringify(INITIAL_FLOW_NODES));
      localStorage.setItem(STORAGE_KEYS.FLOW_EDGES, JSON.stringify(INITIAL_FLOW_EDGES));
      localStorage.setItem(STORAGE_KEYS.DASHBOARD, JSON.stringify(DEFAULT_WIDGETS));
      
      // RBAC Seeds
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
      localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(INITIAL_ROLES));
      localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(INITIAL_CAMPAIGNS));
      localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(INITIAL_MENU));
      
      console.log('System initialized with seed data.');
    }
    await delay(300); // Simulate startup time
  },

  // --- AUTH ---
  async login(email: string): Promise<AuthSession> {
    await delay(500);
    const users = await this.getUsers();
    const user = users.find(u => u.email === email);
    if (!user) throw new Error('User not found');
    
    const session: AuthSession = {
      user,
      token: 'fake-jwt-token-123'
    };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
    return session;
  },

  async logout() {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
  },

  async getSession(): Promise<AuthSession | null> {
    const s = localStorage.getItem(STORAGE_KEYS.SESSION);
    return s ? JSON.parse(s) : null;
  },

  // --- SETTINGS ---
  async getSettings(): Promise<SystemSettings> {
    await delay(100);
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || JSON.stringify(DEFAULT_SETTINGS));
  },

  async saveSettings(settings: SystemSettings) {
    await delay(200);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  // --- METADATA ---
  async getSchemas(): Promise<Record<string, EntityDefinition>> {
    await delay(100);
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEMAS) || '{}');
  },

  async saveSchema(entityType: string, schema: EntityDefinition) {
    const schemas = await this.getSchemas();
    schemas[entityType] = schema;
    localStorage.setItem(STORAGE_KEYS.SCHEMAS, JSON.stringify(schemas));
  },

  async createEntity(label: string, pluralLabel: string, icon: string = 'box') {
     await delay(400);
     const schemas = await this.getSchemas();
     const layouts = await this.getLayouts();
     const roles = await this.getRoles();
     const menu = await this.getMenu();
     
     // 1. Create Schema
     const id = label.toLowerCase().replace(/\s+/g, '_');
     if (schemas[id]) throw new Error('Object with this name already exists.');

     const newSchema: EntityDefinition = {
        id: id as EntityType,
        label,
        pluralLabel,
        fields: [
           { name: 'name', label: `${label} Name`, type: 'text', required: true, system: true },
           { name: 'created_at', label: 'Created At', type: 'date', system: true },
           { name: 'owner', label: 'Owner', type: 'text', system: true },
        ]
     };
     schemas[id] = newSchema;

     // 2. Create Default Layout
     const newLayout: LayoutDefinition = {
        entityType: id as EntityType,
        sections: [
           {
              id: 's1',
              title: 'General Information',
              columns: [{ id: 'c1', width: 12, fields: ['name', 'owner'] }]
           }
        ],
        fieldConfigs: {}
     };
     layouts[id] = newLayout;

     // 3. Update Admin Role Permissions
     const adminRoleIdx = roles.findIndex(r => r.id === 'admin');
     if (adminRoleIdx >= 0) {
        roles[adminRoleIdx].permissions[id] = {
           read: true, create: true, edit: true, delete: true, scope: 'all'
        };
     }
     
     // 4. Update Menu: Add to "CRM Modules" group if exists
     const crmGroup = menu.find(m => m.id === 'crm_modules');
     if (crmGroup && crmGroup.children) {
        crmGroup.children.push({
           id: id,
           label: pluralLabel,
           type: 'item',
           view: id as EntityType,
           icon: 'FolderOpen',
           allowedRoles: ['*']
        });
        localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(menu));
     }

     // Save all
     localStorage.setItem(STORAGE_KEYS.SCHEMAS, JSON.stringify(schemas));
     localStorage.setItem(STORAGE_KEYS.LAYOUTS, JSON.stringify(layouts));
     localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));

     return newSchema;
  },

  async createRelation(sourceId: string, targetId: string, fieldName: string, label: string) {
     await delay(300);
     const schemas = await this.getSchemas();
     
     if (!schemas[sourceId] || !schemas[targetId]) throw new Error('Invalid entities');

     const newField: FieldDefinition = {
        name: fieldName,
        label: label,
        type: 'lookup',
        lookupTarget: targetId as EntityType,
        required: false
     };

     schemas[sourceId].fields.push(newField);
     localStorage.setItem(STORAGE_KEYS.SCHEMAS, JSON.stringify(schemas));
  },

  async getLayout(entityType: string): Promise<LayoutDefinition> {
    await delay(100);
    const layouts = JSON.parse(localStorage.getItem(STORAGE_KEYS.LAYOUTS) || '{}');
    return layouts[entityType];
  },
  
  async getLayouts(): Promise<Record<string, LayoutDefinition>> {
     return JSON.parse(localStorage.getItem(STORAGE_KEYS.LAYOUTS) || '{}');
  },

  async saveLayout(entityType: string, layout: LayoutDefinition) {
    await delay(200);
    const layouts = JSON.parse(localStorage.getItem(STORAGE_KEYS.LAYOUTS) || '{}');
    layouts[entityType] = layout;
    localStorage.setItem(STORAGE_KEYS.LAYOUTS, JSON.stringify(layouts));
  },

  // --- DATA / RECORDS ---
  async getRecords(entityType: string): Promise<CRMRecord[]> {
    await delay(200);
    const db = JSON.parse(localStorage.getItem(STORAGE_KEYS.DB) || '{}');
    return db[entityType] || [];
  },

  async getRecord(entityType: string, id: string): Promise<CRMRecord | undefined> {
    const records = await this.getRecords(entityType);
    return records.find(r => r.id === id);
  },

  async saveRecord(entityType: string, record: CRMRecord) {
    await delay(300);
    const db = JSON.parse(localStorage.getItem(STORAGE_KEYS.DB) || '{}');
    const records: CRMRecord[] = db[entityType] || [];
    
    const existingIdx = records.findIndex(r => r.id === record.id);
    if (existingIdx >= 0) {
      records[existingIdx] = record;
    } else {
      // New record
      if (!record.id) record.id = `rec_${Date.now()}`;
      records.unshift(record);
    }
    
    db[entityType] = records;
    localStorage.setItem(STORAGE_KEYS.DB, JSON.stringify(db));
    return record;
  },

  async deleteRecord(entityType: string, id: string) {
    await delay(200);
    const db = JSON.parse(localStorage.getItem(STORAGE_KEYS.DB) || '{}');
    const records: CRMRecord[] = db[entityType] || [];
    db[entityType] = records.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.DB, JSON.stringify(db));
  },

  async getActivities(entityId: string): Promise<Activity[]> {
    await delay(150);
    return MOCK_ACTIVITIES;
  },

  // --- WORKFLOWS ---
  async getWorkflow() {
    await delay(100);
    const nodes = JSON.parse(localStorage.getItem(STORAGE_KEYS.FLOW_NODES) || '[]');
    const edges = JSON.parse(localStorage.getItem(STORAGE_KEYS.FLOW_EDGES) || '[]');
    return { nodes, edges };
  },

  async saveWorkflow(nodes: FlowNode[], edges: FlowEdge[]) {
    await delay(300);
    localStorage.setItem(STORAGE_KEYS.FLOW_NODES, JSON.stringify(nodes));
    localStorage.setItem(STORAGE_KEYS.FLOW_EDGES, JSON.stringify(edges));
  },

  // --- USER MANAGEMENT ---
  async getUsers(): Promise<User[]> {
    await delay(100);
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  },

  async saveUser(user: User) {
    await delay(200);
    const users: User[] = await this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user;
    else users.push({ ...user, id: user.id || `u_${Date.now()}` });
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  },

  async getRoles(): Promise<Role[]> {
    await delay(100);
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ROLES) || '[]');
  },

  async saveRole(role: Role) {
    await delay(200);
    const roles: Role[] = await this.getRoles();
    const idx = roles.findIndex(r => r.id === role.id);
    if (idx >= 0) roles[idx] = role;
    else roles.push({ ...role, id: role.id || `r_${Date.now()}` });
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
  },

  // --- MENU MANAGEMENT ---
  async getMenu(): Promise<MenuItem[]> {
    await delay(100);
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.MENU) || JSON.stringify(INITIAL_MENU));
  },

  async saveMenu(menu: MenuItem[]) {
    await delay(200);
    localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(menu));
  },

  // --- DASHBOARD ---
  async getDashboardConfig(): Promise<WidgetConfig[]> {
     await delay(100);
     return JSON.parse(localStorage.getItem(STORAGE_KEYS.DASHBOARD) || JSON.stringify(DEFAULT_WIDGETS));
  },

  async saveDashboardConfig(config: WidgetConfig[]) {
     await delay(200);
     localStorage.setItem(STORAGE_KEYS.DASHBOARD, JSON.stringify(config));
  },

  // --- CAMPAIGNS ---
  async getCampaigns(): Promise<Campaign[]> {
    await delay(100);
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CAMPAIGNS) || '[]');
  },

  async saveCampaign(campaign: Campaign) {
    await delay(300);
    const campaigns: Campaign[] = await this.getCampaigns();
    const idx = campaigns.findIndex(c => c.id === campaign.id);
    if (idx >= 0) campaigns[idx] = campaign;
    else campaigns.push({ ...campaign, id: campaign.id || `cmp_${Date.now()}` });
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
    return campaign;
  },

  // --- PUBLIC WEB FORM SUBMISSION ---
  async submitWebForm(campaignId: string, data: any) {
     // 1. Simulate API Latency
     await delay(800);

     // 2. Validate Data against Lead Schema
     const schemas = await this.getSchemas();
     const leadSchema = schemas['lead'];
     if (!leadSchema) throw new Error('System configuration error: Lead schema missing');

     // Simple required check
     const missingFields = leadSchema.fields
        .filter(f => f.required && !data[f.name])
        .map(f => f.label);
     
     if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
     }

     // 3. Create Lead Record
     const newLead: CRMRecord = {
        id: `web_${Date.now()}`,
        status: 'New',
        source: 'Web Form',
        ...data
     };

     await this.saveRecord('lead', newLead);

     // 4. Update Campaign Stats
     const campaigns = await this.getCampaigns();
     const campaignIdx = campaigns.findIndex(c => c.id === campaignId);
     if (campaignIdx >= 0) {
        campaigns[campaignIdx].stats.submissions += 1;
        localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
     }

     return { success: true, id: newLead.id };
  }
};
