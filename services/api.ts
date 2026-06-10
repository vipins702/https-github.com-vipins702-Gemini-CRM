
import { CRMRecord, EntityDefinition, LayoutDefinition, User, AuthSession, SystemSettings, Campaign, MenuItem, WidgetConfig, Activity, Role, Relationship, LeadRule, LeadRuleRunResult } from '../types';

const API_BASE = '/api';

const getAuthHeaders = () => {
  const sessionStr = localStorage.getItem('flowcrm_session');
  if (sessionStr) {
    const session = JSON.parse(sessionStr);
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.token}`
    };
  }
  return { 'Content-Type': 'application/json' };
};

const handleResponse = async (res: Response) => {
  if (res.status === 401) {
    localStorage.removeItem('flowcrm_session');
    window.location.href = '/login'; // Redirect to login
    throw new Error('Unauthorized');
  }
  if (res.status === 403) {
    throw new Error('Forbidden: Access is denied');
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    const errorMessage = error.error || `Request failed with status ${res.status}`;
    const errorDetails = error.details ? ` Details: ${error.details}` : '';
    throw new Error(errorMessage + errorDetails);
  }
  return res.json();
};

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  return handleResponse(res);
};


export const api = {
  // --- BOOTSTRAP ---
  async initialize() {
    console.log('Backend initialized');
  },

  // --- AUTH ---
  async login(email: string, password: string): Promise<AuthSession> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) throw new Error('Login failed');

    const data = await res.json();
    const session: AuthSession = { ...data, user: data.user };
    localStorage.setItem('flowcrm_session', JSON.stringify(session));
    return session;
  },

  async logout() {
    localStorage.removeItem('flowcrm_session');
  },

  async getSession(): Promise<AuthSession | null> {
    const s = localStorage.getItem('flowcrm_session');
    return s ? JSON.parse(s) : null;
  },

  // --- SETTINGS ---
  async getSettings(): Promise<SystemSettings> {
    return fetchWithAuth(`${API_BASE}/settings`);
  },
  async saveSettings(settings: SystemSettings) {
    return fetchWithAuth(`${API_BASE}/settings`, {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  // --- METADATA ---
  async getSchemas(): Promise<Record<string, EntityDefinition>> {
    return fetchWithAuth(`${API_BASE}/metadata/schemas`);
  },

  async saveSchema(entityType: string, schema: EntityDefinition) {
    await fetchWithAuth(`${API_BASE}/metadata/schemas`, {
      method: 'POST',
      body: JSON.stringify({ entityType, config: schema })
    });
  },

  async createEntity(label: string, pluralLabel: string, icon: string = 'box') {
    throw new Error("Create Entity via API not fully implemented yet");
  },

  async createRelation(sourceId: string, targetId: string, fieldName: string, label: string) {
    return fetchWithAuth(`${API_BASE}/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        name: `${sourceId}_${targetId}_${fieldName}`,
        sourceEntity: sourceId,
        targetEntity: targetId,
        sourceField: fieldName,
        targetField: 'id',
        displayField: 'name'
      })
    });
  },

  // --- RELATIONSHIPS ---
  async getRelationships(): Promise<Relationship[]> {
    return fetchWithAuth(`${API_BASE}/relationships`);
  },

  async createRelationship(config: {
    name: string;
    sourceEntity: string;
    targetEntity: string;
    sourceField: string;
    targetField: string;
    relationshipType?: string;
    cascadeDelete?: boolean;
    displayField?: string;
  }) {
    return fetchWithAuth(`${API_BASE}/relationships`, {
      method: 'POST',
      body: JSON.stringify(config)
    });
  },

  async deleteRelationship(id: string) {
    return fetchWithAuth(`${API_BASE}/relationships/${id}`, {
      method: 'DELETE'
    });
  },

  async getRelatedRecords(entityType: string, recordId: string, targetEntity: string): Promise<CRMRecord[]> {
    return fetchWithAuth(`${API_BASE}/data/${entityType}/${recordId}/related/${targetEntity}`);
  },

  // --- LAYOUTS ---
  async getLayout(entityType: string): Promise<LayoutDefinition> {
    return fetchWithAuth(`${API_BASE}/metadata/layouts/${entityType}`);
  },

  async getLayouts(): Promise<Record<string, LayoutDefinition>> {
    return {};
  },

  async saveLayout(entityType: string, layout: LayoutDefinition) {
    return fetchWithAuth(`${API_BASE}/metadata/layouts/${entityType}`, {
      method: 'POST',
      body: JSON.stringify(layout)
    });
  },

  // --- DATA / RECORDS ---
  async getRecords(entityType: string): Promise<CRMRecord[]> {
    return fetchWithAuth(`${API_BASE}/data/${entityType}`);
  },

  async getRecord(entityType: string, id: string): Promise<CRMRecord | undefined> {
    const records = await this.getRecords(entityType);
    return records.find(r => r.id === id);
  },

  async saveRecord(entityType: string, record: CRMRecord) {
    return fetchWithAuth(`${API_BASE}/data/${entityType}`, {
      method: 'POST',
      body: JSON.stringify(record)
    });
  },

  async deleteRecord(entityType: string, id: string) {
    return fetchWithAuth(`${API_BASE}/data/${entityType}/${id}`, {
      method: 'DELETE'
    });
  },

  async getActivities(recordId: string, entityType: string = 'customer'): Promise<Activity[]> {
    return fetchWithAuth(`${API_BASE}/audit/${entityType}/${recordId}`);
  },

  async getRecentActivity(): Promise<Activity[]> {
    return fetchWithAuth(`${API_BASE}/audit/recent`);
  },

  async createActivity(recordId: string, details: any, entityType: string = 'customer', action: string = 'note') {
    return fetchWithAuth(`${API_BASE}/audit`, {
      method: 'POST',
      body: JSON.stringify({ entityType, recordId, action, details })
    });
  },

  // --- WORKFLOWS ---
  async getWorkflow() {
    return fetchWithAuth(`${API_BASE}/workflows`);
  },
  async saveWorkflow(nodes: any[], edges: any[]) {
    return fetchWithAuth(`${API_BASE}/workflows`, {
      method: 'POST',
      body: JSON.stringify({ nodes, edges })
    });
  },

  // --- USER MANAGEMENT ---
  async getUsers(): Promise<User[]> {
    return fetchWithAuth(`${API_BASE}/users`);
  },
  async saveUser(user: Partial<User>) {
    return fetchWithAuth(`${API_BASE}/users`, {
      method: 'POST',
      body: JSON.stringify(user)
    });
  },
  async getRoles(): Promise<Role[]> {
    return fetchWithAuth(`${API_BASE}/roles`);
  },
  async saveRole(role: Role) {
    return fetchWithAuth(`${API_BASE}/roles`, {
      method: 'POST',
      body: JSON.stringify(role)
    });
  },
  async deleteRole(id: string) {
    return fetchWithAuth(`${API_BASE}/roles/${id}`, {
      method: 'DELETE'
    });
  },

  // --- WEB PRESENTER ---
  async getWebContent() {
    return fetchWithAuth(`${API_BASE}/web-content`);
  },
  async getWebContentItem(slug: string) {
    return fetchWithAuth(`${API_BASE}/web-content/${slug}`);
  },
  async saveWebContent(data: { slug: string; type: string; title: string; content: string; metadata?: any }) {
    return fetchWithAuth(`${API_BASE}/web-content`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  async executeSQLView(query: string) {
    return fetchWithAuth(`${API_BASE}/web-presenter/execute-sql`, {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  },

  // --- MENU ---
  async getMenu(): Promise<MenuItem[]> {
    return fetchWithAuth(`${API_BASE}/metadata/menu`);
  },
  async saveMenu(menu: MenuItem[]) {
    return fetchWithAuth(`${API_BASE}/metadata/menu`, {
      method: 'POST',
      body: JSON.stringify(menu)
    });
  },

  // --- CAMPAIGNS ---
  async getCampaigns(): Promise<Campaign[]> {
    const records = await this.getRecords('campaign');
    return records.map(r => {
      try {
        return {
          id: r.id,
          name: r.primary_display || '',
          ...JSON.parse(r.data)
        };
      } catch (e) {
        return {
          id: r.id,
          name: r.primary_display || '',
          subject: '',
          status: 'Draft',
          templateHtml: '',
          stats: { sent: 0, opened: 0, clicked: 0, submissions: 0 }
        } as Campaign;
      }
    });
  },
  async saveCampaign(campaign: Campaign) {
    const record = {
      id: campaign.id,
      tenant_id: 'default',
      entity_type: 'campaign',
      primary_display: campaign.name,
      status: campaign.status,
      data: JSON.stringify(campaign)
    };
    await this.saveRecord('campaign', record as any);
    return campaign;
  },
  async submitWebForm(campaignId: string, data: any) {
    // Form submission could create a Lead record linked to campaign
    const leadRecord = {
      id: `lead_${Date.now()}`,
      tenant_id: 'default',
      entity_type: 'lead',
      primary_display: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
      status: 'New',
      data: JSON.stringify({
        ...data,
        source: 'Web',
        score: 10,
        value: 0
      })
    };
    await this.saveRecord('lead', leadRecord as any);
  },

  // --- DASHBOARD ---
  async getDashboardConfig(): Promise<WidgetConfig[]> {
    return fetchWithAuth(`${API_BASE}/dashboard/widgets`);
  },
  async saveDashboardConfig(config: WidgetConfig[]) {
    return fetchWithAuth(`${API_BASE}/dashboard/widgets`, {
      method: 'POST',
      body: JSON.stringify(config)
    });
  },
  async getDashboardStats() {
    return fetchWithAuth(`${API_BASE}/dashboard/stats`);
  },
  async getDashboardChartData() {
    return fetchWithAuth(`${API_BASE}/dashboard/chart-data`);
  },

  // --- LOOKUPS ---
  async getLookups(): Promise<string[]> {
    return fetchWithAuth(`${API_BASE}/lookups`);
  },

  async getLookupValues(lookupId: string): Promise<{ id: string; lookup_id: string; value_id: string; value: string; sort_order: number }[]> {
    return fetchWithAuth(`${API_BASE}/lookups/${lookupId}`);
  },

  async saveLookupValue(lookupId: string, valueId: string, value: string, sortOrder: number = 0) {
    return fetchWithAuth(`${API_BASE}/lookups/${lookupId}`, {
      method: 'POST',
      body: JSON.stringify({ valueId, value, sortOrder })
    });
  },

  async importLookupValues(lookupId: string, values: { valueId?: string, value: string, sortOrder?: number }[]) {
    return fetchWithAuth(`${API_BASE}/lookups/${lookupId}/import`, {
      method: 'POST',
      body: JSON.stringify({ values })
    });
  },

  async deleteLookupValue(lookupId: string, valueId: string) {
    return fetchWithAuth(`${API_BASE}/lookups/${lookupId}/${valueId}`, {
      method: 'DELETE'
    });
  },

  // --- IMPORT SOURCES ---
  async getImportSources(): Promise<{ id: string; label: string; valueField: string; labelField: string; description: string }[]> {
    return fetchWithAuth(`${API_BASE}/lookups/import-sources`);
  },

  async importFromSource(lookupId: string, source: string): Promise<{ success: boolean; count: number; message?: string }> {
    return fetchWithAuth(`${API_BASE}/lookups/${lookupId}/import-from-source`, {
      method: 'POST',
      body: JSON.stringify({ source })
    });
  },

  async importFromSQL(lookupId: string, query: string, valueColumn?: string, labelColumn?: string): Promise<{ success: boolean; count: number; message?: string }> {
    return fetchWithAuth(`${API_BASE}/lookups/${lookupId}/import-from-sql`, {
      method: 'POST',
      body: JSON.stringify({ query, valueColumn, labelColumn })
    });
  },

  // --- LIVE LOOKUP SOURCES ---
  async getLiveSource(lookupId: string): Promise<{ source_type: string; source_entity?: string; value_field: string; label_field: string; sql_query?: string } | null> {
    return fetchWithAuth(`${API_BASE}/lookups/${lookupId}/live-source`);
  },

  async setLiveSource(lookupId: string, sourceType: string, sourceEntity?: string, valueField?: string, labelField?: string, sqlQuery?: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`${API_BASE}/lookups/${lookupId}/live-source`, {
      method: 'POST',
      body: JSON.stringify({ sourceType, sourceEntity, valueField, labelField, sqlQuery })
    });
  },

  async removeLiveSource(lookupId: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`${API_BASE}/lookups/${lookupId}/live-source`, {
      method: 'DELETE'
    });
  },

  // --- LEAD GENERATION RULES ---
  async getLeadRules(): Promise<LeadRule[]> {
    return fetchWithAuth(`${API_BASE}/lead-rules`);
  },
  async saveLeadRule(rule: Partial<LeadRule>): Promise<LeadRule> {
    return fetchWithAuth(`${API_BASE}/lead-rules`, {
      method: 'POST',
      body: JSON.stringify(rule)
    });
  },
  async deleteLeadRule(id: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`${API_BASE}/lead-rules/${id}`, {
      method: 'DELETE'
    });
  },
  async previewLeadRule(id: string): Promise<LeadRuleRunResult> {
    return fetchWithAuth(`${API_BASE}/lead-rules/${id}/preview`, {
      method: 'POST'
    });
  },
  async runLeadRule(id: string): Promise<LeadRuleRunResult> {
    return fetchWithAuth(`${API_BASE}/lead-rules/${id}/run`, {
      method: 'POST'
    });
  },
  async runAllLeadRules(): Promise<{ results: Array<LeadRuleRunResult & { ruleId: string; name: string }> }> {
    return fetchWithAuth(`${API_BASE}/lead-rules/run-all`, {
      method: 'POST'
    });
  },

  // --- GLOBAL SEARCH ---
  async globalSearch(q: string, limit: number = 10): Promise<Array<{ id: string; entityType: string; primaryDisplay: string; status?: string }>> {
    if (!q || !q.trim()) return [];
    return fetchWithAuth(`${API_BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  },

  // --- CTI / TELEPHONY + CONVERSION ---
  async ctiLookup(phone: string): Promise<{ match: string | null; entityType?: string; recordId?: string; name?: string; status?: string; data?: any }> {
    return fetchWithAuth(`${API_BASE}/cti/lookup?phone=${encodeURIComponent(phone)}`);
  },
  async getRecentCalls(): Promise<any[]> {
    return fetchWithAuth(`${API_BASE}/cti/calls`);
  },
  async logCall(payload: { from?: string; to?: string; entityType?: string; recordId?: string; name?: string; outcome?: string; notes?: string; direction?: string; status?: string }) {
    return fetchWithAuth(`${API_BASE}/cti/log-call`, { method: 'POST', body: JSON.stringify(payload) });
  },
  async convertLead(leadId: string): Promise<{ customerId?: string; customerName?: string; upsell?: { product: string; reason: string; source: string }; taskId?: string; alreadyConverted?: boolean }> {
    return fetchWithAuth(`${API_BASE}/leads/${leadId}/convert`, { method: 'POST' });
  },
  async simulateIncomingCall(phone: string): Promise<{ ok: boolean; matched: boolean; entityType?: string; recordId?: string; name?: string; isNew?: boolean; created?: any }> {
    const res = await fetch(`${API_BASE}/cti/incoming`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ From: phone, Direction: 'inbound', CallStatus: 'ringing' }),
    });
    return res.json();
  },
  async routeInbound(payload: { recordId?: string; entityType?: string; name?: string; text?: string; manualIntent?: 'support' | 'sales' }): Promise<{ created: 'case' | 'opportunity'; id: string; title: string; intent: { intent: string; product: string; reason: string; source: string } }> {
    return fetchWithAuth(`${API_BASE}/cti/route`, { method: 'POST', body: JSON.stringify(payload) });
  },

  // --- LEAD CAPTURE / INGESTION ---
  async ingestLead(source: string, payload: Record<string, any>, opts?: { dedupe?: boolean; ai?: boolean }): Promise<{ success: boolean; id?: string; deduped?: boolean; primaryDisplay?: string; aiUsed?: boolean }> {
    const params = new URLSearchParams();
    if (opts?.dedupe === false) params.set('dedupe', '0');
    if (opts?.ai) params.set('ai', '1');
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/ingest/${encodeURIComponent(source)}${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  // --- AI (Gemini) ---
  async getAIStatus(): Promise<{ enabled: boolean }> {
    return fetchWithAuth(`${API_BASE}/ai/status`);
  },
  async getCustomerInsight(context: Record<string, any>): Promise<{ enabled: boolean; insight: { title: string; description: string; action: string; source: string } | null }> {
    return fetchWithAuth(`${API_BASE}/ai/customer-insight`, {
      method: 'POST',
      body: JSON.stringify(context)
    });
  }
};
