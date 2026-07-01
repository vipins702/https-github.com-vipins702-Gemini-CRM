/**
 * In-memory report cache with per-dataset-type TTL.
 *
 * Cache key: tenantId:packId:datasetId:md5(params)
 * TTL is intentionally short — data freshness beats server memory.
 * Write-through invalidation is done by calling invalidateTenant()
 * after every record create/update/delete.
 */

import crypto from 'crypto';

const TTL_MS = {
  kpi:        5  * 60 * 1000,   // 5 min  — KPI numbers
  timeseries: 15 * 60 * 1000,   // 15 min — historical trend
  aggregate:  10 * 60 * 1000,   // 10 min — grouped/funnel
  table:      2  * 60 * 1000,   // 2 min  — live paged list
  default:    5  * 60 * 1000,
};

function paramsHash(params = {}) {
  return crypto
    .createHash('md5')
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest('hex')
    .slice(0, 10);
}

class ReportCache {
  constructor() {
    this._store = new Map();
    // prune expired entries every 10 min — avoids unbounded growth
    setInterval(() => this._prune(), 10 * 60 * 1000).unref();
  }

  _key(tenantId, packId, datasetId, params) {
    return `${tenantId}:${packId}:${datasetId}:${paramsHash(params)}`;
  }

  get(tenantId, packId, datasetId, params) {
    const key   = this._key(tenantId, packId, datasetId, params);
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this._store.delete(key); return null; }
    entry.hits++;
    return {
      ...entry.data,
      _cached:   true,
      _cacheAge: Math.round((Date.now() - entry.createdAt) / 1000),
    };
  }

  set(tenantId, packId, datasetId, params, data, ttlKey = 'default') {
    const key = this._key(tenantId, packId, datasetId, params);
    const ttl = TTL_MS[ttlKey] ?? TTL_MS.default;
    this._store.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
      hits:      0,
      ttlKey,
      tenantId,
      packId,
      datasetId,
    });
  }

  /** Invalidate all cached results for a tenant (call on any record write). */
  invalidateTenant(tenantId) {
    let n = 0;
    for (const [key, e] of this._store) {
      if (e.tenantId === tenantId) { this._store.delete(key); n++; }
    }
    return n;
  }

  /** Invalidate one specific pack for a tenant. */
  invalidatePack(tenantId, packId) {
    let n = 0;
    for (const [key, e] of this._store) {
      if (e.tenantId === tenantId && e.packId === packId) { this._store.delete(key); n++; }
    }
    return n;
  }

  stats() {
    const entries = [...this._store.values()];
    return {
      size:       this._store.size,
      byType:     entries.reduce((m, e) => { m[e.ttlKey] = (m[e.ttlKey] || 0) + 1; return m; }, {}),
      totalHits:  entries.reduce((s, e) => s + e.hits, 0),
    };
  }

  _prune() {
    const now = Date.now();
    for (const [key, e] of this._store) {
      if (now > e.expiresAt) this._store.delete(key);
    }
  }
}

export const reportCache = new ReportCache();
