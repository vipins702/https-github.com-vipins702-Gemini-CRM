// Field triggers and formula fields: values the server works out every time a record is saved.
//
// 1. Field triggers (table field_rules), run in order before the record is written:
//      WHEN  <all | any> of [ { field, operator, value } ]
//      THEN  set [ { field, value } ]       value may use {otherField} placeholders
//    Example: interested = Yes AND budget = No AND callback = Yes  →  set priority = "Nurture".
//    Operators: == != > < >= <= contains empty not_empty changed (changed compares with the stored record).
//
// 2. Formula fields (field type "formula", definition.formula), worked out after the triggers:
//      "{firstName} {lastName}"          → text, placeholders filled in
//      "{amount} * {quantity} - {discount}" → a number, when only numbers and + - * / ( ) remain
//    No code is ever executed: numbers go through the small parser below, never eval().

import { v4 as uuidv4 } from 'uuid';
import { normalizeGate, evaluateGate, checkGate } from './conditions.js';
import { expandTokens } from './tokens.js';

const OPERATORS = new Set(['==', '!=', '>', '<', '>=', '<=', 'contains', 'empty', 'not_empty', 'changed']);
export const RULE_OPERATORS = [...OPERATORS];

const isEmpty = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
const norm = v => (v === undefined || v === null ? '' : String(v).trim().toLowerCase());

export function conditionMet(c, data, old) {
    const v = data[c.field];
    switch (c.operator) {
        case '==': return norm(v) === norm(c.value);
        case '!=': return norm(v) !== norm(c.value);
        case '>': return Number(v) > Number(c.value);
        case '<': return Number(v) < Number(c.value);
        case '>=': return Number(v) >= Number(c.value);
        case '<=': return Number(v) <= Number(c.value);
        case 'contains': return norm(v).includes(norm(c.value));
        case 'empty': return isEmpty(v);
        case 'not_empty': return !isEmpty(v);
        case 'changed': return !!old && norm(v) !== norm(old[c.field]);
        default: return false;
    }
}

/** Fill {field} placeholders from the record. */
export const fillTemplate = (tpl, data) => expandTokens(tpl, data);

// ── Safe arithmetic: + - * / ( ) and decimals only ──────────────────────────
function calc(expr) {
    const s = expr.replace(/\s+/g, '');
    if (!s || !/^[0-9+\-*/().]+$/.test(s)) return null;
    let i = 0;
    const peek = () => s[i];
    const num = () => {
        if (peek() === '(') { i++; const v = add(); if (peek() !== ')') throw 0; i++; return v; }
        if (peek() === '-') { i++; return -num(); }
        if (peek() === '+') { i++; return num(); }
        const m = /^\d*\.?\d+/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return Number(m[0]);
    };
    const mul = () => { let v = num(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = num(); v = op === '*' ? v * r : (r === 0 ? NaN : v / r); } return v; };
    function add() { let v = mul(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = mul(); v = op === '+' ? v + r : v - r; } return v; }
    try { const v = add(); return i === s.length && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null; } catch { return null; }
}

export function evaluateFormula(formula, data) {
    if (typeof formula !== 'string' || !formula.trim() || formula.length > 1000) return '';
    // In arithmetic, a blank number counts as 0 so "{a} + {b}" still works when b is empty.
    const numeric = formula.replace(/\{([A-Za-z_][\w]*)\}/g, (_, k) => { const n = Number(data[k]); return data[k] === '' || data[k] == null ? '0' : Number.isFinite(n) ? `(${n})` : 'x'; });
    const n = calc(numeric);
    if (n !== null) return n;
    return fillTemplate(formula, data).replace(/\s+/g, ' ').trim();
}

/** Apply this record type's active triggers, then its formula fields. Mutates and returns data. */
export async function applyFieldLogic(db, tenantId, entityType, definition, data, old = null) {
    const fieldNames = new Set((definition?.fields || []).map(f => f.name));
    const rules = await db.all('SELECT * FROM field_rules WHERE tenant_id = ? AND entity_type = ? AND active = 1 ORDER BY sort_order, created_at', tenantId, entityType).catch(() => []);
    const fired = [];
    for (const r of rules) {
        let gate = null, actions = [];
        try { gate = normalizeGate(JSON.parse(r.conditions || '[]'), r.match); actions = JSON.parse(r.actions || '[]'); } catch { continue; }
        if (!gate || !gate.children?.length || !actions.length) continue;
        if (!evaluateGate(gate, (c) => conditionMet(c, data, old))) continue;
        for (const a of actions) if (fieldNames.has(a.field)) data[a.field] = fillTemplate(a.value, data);
        fired.push(r.name);
    }
    for (const f of definition?.fields || []) if (f.type === 'formula') data[f.name] = evaluateFormula(f.formula, data);
    return { data, fired };
}

// ── Storage + validation (used by the /api/field-rules routes) ──────────────
export async function ensureFieldRulesTable(db) {
    await db.exec(`CREATE TABLE IF NOT EXISTS field_rules (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, entity_type TEXT NOT NULL, name TEXT NOT NULL,
        active INTEGER DEFAULT 1, match TEXT DEFAULT 'all', conditions TEXT NOT NULL, actions TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_field_rules_entity ON field_rules (tenant_id, entity_type)');
}

export function checkRule(body, fields) {
    const names = new Set(fields.map(f => f.name));
    const errs = [];
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120) errs.push('name is required (up to 120 characters)');
    if (body.match !== undefined && !['all', 'any'].includes(body.match)) errs.push('match must be "all" or "any"');
    const acts = Array.isArray(body.actions) ? body.actions : null;
    const gate = normalizeGate(body.conditions, body.match);
    if (!gate || !gate.children?.length) errs.push('add at least one condition');
    else {
        errs.push(...checkGate(gate, (c, path) => {
            if (!c || !names.has(c.field)) return 'pick a field of this record type';
            if (!OPERATORS.has(c.operator)) return 'unknown operator';
            if (c.value !== undefined && typeof c.value !== 'string' && typeof c.value !== 'number' && typeof c.value !== 'boolean') return 'value must be text or a number';
            return null;
        }));
    }
    if (!acts || !acts.length || acts.length > 20) errs.push('add 1 to 20 actions');
    (acts || []).forEach((a, i) => {
        const f = a && fields.find(x => x.name === a.field);
        if (!f) errs.push(`action ${i + 1}: pick a field of this record type`);
        else if (f.type === 'formula') errs.push(`action ${i + 1}: ${f.label} is a formula field and is always worked out`);
        else if (typeof a.value !== 'string' && typeof a.value !== 'number') errs.push(`action ${i + 1}: value must be text or a number`);
        else if (String(a.value).length > 2000) errs.push(`action ${i + 1}: value is too long`);
    });
    return errs;
}

export const toRow = (tenantId, entityType, b, id = uuidv4()) => ({
    id, tenant_id: tenantId, entity_type: entityType, name: b.name.trim(), active: b.active === false ? 0 : 1,
    match: b.match === 'any' ? 'any' : 'all',
    conditions: JSON.stringify(cleanGate(normalizeGate(b.conditions, b.match))),
    actions: JSON.stringify(b.actions.map(a => ({ field: a.field, value: String(a.value) }))),
    sort_order: Number.isInteger(b.sortOrder) ? b.sortOrder : 0,
});

const cleanGate = (n) => (n.type === 'rule'
    ? { type: 'rule', field: n.field, operator: n.operator, value: n.value ?? '' }
    : { type: 'group', op: n.op, children: (n.children || []).map(cleanGate) });

export const fromRow = r => ({
    id: r.id, entityType: r.entity_type, name: r.name, active: !!r.active, match: r.match,
    conditions: normalizeGate(JSON.parse(r.conditions || '[]'), r.match) || { type: 'group', op: 'and', children: [] }, actions: JSON.parse(r.actions || '[]'), sortOrder: r.sort_order,
});
