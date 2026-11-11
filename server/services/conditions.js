// AND / OR / NOT condition gates, shared by Field Triggers and Journeys.
//
//   rule   { type: 'rule',  field, operator, value }
//   group  { type: 'group', op: 'and' | 'or' | 'not', children: [rule | group, ...] }
//
//   and  passes when every child passes           (an empty group passes)
//   or   passes when at least one child passes    (an empty group fails)
//   not  passes when its children do NOT all pass (NOT of an AND; use one child for a plain NOT)
//
// Older saved conditions keep working:
//   [ {field, operator, value}, ... ] with match 'all' | 'any'      (field triggers)
//   { match: 'all' | 'any', rules: [ ... ] }                         (journey trigger)
// normalizeGate() turns either into a group.

export const MAX_DEPTH = 5;
export const MAX_NODES = 60;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Any supported shape → a group node (or null when there are no conditions to apply). */
export function normalizeGate(input, match = 'all') {
    if (input === undefined || input === null) return null;
    if (isObj(input) && (input.type === 'group' || input.type === 'rule')) return input.type === 'rule' ? { type: 'group', op: 'and', children: [input] } : input;
    const asGroup = (rules, m) => ({
        type: 'group', op: m === 'any' ? 'or' : 'and',
        children: rules.map(r => (isObj(r) && r.type === 'group' ? r : { type: 'rule', field: r.field, operator: r.operator, value: r.value })),
    });
    if (Array.isArray(input)) return asGroup(input, match);
    if (isObj(input) && Array.isArray(input.rules)) return asGroup(input.rules, input.match);
    return null;
}

/** Evaluate a gate. leaf(rule) decides one rule; the group logic is identical everywhere. */
export function evaluateGate(node, leaf, depth = 0) {
    if (!node) return true;
    if (depth > MAX_DEPTH + 3) return false;                 // a runaway saved tree never passes
    if (node.type === 'rule') return !!leaf(node);
    if (node.type !== 'group') return false;
    const kids = Array.isArray(node.children) ? node.children : [];
    const test = (k) => evaluateGate(k, leaf, depth + 1);
    switch (node.op) {
        case 'or': return kids.some(test);
        case 'not': return !(kids.length === 0 ? true : kids.every(test));
        case 'and':
        default: return kids.every(test);
    }
}

/** Problems with a gate as text, for the API to refuse a bad save. ruleCheck(rule, n) returns a message or null. */
export function checkGate(node, ruleCheck) {
    const errs = [];
    let nodes = 0;
    const walk = (n, depth, path) => {
        if (errs.length >= 10) return;
        if (++nodes > MAX_NODES) { errs.push(`too many conditions (up to ${MAX_NODES})`); return; }
        if (depth > MAX_DEPTH) { errs.push(`conditions are nested too deeply (up to ${MAX_DEPTH} levels)`); return; }
        if (!isObj(n)) { errs.push(`${path}: not a condition`); return; }
        if (n.type === 'rule') { const m = ruleCheck(n, path); if (m) errs.push(`${path}: ${m}`); return; }
        if (n.type !== 'group') { errs.push(`${path}: unknown node type`); return; }
        if (!['and', 'or', 'not'].includes(n.op)) { errs.push(`${path}: group must be and, or or not`); return; }
        if (!Array.isArray(n.children)) { errs.push(`${path}: group needs a list of conditions`); return; }
        n.children.forEach((c, i) => walk(c, depth + 1, `${path}.${i + 1}`));
    };
    walk(node, 0, 'conditions');
    return errs;
}

/** Plain-language summary: (Budget ≥ 5000000 AND (Source is Referral OR …)). label(field) maps names to labels. */
export function describeGate(node, label = (f) => f, opText = (o) => o) {
    if (!node) return '';
    if (node.type === 'rule') return `${label(node.field)} ${opText(node.operator)}${node.value !== undefined && node.value !== '' ? ` ${node.value}` : ''}`;
    const kids = (node.children || []).map(k => describeGate(k, label, opText)).filter(Boolean);
    if (node.op === 'not') return `NOT (${kids.join(' AND ')})`;
    const j = kids.join(node.op === 'or' ? ' OR ' : ' AND ');
    return kids.length > 1 ? `(${j})` : j;
}
