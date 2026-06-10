

import { Edge, Node } from 'reactflow';

export type EntityType = 'lead' | 'customer' | 'case' | 'task' | 'product' | string;

export type FieldType = 'text' | 'number' | 'currency' | 'email' | 'phone' | 'select' | 'status' | 'textarea' | 'lookup' | 'attachment' | 'image' | 'iframe' | 'date';

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
  type: 'stat' | 'chart' | 'list';
  visible: boolean;
  order: number;
  width?: 'full' | 'half' | 'third';
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

export type ViewState = 'dashboard' | 'autoflow' | 'layout' | 'settings' | 'web-presenter' | 'users' | 'object-manager' | 'campaigns' | 'menu-manager' | 'lookups' | 'customer-360' | 'lead-rules' | 'lead-capture' | 'agent-console' | EntityType;

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
  permissions?: any; // Full permission tree
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
  // 2025 UI options
  glassmorphism?: boolean;
  animationIntensity?: 'none' | 'subtle' | 'full';
  accentGradient?: { from: string; to: string };
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

