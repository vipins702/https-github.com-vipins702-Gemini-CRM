// Values that can be filled in when a trigger or journey sets a field or writes a message:
//   {fieldName}   the record's value of that field          e.g. "Hello {firstName}"
//   {today}       today's date, YYYY-MM-DD
//   {today+3}     three days from today   ({today-7}: a week ago)
//   {now}         the current date and time (ISO)
// A token that names no field gives an empty value. Nothing here is ever evaluated as code.

const TOKEN = /\{([A-Za-z_]\w*)(?:([+-])(\d{1,5}))?\}/g;

export function expandTokens(text, data = {}, now = new Date()) {
    return String(text ?? '').replace(TOKEN, (whole, name, sign, n) => {
        if (name === 'today') {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            if (sign) d.setUTCDate(d.getUTCDate() + (sign === '-' ? -1 : 1) * Number(n));
            return d.toISOString().slice(0, 10);
        }
        if (sign) return whole;                                  // "{field+3}" is not a token
        if (name === 'now') return now.toISOString();
        const v = data[name];
        return v === undefined || v === null ? '' : String(v);
    });
}

/** Names a template refers to (for save-time checks): { fields: [...], dates: ['today+3'] }. */
export function tokensIn(text) {
    const fields = new Set();
    for (const m of String(text ?? '').matchAll(TOKEN)) {
        const [, name, sign] = m;
        if (name === 'today' || name === 'now' || sign) continue;
        fields.add(name);
    }
    return [...fields];
}
