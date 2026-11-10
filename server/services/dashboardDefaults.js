// The dashboard every new workspace starts with: the Dashboard Summary report pack (see services/reporting.js).
// The dashboard screen draws "pack" widgets only, so these must reference a real pack and dataset.
export const DEFAULT_DASHBOARD = [
    { id: 'default-kpi', title: 'KPI Metrics', type: 'pack', visible: true, order: 0, width: 'full', packId: 'dashboard_summary', datasetId: 'kpi' },
    { id: 'default-trend', title: 'Leads Over Time', type: 'pack', visible: true, order: 1, width: 'half', packId: 'dashboard_summary', datasetId: 'trend' },
    { id: 'default-funnel', title: 'Pipeline by Stage', type: 'pack', visible: true, order: 2, width: 'half', packId: 'dashboard_summary', datasetId: 'funnel' },
    { id: 'default-recent', title: 'Recent Leads', type: 'pack', visible: true, order: 3, width: 'full', packId: 'dashboard_summary', datasetId: 'recent' },
];

/** Dashboards saved before pack widgets existed hold only old tile types that no longer draw anything. */
export const hasRenderableWidgets = (widgets) => Array.isArray(widgets) && widgets.some(w => w && w.type === 'pack');
