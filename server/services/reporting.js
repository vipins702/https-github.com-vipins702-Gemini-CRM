import db from '../database.js';
import { reportCache } from './reportCache.js';

/**
 * Reporting engine (JSON-defined, tenant-safe).
 *
 * Design notes
 * ------------
 * - There are NO stored procedures in SQLite, so the equivalent here is a *vetted registry*
 *   of parameterized "named queries". The client may only pick a reportId + bound params/
 *   filters/sort/paging — it can NEVER send raw SQL.
 * - EVERY query is tenant-isolated: `tenant_id = ?` is injected by the engine, never trusted
 *   from the client. This is the SaaS security boundary.
 * - Filters and sort are restricted to a per-report whitelist (key -> SQL expression). Values
 *   are always passed as bound parameters (no string interpolation) to prevent SQL injection.
 *
 * Two report modes:
 *   - 'aggregate' : GROUP BY a dimension, compute a measure -> rows for charts / metric tiles.
 *   - 'table'     : column projection with paging + filters + sort -> rows for tables.
 */

// JSON field accessor with sensible fallbacks for the metadata `records` table.
const J = (field) => db.json('r.data', field);
const NUM = (field) => db.jsonNum('r.data', field);
// 'YYYY-MM' of a stored timestamp (text 'YYYY-MM-DD HH:MM:SS' on both databases).
const MONTH = (col) => `substr(${col}, 1, 7)`;

/** The vetted report catalog. SQL expressions here are author-controlled (safe). */
const REPORTS = {
  leads_by_status: {
    id: 'leads_by_status',
    name: 'Leads by Status',
    description: 'Count of leads grouped by their current status.',
    category: 'Sales',
    mode: 'aggregate',
    viz: 'bar',
    entityType: 'lead',
    dimension: { expr: `COALESCE(${J('status')}, r.status, 'Unknown')`, label: 'Status', key: 'name' },
    measure: { expr: 'COUNT(*)', label: 'Leads', key: 'value', type: 'number' },
    params: [{ name: 'since', label: 'Created since', type: 'date' }],
  },

  leads_by_source: {
    id: 'leads_by_source',
    name: 'Leads by Source',
    description: 'Where your leads come from (channel / campaign source).',
    category: 'Sales',
    mode: 'aggregate',
    viz: 'pie',
    entityType: 'lead',
    dimension: { expr: `COALESCE(${J('source')}, 'Unknown')`, label: 'Source', key: 'name' },
    measure: { expr: 'COUNT(*)', label: 'Leads', key: 'value', type: 'number' },
    params: [{ name: 'since', label: 'Created since', type: 'date' }],
  },

  pipeline_value_by_stage: {
    id: 'pipeline_value_by_stage',
    name: 'Pipeline Value by Stage',
    description: 'Total opportunity value grouped by stage/status (money).',
    category: 'Revenue',
    mode: 'aggregate',
    viz: 'bar',
    accent: 'green',
    entityType: 'lead',
    dimension: { expr: `COALESCE(${J('status')}, r.status, 'Unknown')`, label: 'Stage', key: 'name' },
    measure: { expr: `COALESCE(SUM(${NUM('value')}), 0)`, label: 'Value', key: 'value', type: 'currency' },
    params: [],
  },

  new_leads_over_time: {
    id: 'new_leads_over_time',
    name: 'New Leads Over Time',
    description: 'New leads created per month.',
    category: 'Sales',
    mode: 'aggregate',
    viz: 'line',
    entityType: 'lead',
    dimension: { expr: MONTH('r.created_at'), label: 'Month', key: 'name' },
    measure: { expr: 'COUNT(*)', label: 'New Leads', key: 'value', type: 'number' },
    params: [{ name: 'since', label: 'Created since', type: 'date' }],
    orderByDimension: true,
  },

  cases_by_priority: {
    id: 'cases_by_priority',
    name: 'Cases by Priority',
    description: 'Support cases grouped by priority.',
    category: 'Service',
    mode: 'aggregate',
    viz: 'bar',
    accent: 'orange',
    entityType: 'case',
    dimension: { expr: `COALESCE(${J('priority')}, 'Unspecified')`, label: 'Priority', key: 'name' },
    measure: { expr: 'COUNT(*)', label: 'Cases', key: 'value', type: 'number' },
    params: [],
  },

  lead_list: {
    id: 'lead_list',
    name: 'Lead List',
    description: 'Detailed, filterable list of leads with paging.',
    category: 'Sales',
    mode: 'table',
    viz: 'table',
    entityType: 'lead',
    columns: [
      { key: 'name', label: 'Name', type: 'text', expr: `COALESCE(${J('name')}, NULLIF(TRIM(COALESCE(${J('firstName')}, '') || ' ' || COALESCE(${J('lastName')}, '')), ''), r.primary_display)` },
      { key: 'status', label: 'Status', type: 'status', expr: `COALESCE(${J('status')}, r.status)` },
      { key: 'source', label: 'Source', type: 'text', expr: `COALESCE(${J('source')}, '-')` },
      { key: 'value', label: 'Value', type: 'currency', expr: NUM('value') },
      { key: 'created_at', label: 'Created', type: 'date', expr: 'r.created_at' },
    ],
    filters: [
      { key: 'status', label: 'Status', type: 'text', expr: `COALESCE(${J('status')}, r.status)` },
      { key: 'source', label: 'Source', type: 'text', expr: `COALESCE(${J('source')}, '')` },
    ],
    defaultSort: { key: 'created_at', dir: 'desc' },
    params: [{ name: 'since', label: 'Created since', type: 'date' }],
  },
};

const FILTER_OPS = {
  eq: '=', neq: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=', contains: 'LIKE',
};

/** Public metadata (never exposes SQL). */
export function listReports() {
  return Object.values(REPORTS).map((r) => ({
    id: r.id, name: r.name, description: r.description, category: r.category,
    mode: r.mode, viz: r.viz, accent: r.accent || 'blue',
    params: r.params || [],
    columns: (r.columns || []).map((c) => ({ key: c.key, label: c.label, type: c.type })),
    filters: (r.filters || []).map((f) => ({ key: f.key, label: f.label, type: f.type })),
  }));
}

function applyParamClauses(def, params = {}) {
  const clauses = [];
  const args = [];
  for (const p of def.params || []) {
    const v = params[p.name];
    if (v === undefined || v === null || v === '') continue;
    if (p.name === 'since' && p.type === 'date') {
      clauses.push('r.created_at >= ?');
      args.push(String(v));
    }
  }
  return { clauses, args };
}

function clampPageSize(n) {
  const x = Number(n) || 25;
  return Math.min(Math.max(x, 1), 200);
}

/**
 * Run a report with tenant isolation, bound params, whitelisted filters/sort and paging.
 * @param {string} tenantId  REQUIRED — injected as a bound parameter on every query.
 */
export async function runReport(tenantId, reportId, opts = {}) {
  const def = REPORTS[reportId];
  if (!def) throw new Error(`Unknown report: ${reportId}`);
  if (!tenantId) throw new Error('Missing tenant context');

  const { params = {}, filters = [], sort, page = 1, pageSize = 25 } = opts;

  // Base WHERE — tenant + entity, always bound.
  const where = ['r.tenant_id = ?', 'r.entity_type = ?'];
  const args = [tenantId, def.entityType];

  const paramClauses = applyParamClauses(def, params);
  where.push(...paramClauses.clauses);
  args.push(...paramClauses.args);

  // Whitelisted filters
  const filterDefs = Object.fromEntries((def.filters || []).map((f) => [f.key, f]));
  for (const f of Array.isArray(filters) ? filters : []) {
    const fd = filterDefs[f?.key];
    const op = FILTER_OPS[f?.op || 'eq'];
    if (!fd || !op || f.value === undefined || f.value === '') continue;
    if (op === 'LIKE') {
      where.push(`${fd.expr} ${db.like} ?`);
      args.push(`%${f.value}%`);
    } else {
      where.push(`${fd.expr} ${op} ?`);
      args.push(f.value);
    }
  }

  const whereSql = where.join(' AND ');

  if (def.mode === 'aggregate') {
    const sql =
      `SELECT ${def.dimension.expr} AS name, ${def.measure.expr} AS value ` +
      `FROM records r WHERE ${whereSql} ` +
      `GROUP BY ${def.dimension.expr} ` +
      `ORDER BY ${def.orderByDimension ? 'name ASC' : 'value DESC'} LIMIT 100`;
    const rows = await db.all(sql, ...args);
    return {
      mode: 'aggregate', viz: def.viz, accent: def.accent || 'blue',
      dimensionLabel: def.dimension.label, measureLabel: def.measure.label,
      measureType: def.measure.type || 'number',
      rows: rows.map((x) => ({ name: x.name == null ? 'Unknown' : String(x.name), value: Number(x.value) || 0 })),
      total: rows.length,
    };
  }

  // mode === 'table'
  const selectExprs = def.columns.map((c) => `${c.expr} AS "${c.key}"`).join(', ');

  // Sort whitelist
  const sortable = Object.fromEntries(def.columns.map((c) => [c.key, c.expr]));
  const reqSort = sort && sortable[sort.key] ? sort : def.defaultSort;
  const sortExpr = sortable[reqSort?.key] || 'r.created_at';
  const sortDir = (reqSort?.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const ps = clampPageSize(pageSize);
  const pg = Math.max(Number(page) || 1, 1);
  const offset = (pg - 1) * ps;

  const countRow = await db.get(`SELECT COUNT(*) AS n FROM records r WHERE ${whereSql}`, ...args);
  const total = countRow?.n || 0;

  const rows = await db.all(
    `SELECT ${selectExprs} FROM records r WHERE ${whereSql} ORDER BY ${sortExpr} ${sortDir} LIMIT ? OFFSET ?`,
    ...args, ps, offset
  );

  return {
    mode: 'table', viz: 'table',
    columns: def.columns.map((c) => ({ key: c.key, label: c.label, type: c.type })),
    rows, total, page: pg, pageSize: ps,
    pageCount: Math.max(Math.ceil(total / ps), 1),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT PACKS — multi-dataset, cached, parameter-driven
// Each pack is the SQLite equivalent of a stored procedure that returns
// multiple result sets. The client picks packId + params; it NEVER sends SQL.
// ─────────────────────────────────────────────────────────────────────────────

const LEAD_NAME = `COALESCE(${J('name')}, NULLIF(TRIM(COALESCE(${J('firstName')},'') || ' ' || COALESCE(${J('lastName')},'')), ''), r.primary_display)`;
const STATUS    = (et) => `COALESCE(${J('status')}, r.status, 'Unknown')`;
const VALUE     = NUM('value');

/**
 * Build base WHERE + args for a pack dataset.
 * @param {string} tenantId
 * @param {string} entityType
 * @param {object} params  — { since?: string, until?: string }
 */
function baseWhere(tenantId, entityType, params = {}) {
  const clauses = ['r.tenant_id = ?', 'r.entity_type = ?'];
  const args    = [tenantId, entityType];
  if (params.since)  { clauses.push('r.created_at >= ?'); args.push(String(params.since)); }
  if (params.until)  { clauses.push('r.created_at <= ?'); args.push(String(params.until)); }
  return { clauses, args };
}

/**
 * The pack registry.
 * Each dataset has:
 *   type     — 'kpi' | 'timeseries' | 'aggregate' | 'table'
 *   ttlKey   — maps to cache TTL bucket
 *   columns  — public column metadata (never exposes SQL)
 *   run()    — async fn(tenantId, params) → dataset payload
 */
const REPORT_PACKS = {

  // ── Pack 1: Dashboard Summary ──────────────────────────────────────────────
  dashboard_summary: {
    id:          'dashboard_summary',
    name:        'Dashboard Summary',
    description: 'KPI metrics, trend chart, pipeline funnel, and recent leads.',
    defaultEntity: 'lead',
    params: [
      { name: 'since', type: 'date', label: 'From date' },
      { name: 'until', type: 'date', label: 'To date'   },
    ],
    datasets: {

      kpi: {
        id: 'kpi', label: 'KPI Metrics', type: 'kpi', ttlKey: 'kpi',
        columns: [
          { key: 'total_revenue',   label: 'Total Revenue',    type: 'currency', accent: 'green'  },
          { key: 'total_leads',     label: 'Total Leads',      type: 'number',   accent: 'blue'   },
          { key: 'conversion_rate', label: 'Conversion Rate',  type: 'percent',  accent: 'orange' },
          { key: 'avg_deal_value',  label: 'Avg Deal Value',   type: 'currency', accent: 'blue'   },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'lead', params);
          const w = clauses.join(' AND ');
          const row = await db.get(`
            SELECT
              COALESCE(SUM(${VALUE}), 0) AS total_revenue,
              COUNT(*) AS total_leads,
              COUNT(CASE WHEN COALESCE(${J('status')}, r.status) IN ('Won','Closed Won') THEN 1 END) AS won_count,
              ROUND(100.0 *
                COUNT(CASE WHEN COALESCE(${J('status')}, r.status) IN ('Won','Closed Won') THEN 1 END)
                / NULLIF(COUNT(*), 0), 1) AS conversion_rate,
              COALESCE(AVG(CASE WHEN ${VALUE} > 0 THEN ${VALUE} END), 0) AS avg_deal_value
            FROM records r WHERE ${w}`, ...args);
          return {
            type: 'kpi',
            columns: REPORT_PACKS.dashboard_summary.datasets.kpi.columns,
            row: {
              total_revenue:   Number(row?.total_revenue   || 0),
              total_leads:     Number(row?.total_leads     || 0),
              conversion_rate: Number(row?.conversion_rate || 0),
              avg_deal_value:  Number(row?.avg_deal_value  || 0),
            },
          };
        },
      },

      trend: {
        id: 'trend', label: 'Leads Over Time', type: 'timeseries', ttlKey: 'timeseries',
        measures: [
          { key: 'new_leads', label: 'New Leads', type: 'number',   color: '#0A84FF' },
          { key: 'revenue',   label: 'Revenue',   type: 'currency', color: '#30D158' },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'lead', params);
          const w = clauses.join(' AND ');
          const rows = await db.all(`
            SELECT
              ${MONTH('r.created_at')} AS period,
              COUNT(*) AS new_leads,
              COALESCE(SUM(${VALUE}), 0) AS revenue
            FROM records r WHERE ${w}
            GROUP BY period ORDER BY period LIMIT 24`, ...args);
          return {
            type:     'timeseries',
            measures: REPORT_PACKS.dashboard_summary.datasets.trend.measures,
            rows:     rows.map(r => ({ period: r.period, new_leads: Number(r.new_leads), revenue: Number(r.revenue) })),
          };
        },
      },

      funnel: {
        id: 'funnel', label: 'Pipeline by Stage', type: 'aggregate', ttlKey: 'aggregate',
        viz: 'bar', accent: 'blue',
        columns: [
          { key: 'name',        label: 'Stage',       type: 'text'     },
          { key: 'lead_count',  label: 'Leads',       type: 'number'   },
          { key: 'total_value', label: 'Total Value',  type: 'currency' },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'lead', params);
          const w = clauses.join(' AND ');
          const rows = await db.all(`
            SELECT
              COALESCE(${J('status')}, r.status, 'Unknown') AS name,
              COUNT(*) AS lead_count,
              COALESCE(SUM(${VALUE}), 0) AS total_value
            FROM records r WHERE ${w}
            GROUP BY name ORDER BY total_value DESC LIMIT 20`, ...args);
          return {
            type:    'aggregate',
            viz:     'bar',
            accent:  'blue',
            columns: REPORT_PACKS.dashboard_summary.datasets.funnel.columns,
            rows:    rows.map(r => ({ name: r.name || 'Unknown', lead_count: Number(r.lead_count), total_value: Number(r.total_value) })),
          };
        },
      },

      recent: {
        id: 'recent', label: 'Recent Leads', type: 'table', ttlKey: 'table',
        columns: [
          { key: 'name',       label: 'Name',    type: 'text'     },
          { key: 'status',     label: 'Status',  type: 'status'   },
          { key: 'source',     label: 'Source',  type: 'text'     },
          { key: 'value',      label: 'Value',   type: 'currency' },
          { key: 'created_at', label: 'Created', type: 'date'     },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'lead', params);
          const w = clauses.join(' AND ');
          const pg       = Math.max(Number(params.page || 1), 1);
          const pageSize = Math.min(Math.max(Number(params.pageSize || 10), 1), 100);
          const offset   = (pg - 1) * pageSize;
          const countRow = await db.get(`SELECT COUNT(*) AS n FROM records r WHERE ${w}`, ...args);
          const total    = Number(countRow?.n || 0);
          const rows     = await db.all(`
            SELECT
              ${LEAD_NAME} AS name,
              COALESCE(${J('status')}, r.status) AS status,
              COALESCE(${J('source')}, '-') AS source,
              ${VALUE} AS value,
              r.created_at
            FROM records r WHERE ${w}
            ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
            ...args, pageSize, offset);
          return {
            type:      'table',
            columns:   REPORT_PACKS.dashboard_summary.datasets.recent.columns,
            rows,
            total,
            page:      pg,
            pageSize,
            pageCount: Math.max(Math.ceil(total / pageSize), 1),
          };
        },
      },
    },
  },

  // ── Pack 2: Sales Pipeline ─────────────────────────────────────────────────
  sales_pipeline: {
    id:          'sales_pipeline',
    name:        'Sales Pipeline',
    description: 'Pipeline KPIs, stage breakdown, source mix, and at-risk leads.',
    defaultEntity: 'lead',
    params: [
      { name: 'since', type: 'date', label: 'From date' },
    ],
    datasets: {

      kpi: {
        id: 'kpi', label: 'Pipeline KPIs', type: 'kpi', ttlKey: 'kpi',
        columns: [
          { key: 'pipeline_value',  label: 'Pipeline Value',  type: 'currency', accent: 'green'  },
          { key: 'open_count',      label: 'Open Leads',      type: 'number',   accent: 'blue'   },
          { key: 'qualified_count', label: 'Qualified',       type: 'number',   accent: 'blue'   },
          { key: 'win_rate',        label: 'Win Rate',        type: 'percent',  accent: 'orange' },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'lead', params);
          const w = clauses.join(' AND ');
          const row = await db.get(`
            SELECT
              COALESCE(SUM(${VALUE}), 0) AS pipeline_value,
              COUNT(*) AS open_count,
              COUNT(CASE WHEN COALESCE(${J('status')}, r.status) = 'Qualified' THEN 1 END) AS qualified_count,
              ROUND(100.0 *
                COUNT(CASE WHEN COALESCE(${J('status')}, r.status) IN ('Won','Closed Won') THEN 1 END)
                / NULLIF(COUNT(*), 0), 1) AS win_rate
            FROM records r WHERE ${w}`, ...args);
          return {
            type: 'kpi',
            columns: REPORT_PACKS.sales_pipeline.datasets.kpi.columns,
            row: {
              pipeline_value:  Number(row?.pipeline_value  || 0),
              open_count:      Number(row?.open_count      || 0),
              qualified_count: Number(row?.qualified_count || 0),
              win_rate:        Number(row?.win_rate        || 0),
            },
          };
        },
      },

      by_stage: {
        id: 'by_stage', label: 'By Stage', type: 'aggregate', ttlKey: 'aggregate',
        viz: 'bar', accent: 'green',
        columns: [
          { key: 'name',  label: 'Stage', type: 'text'     },
          { key: 'count', label: 'Leads', type: 'number'   },
          { key: 'value', label: 'Value', type: 'currency' },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'lead', params);
          const w = clauses.join(' AND ');
          const rows = await db.all(`
            SELECT COALESCE(${J('status')}, r.status, 'Unknown') AS name,
              COUNT(*) AS count, COALESCE(SUM(${VALUE}), 0) AS value
            FROM records r WHERE ${w}
            GROUP BY name ORDER BY value DESC LIMIT 15`, ...args);
          return {
            type: 'aggregate', viz: 'bar', accent: 'green',
            columns: REPORT_PACKS.sales_pipeline.datasets.by_stage.columns,
            rows: rows.map(r => ({ name: r.name, count: Number(r.count), value: Number(r.value) })),
          };
        },
      },

      by_source: {
        id: 'by_source', label: 'By Source', type: 'aggregate', ttlKey: 'aggregate',
        viz: 'pie', accent: 'blue',
        columns: [
          { key: 'name',  label: 'Source', type: 'text'   },
          { key: 'count', label: 'Leads',  type: 'number' },
          { key: 'value', label: 'Value',  type: 'currency' },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'lead', params);
          const w = clauses.join(' AND ');
          const rows = await db.all(`
            SELECT COALESCE(${J('source')}, 'Unknown') AS name,
              COUNT(*) AS count, COALESCE(SUM(${VALUE}), 0) AS value
            FROM records r WHERE ${w}
            GROUP BY name ORDER BY count DESC LIMIT 10`, ...args);
          return {
            type: 'aggregate', viz: 'pie', accent: 'blue',
            columns: REPORT_PACKS.sales_pipeline.datasets.by_source.columns,
            rows: rows.map(r => ({ name: r.name, count: Number(r.count), value: Number(r.value) })),
          };
        },
      },

    },
  },

  // ── Pack 3: Service Overview ───────────────────────────────────────────────
  service_overview: {
    id:          'service_overview',
    name:        'Service Overview',
    description: 'Case volume KPIs, priority breakdown, and recent cases.',
    defaultEntity: 'case',
    params: [
      { name: 'since', type: 'date', label: 'From date' },
    ],
    datasets: {

      kpi: {
        id: 'kpi', label: 'Case KPIs', type: 'kpi', ttlKey: 'kpi',
        columns: [
          { key: 'total_cases',    label: 'Total Cases',    type: 'number', accent: 'blue'   },
          { key: 'open_cases',     label: 'Open Cases',     type: 'number', accent: 'orange' },
          { key: 'high_priority',  label: 'High Priority',  type: 'number', accent: 'orange' },
          { key: 'resolved_cases', label: 'Resolved',       type: 'number', accent: 'green'  },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'case', params);
          const w = clauses.join(' AND ');
          const row = await db.get(`
            SELECT
              COUNT(*) AS total_cases,
              COUNT(CASE WHEN COALESCE(${J('status')}, r.status) IN ('Open','New') THEN 1 END) AS open_cases,
              COUNT(CASE WHEN COALESCE(${J('priority')}, 'Medium') = 'High' THEN 1 END) AS high_priority,
              COUNT(CASE WHEN COALESCE(${J('status')}, r.status) IN ('Resolved','Closed') THEN 1 END) AS resolved_cases
            FROM records r WHERE ${w}`, ...args);
          return {
            type: 'kpi',
            columns: REPORT_PACKS.service_overview.datasets.kpi.columns,
            row: {
              total_cases:    Number(row?.total_cases    || 0),
              open_cases:     Number(row?.open_cases     || 0),
              high_priority:  Number(row?.high_priority  || 0),
              resolved_cases: Number(row?.resolved_cases || 0),
            },
          };
        },
      },

      by_priority: {
        id: 'by_priority', label: 'By Priority', type: 'aggregate', ttlKey: 'aggregate',
        viz: 'bar', accent: 'orange',
        columns: [
          { key: 'name',  label: 'Priority', type: 'text'   },
          { key: 'count', label: 'Cases',    type: 'number' },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'case', params);
          const w = clauses.join(' AND ');
          const rows = await db.all(`
            SELECT COALESCE(${J('priority')}, 'Unspecified') AS name, COUNT(*) AS count
            FROM records r WHERE ${w}
            GROUP BY name ORDER BY count DESC`, ...args);
          return {
            type: 'aggregate', viz: 'bar', accent: 'orange',
            columns: REPORT_PACKS.service_overview.datasets.by_priority.columns,
            rows: rows.map(r => ({ name: r.name, count: Number(r.count) })),
          };
        },
      },

      recent_cases: {
        id: 'recent_cases', label: 'Recent Cases', type: 'table', ttlKey: 'table',
        columns: [
          { key: 'title',      label: 'Title',    type: 'text'   },
          { key: 'status',     label: 'Status',   type: 'status' },
          { key: 'priority',   label: 'Priority', type: 'text'   },
          { key: 'created_at', label: 'Created',  type: 'date'   },
        ],
        async run(tenantId, params) {
          const { clauses, args } = baseWhere(tenantId, 'case', params);
          const w = clauses.join(' AND ');
          const rows = await db.all(`
            SELECT
              COALESCE(${J('title')}, r.primary_display) AS title,
              COALESCE(${J('status')}, r.status) AS status,
              COALESCE(${J('priority')}, '-') AS priority,
              r.created_at
            FROM records r WHERE ${w}
            ORDER BY r.created_at DESC LIMIT 10`, ...args);
          return {
            type: 'table',
            columns: REPORT_PACKS.service_overview.datasets.recent_cases.columns,
            rows, total: rows.length, page: 1, pageSize: 10, pageCount: 1,
          };
        },
      },
    },
  },
};

/** Return public metadata for all packs (never exposes SQL). */
export function listPacks() {
  return Object.values(REPORT_PACKS).map(p => ({
    id:          p.id,
    name:        p.name,
    description: p.description,
    params:      p.params || [],
    datasets:    Object.values(p.datasets).map(d => ({
      id:      d.id,
      label:   d.label,
      type:    d.type,
      viz:     d.viz,
      accent:  d.accent,
      columns: (d.columns || []).map(c => ({ key: c.key, label: c.label, type: c.type, accent: c.accent })),
      measures: d.measures || [],
    })),
  }));
}

/**
 * Run one or more datasets from a pack.
 * Results are cached per tenantId + packId + datasetId + params hash.
 *
 * @param {string}   tenantId
 * @param {string}   packId
 * @param {object}   opts  { params, datasets, page, pageSize }
 * @returns {object} { packId, datasets: { [id]: result }, meta }
 */
export async function runPack(tenantId, packId, opts = {}) {
  const pack = REPORT_PACKS[packId];
  if (!pack) throw new Error(`Unknown pack: ${packId}`);
  if (!tenantId) throw new Error('Missing tenant context');

  const { params = {}, datasets: requestedDatasets, page, pageSize } = opts;
  const effectiveParams = { ...params };
  if (page)     effectiveParams.page     = page;
  if (pageSize) effectiveParams.pageSize = pageSize;

  // Determine which datasets to run
  const datasetIds = requestedDatasets?.length
    ? requestedDatasets.filter(id => pack.datasets[id])
    : Object.keys(pack.datasets);

  const t0 = Date.now();
  let cacheHits = 0, cacheMisses = 0;

  const results = await Promise.all(
    datasetIds.map(async (dsId) => {
      const ds = pack.datasets[dsId];

      // Check cache first
      const cached = reportCache.get(tenantId, packId, dsId, effectiveParams);
      if (cached) { cacheHits++; return [dsId, cached]; }

      cacheMisses++;
      const data = await ds.run(tenantId, effectiveParams);
      reportCache.set(tenantId, packId, dsId, effectiveParams, data, ds.ttlKey);
      return [dsId, { ...data, _cached: false }];
    })
  );

  return {
    packId,
    params: effectiveParams,
    generatedAt: new Date().toISOString(),
    datasets:    Object.fromEntries(results),
    meta:        { cacheHits, cacheMisses, totalMs: Date.now() - t0 },
  };
}
