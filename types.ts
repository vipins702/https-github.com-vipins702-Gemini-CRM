

import { Edge, Node } from 'reactflow';

export type EntityType = 'lead' | 'customer' | 'case' | 'task' | 'product' | string;

export type FieldType = 'text' | 'number' | 'currency' | 'email' | 'phone' | 'select' | 'status' | 'textarea' | 'lookup' | 'attachment' | 'image' | 'iframe' | 'date' | 'cascade';

export interface CategoryNode {
  name: string;
  children?: { name: string }[];
}

export enum LeadStatus {
  NEW = 'New',
  CONTACTED = 'Contacted',
  QUALIFIED = 'Qualified',
  LOST = 'Lost',
  WON = 'Won',
  NEGOTIATION = 'Negotiation'
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  options?: string[]; // for select/status
  required?: boolean;
  system?: boolean; // cannot be deleted
  // New config props
  lookupTarget?: EntityType;
  urlTemplate?: string;
  categorySet?: string; // for type 'cascade' — which category tree to use
}

export interface EntityDefinition {
  id: EntityType;
  label: string;
  pluralLabel: string;
  fields: FieldDefinition[];
}

export interface CRMRecord {
  id: string;
  [key: string]: any;
}

export interface Lead extends CRMRecord {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  company: string;
  status: string;
  score: number;
  source: string;
  value: number;
  lastContacted: string;
  relatedCustomer?: string;
}

export interface Activity {
  id: string;
  type: 'note' | 'email' | 'call' | 'status_change' | 'meeting';
  content: string;
  timestamp: string;
  author: string;
}

export interface WidgetConfig {
  id: string;
  title: string;
  type: 'stat' | 'chart' | 'list' | 'report' | 'pack';
  visible: boolean;
  order: number;
  width?: 'full' | 'half' | 'third';
  /** legacy single-report tiles */
  reportId?: string;
  reportParams?: Record<string, string>;
  vizOverride?: 'bar' | 'line' | 'pie' | 'number' | 'table';
  /** pack-backed tiles */
  packId?: string;
  datasetId?: string;
  kpiColumn?: string;           // for kpi dataset: which column to feature; omit = show all columns
  packParams?: Record<string, string>;
}

// ─── Report Pack types ────────────────────────────────────────────────────────

export interface KpiColumnMeta {
  key: string;
  label: string;
  type: 'currency' | 'number' | 'percent' | 'text';
  accent?: 'green' | 'blue' | 'orange';
}

export interface PackDatasetMeta {
  id: string;
  label: string;
  type: 'kpi' | 'timeseries' | 'aggregate' | 'table';
  viz?: string;
  accent?: string;
  columns?: KpiColumnMeta[];
  measures?: Array<{ key: string; label: string; type: string; color?: string }>;
}

export interface PackDefinition {
  id: string;
  name: string;
  description: string;
  params: ReportParam[];
  datasets: PackDatasetMeta[];
}

export interface KpiDataset {
  type: 'kpi';
  columns: KpiColumnMeta[];
  row: Record<string, number | string | null>;
  _cached?: boolean;
  _cacheAge?: number;
}

export interface TimeseriesDataset {
  type: 'timeseries';
  measures: Array<{ key: string; label: string; type: string; color: string }>;
  rows: Record<string, any>[];
  _cached?: boolean;
}

export interface AggregateDataset {
  type: 'aggregate';
  viz: string;
  accent: string;
  columns: Array<{ key: string; label: string; type: string }>;
  rows: Record<string, any>[];
  _cached?: boolean;
}

export interface TableDataset {
  type: 'table';
  columns: ReportColumn[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  _cached?: boolean;
}

export type PackDataset = KpiDataset | TimeseriesDataset | AggregateDataset | TableDataset;

export interface PackResult {
  packId: string;
  params: Record<string, any>;
  generatedAt: string;
  datasets: Record<string, PackDataset>;
  meta: { cacheHits: number; cacheMisses: number; totalMs: number };
}

// --- Layout Engine & Rules ---

export interface VisibilityRule {
  field: string;
  operator: '==' | '!=' | '>' | '<' | 'contains';
  value: string | number | boolean;
}

export interface ComponentStyle {
  backgroundColor?: string; // tailwind class like 'bg-red-50'
  textColor?: string;     // tailwind text color
  borderColor?: string;
  borderWidth?: string;
  fontWeight?: 'normal' | 'bold' | 'semibold';
  fontStyle?: 'normal' | 'italic';
  fontSize?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface ValidationRule {
  required?: boolean;
  requiredMessage?: string;
  pattern?: string;          // regex source, e.g. "^[^@]+@[^@]+\\.[^@]+$"
  patternMessage?: string;   // shown when pattern fails
  minLength?: number;
  maxLength?: number;
  min?: number;              // numeric fields
  max?: number;              // numeric fields
}

export interface LayoutFieldConfig {
  visibilityRule?: VisibilityRule;
  styles?: ComponentStyle;
  labelOverride?: string;
  hidden?: boolean;
  validation?: ValidationRule;
  // Instance specific overrides
  lookupTarget?: EntityType;
  urlTemplate?: string;
}

export interface LayoutSection {
  id: string;
  title: string;
  columns: LayoutColumn[];
  styles?: ComponentStyle;
  className?: string; // Custom CSS Class
}

export interface LayoutColumn {
  id: string;
  fields: string[]; // Field names
  width: number; // 1-12 grid system
  className?: string; // Custom CSS Class
  styles?: ComponentStyle;
}

export interface LayoutDefinition {
  entityType: EntityType;
  sections: LayoutSection[];
  fieldConfigs: Record<string, LayoutFieldConfig>; // Keyed by field name
}

// Workflow
export interface FlowNodeData {
  label: string;
  type?: 'trigger' | 'action' | 'condition' | 'end' | 'wait';
  icon?: string;
  config?: Record<string, any>;
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export type ViewState = 'dashboard' | 'autoflow' | 'layout' | 'settings' | 'web-presenter' | 'users' | 'object-manager' | 'campaigns' | 'menu-manager' | 'lookups' | 'customer-360' | 'lead-rules' | 'lead-capture' | 'agent-console' | 'reports' | 'whatsapp' | 'email-inbox' | 'calendar' | 'quotes' | 'pipeline' | 'processes' | 'lead-360' | 'categories' | 'integrations' | 'platform' | EntityType;

// --- Integrations (per-tenant credentials) ---
export interface IntegrationConfig {
  provider: 'whatsapp' | 'facebook' | 'instagram' | 'email';
  enabled: boolean;
  config: Record<string, any>;        // secrets arrive masked (e.g. "••••1234")
  secretSet: Record<string, boolean>; // which secret fields currently have a stored value
}

// --- WhatsApp Business ---
export interface WaConversation {
  phone: string;
  last_at: string;
  last_body: string;
  last_direction: 'inbound' | 'outbound';
  profile_name: string;
  matched_entity?: 'lead' | 'customer';
  matched_id?: string;
  message_count: number;
}

export interface WaMessage {
  id: string;
  tenant_id: string;
  wa_message_id?: string;
  direction: 'inbound' | 'outbound';
  phone: string;
  profile_name?: string;
  body: string;
  msg_type: string;
  matched_entity?: string;
  matched_id?: string;
  status: 'received' | 'sent' | 'simulated' | 'failed';
  created_at: string;
}

// --- Configurable processes / stages ---
export interface ProcessStageAction {
  type: 'create_task' | 'email' | 'webhook';
  [key: string]: any;
}
export interface ProcessStage {
  id: string;
  name: string;
  order: number;
  color: string;
  type: 'open' | 'won' | 'lost';
  requiredFields: string[];
  entryActions: ProcessStageAction[];
  requireNote?: boolean;
}
export interface ProcessDefinition {
  entityType: string;
  name: string;
  stages: ProcessStage[];
  source?: 'custom' | 'default' | 'none';
}

// --- Campaigns (bulk outreach) ---
export interface CampaignFilter { field: string; op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt'; value: string }

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'number' | 'textarea' | 'select' | 'checkbox';
  placeholder?: string;
  required?: boolean;
  options?: string[]; // for select/radio
  mapTo?: string; // entity field name (e.g., 'firstName', 'email')
  hidden?: boolean;
}

export interface WebFormTemplate {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  theme?: {
    backgroundColor?: string;
    buttonColor?: string;
    buttonText?: string;
  };
  successMessage?: string;
  redirectUrl?: string;
}

export interface BulkCampaign {
  id: string;
  name: string;
  channel: 'email' | 'whatsapp' | 'web_form';
  entityType: string;
  filters: CampaignFilter[];
  subject?: string;
  body?: string;
  formTemplate?: WebFormTemplate;
  status: 'Draft' | 'Sending' | 'Sent';
  audienceCount: number;
  sentCount: number;
  failedCount: number;
  openedCount: number;
  submissionCount?: number;
  created_at?: string;
  sent_at?: string;
}

// --- Attachments ---
export interface Attachment {
  id: string;
  entityType: string;
  recordId: string;
  filename: string;
  mime: string;
  size: number;
  kind: 'image' | 'file';
  url: string;
  uploadedBy?: string;
  created_at: string;
}

// --- Related activity (Customer 360 / lead profile) ---
export interface RelatedActivity {
  tasks: { id: string; subject: string; status: string; priority: string; dueDate: string; assignee: string }[];
  quotes: { id: string; quoteNumber: string; total: number; currency: string; status: string }[];
  emails: { id: string; direction: string; subject: string; status: string; created_at: string }[];
  whatsapp: { id: string; direction: string; body: string; status: string; created_at: string }[];
  calls: { id: string; direction: string; from_number: string; to_number: string; outcome: string; status: string; created_at: string }[];
  stageHistory?: { id: string; from: string; to: string; note: string; actor: string; created_at: string }[];
}

// --- Quotes ---
export interface QuoteLineItem {
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal?: number;
  productId?: string;
  sku?: string;
}

export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Expired';

export interface Quote {
  id: string;
  quoteNumber: string;
  title: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  status: QuoteStatus;
  currency: string;
  items: QuoteLineItem[];
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  validUntil: string;
  notes: string;
  convertedDealId?: string;
  created_at?: string;
  updated_at?: string;
}

// --- Tasks (calendar / my work) ---
export interface TaskItem {
  id: string;
  subject: string;
  status: string;
  priority: string;
  assignee: string;
  assigneeId: string;
  dueDate: string;
  dueTime?: string;   // HH:MM (24h), e.g. "14:30"
  startDate: string;
  category: string;
  customerId: string;
  relatedEntity: string;
  relatedId: string;
  relatedName: string;
  created_at: string;
}

// --- Email ---
export interface EmailConversation {
  contact_email: string;
  last_at: string;
  last_subject: string;
  matched_entity?: 'lead' | 'customer';
  matched_id?: string;
  message_count: number;
}

export interface EmailMessage {
  id: string;
  tenant_id: string;
  direction: 'outbound' | 'inbound';
  contact_email: string;
  from_address?: string;
  to_address?: string;
  subject: string;
  body: string;
  matched_entity?: string;
  matched_id?: string;
  status: 'queued' | 'sent' | 'simulated' | 'failed';
  error?: string;
  created_at: string;
}

// Web Presenter / Data Sources
export type DataSourceType = 'iframe' | 'api' | 'database';

export interface DataSourceConfig {
  id: string;
  name: string;
  type: DataSourceType;
  status: 'Active' | 'Inactive';

  // Connection Details
  endpoint?: string; // Base URL or Host
  port?: string;
  databaseName?: string;

  // Auth
  authType?: 'none' | 'basic' | 'bearer' | 'apikey';
  username?: string;
  password?: string;
  apiKey?: string;
  token?: string;

  // Query / Usage
  method?: 'GET' | 'POST' | 'PUT';
  query?: string; // SQL query or JSON body
  headers?: { key: string; value: string }[];
}

// --- RBAC & User Management ---

export type DataScope = 'all' | 'team' | 'own';

export interface FieldPermission {
  read: boolean;
  edit: boolean;
}

export interface ModulePermissions {
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  scope: DataScope; // Which records can they see?
  fields?: Record<string, FieldPermission>; // Field Level Security
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, ModulePermissions>; // Keyed by EntityType
  isSystem?: boolean;
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  roleId: string;
  isActive: boolean;
  avatar?: string;
  isSuperadmin?: boolean; // platform owner — bypasses tenant scoping
  permissions?: any; // Full permission tree
}

// --- Platform (superadmin) ---
export interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  created_at?: string;
  userCount?: number;
  recordCount?: number;
}

export interface AuthSession {
  user: User;
  token: string;
}

// --- MENU MANAGEMENT ---
export interface MenuItem {
  id: string;
  label: string;
  icon?: string; // Lucide icon name
  type: 'item' | 'group' | 'spacer';
  view?: ViewState; // If type is item
  children?: MenuItem[];
  allowedRoles?: string[]; // Array of role IDs, or ['*'] for all
}

// --- CAMPAIGNS ---
export interface Campaign {
  id: string;
  name: string;
  subject: string;
  targetProduct?: string; // Product ID
  status: 'Draft' | 'Active' | 'Completed';
  templateHtml: string;
  stats: {
    sent: number;
    opened: number;
    clicked: number;
    submissions: number;
  };
}

export interface ObjectManagerProps {
  onNavigate?: (view: ViewState, params?: any) => void;
  onRefreshSchemas: () => Promise<void>;
}

// --- SYSTEM SETTINGS ---
export interface SystemSettings {
  theme: 'light' | 'dark' | 'system';
  primaryColor: 'indigo' | 'blue' | 'purple' | 'emerald' | 'rose' | 'orange';
  density: 'comfortable' | 'compact';
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize?: 'sm' | 'md' | 'lg';
  organizationName: string;
  logoUrl?: string;
  defaultCurrency?: string; // ISO 4217 code, e.g. 'USD', 'INR', 'EUR'
  locale?: string;          // BCP-47 locale for number/currency formatting, e.g. 'en-IN'
  // Organization Details
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  timezone?: string;
  businessHoursStart?: string; // e.g., "09:00"
  businessHoursEnd?: string;   // e.g., "18:00"
  emailFooter?: string;
  websiteUrl?: string;
  taxId?: string;
  industry?: string;
  // 2025 UI options
  glassmorphism?: boolean;
  animationIntensity?: 'none' | 'subtle' | 'full';
  accentGradient?: { from: string; to: string };
}

// --- RECORD NOTES ---
export interface RecordNote {
  id: string;
  entity_type: string;
  record_id: string;
  stage_name?: string;
  note: string;
  kind: 'comment' | 'stage_change' | 'call' | 'email';
  actor_id?: string;
  actor_name?: string;
  created_at: string;
}

// --- NOTIFICATIONS ---
export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body?: string;
  kind: 'info' | 'reminder' | 'alert' | 'task_due';
  record_id?: string;
  entity_type?: string;
  is_read: number;
  scheduled_at?: string;
  created_at: string;
}

// --- CONFIGURABLE REPORTS ---
export interface ReportColumnDef {
  field: string;
  label: string;
  aggregate?: 'sum' | 'count' | 'avg' | 'max' | 'min';
}
export interface ReportFilterDef {
  field: string;
  op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt';
  value: string;
  logic?: 'and' | 'or';
}
export interface SavedReport {
  id?: string;
  name: string;
  description?: string;
  entityType: string;
  columns: ReportColumnDef[];
  filters: ReportFilterDef[];
  groupBy: string[];
  sortBy: { field: string; dir: 'asc' | 'desc' }[];
  vizType: 'table' | 'bar' | 'line' | 'pie' | 'metric';
  created_at?: string;
}

// --- REPORTING ENGINE ---
export type ReportVizType = 'table' | 'bar' | 'line' | 'pie' | 'metric';
export type ReportAccent = 'blue' | 'green' | 'orange';

export interface ReportParam {
  name: string;
  label: string;
  type: 'date' | 'text' | 'number' | 'select';
  options?: string[];
  default?: string | number;
  required?: boolean;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'currency' | 'date' | 'status';
}

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  mode: 'aggregate' | 'table';
  viz: ReportVizType;
  accent: ReportAccent;
  params: ReportParam[];
  columns: ReportColumn[];
  filters: { key: string; label: string; type: string }[];
}

export interface ReportFilter {
  key: string;
  op?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: string | number;
}

export interface RunReportOptions {
  params?: Record<string, string | number>;
  filters?: ReportFilter[];
  sort?: { key: string; dir: 'asc' | 'desc' };
  page?: number;
  pageSize?: number;
}

export interface ReportResult {
  mode: 'aggregate' | 'table';
  viz: ReportVizType;
  accent?: ReportAccent;
  rows: any[];
  total: number;
  // aggregate
  dimensionLabel?: string;
  measureLabel?: string;
  measureType?: 'number' | 'currency';
  // table
  columns?: ReportColumn[];
  page?: number;
  pageSize?: number;
  pageCount?: number;
}

// --- LEAD GENERATION RULES ---
export type LeadRuleOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty';

export interface LeadRuleCondition {
  field: string;
  operator: LeadRuleOperator;
  value?: string | number;
}

export interface LeadRuleConditions {
  match: 'all' | 'any';
  rules: LeadRuleCondition[];
}

export interface LeadRule {
  id: string;
  name: string;
  description?: string;
  sourceEntity: EntityType;
  targetEntity: EntityType;
  conditions: LeadRuleConditions;
  fieldMapping: Record<string, string>;
  defaultValues: Record<string, any>;
  assignTo?: string;
  dedupe: boolean;
  isActive: boolean;
  schedule: 'manual' | 'realtime' | 'interval';
  intervalMinutes?: number;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunCount?: number;
}

export interface LeadRuleRunResult {
  matched: number;
  created: number;
  skipped: number;
  preview: Array<{ sourceId: string; primaryDisplay: string; leadData: Record<string, any> }>;
}

// --- RELATIONSHIPS ---
export interface Relationship {
  id: string;
  name: string;
  source_entity: EntityType;
  target_entity: EntityType;
  source_field: string;
  target_field: string;
  relationship_type: 'lookup' | 'master-detail';
  cascade_delete: boolean;
  display_field?: string;
}

