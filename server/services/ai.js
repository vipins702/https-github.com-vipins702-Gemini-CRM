import { GEMINI_API_KEY, GEMINI_MODEL } from '../config.js';

const GEMINI_URL = (model) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export function isAIEnabled() {
    return !!GEMINI_API_KEY;
}

/** Strip ```json fences and parse, tolerating extra prose around the JSON. */
function parseJsonLoose(text) {
    if (!text) return null;
    let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        t = t.slice(start, end + 1);
    }
    try {
        return JSON.parse(t);
    } catch (e) {
        return null;
    }
}

/**
 * Generate a "next best action" insight for a customer using Gemini.
 * @param {object} ctx  Customer context (name, industry, status, ltv, openCases, pendingLeads, ownedProducts[], risk)
 * @returns {Promise<{title,description,action,source}|null>}  null when AI is unavailable (caller falls back)
 */
export async function generateCustomerInsight(ctx = {}) {
    if (!isAIEnabled()) return null;

    const owned = Array.isArray(ctx.ownedProducts) ? ctx.ownedProducts.join(', ') : 'none';
    const prompt = [
        'You are a CRM relationship-intelligence assistant for a B2B/retail account team.',
        'Given the customer profile below, return the single best next action.',
        'Respond ONLY with strict JSON: {"title": string (max 6 words), "description": string (max 280 chars, specific and actionable), "action": string (max 4 words, an imperative button label)}.',
        '',
        'Customer profile:',
        `- Name: ${ctx.name || 'Unknown'}`,
        `- Industry: ${ctx.industry || 'Unknown'}`,
        `- Status: ${ctx.status || 'Unknown'}`,
        `- Lifetime value: ${ctx.ltv != null ? ctx.ltv : 'Unknown'}`,
        `- Open support cases: ${ctx.openCases ?? 0}`,
        `- Pending leads/opportunities: ${ctx.pendingLeads ?? 0}`,
        `- Risk level: ${ctx.risk || 'Unknown'}`,
        `- Products owned: ${owned}`,
        `- Tenure: ${ctx.tenure || 'Unknown'}`,
    ].join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
        const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.5, maxOutputTokens: 256, responseMimeType: 'application/json' },
            }),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error(`[ai] Gemini API error ${res.status}: ${errText.slice(0, 200)}`);
            return null;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = parseJsonLoose(text);
        if (!parsed || !parsed.title) return null;

        return {
            title: String(parsed.title).slice(0, 60),
            description: String(parsed.description || '').slice(0, 320),
            action: String(parsed.action || 'Take Action').slice(0, 30),
            source: 'gemini',
        };
    } catch (error) {
        if (error.name === 'AbortError') console.error('[ai] Gemini request timed out');
        else console.error('[ai] Gemini request failed:', error.message);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Classify what a caller/message wants: support (problem with existing product) vs sales
 * (interested in a new product/service). Also best-effort extracts the product mentioned.
 * @returns {Promise<{intent:'support'|'sales', product:string, reason:string, source:string}>}
 */
export async function classifyCallIntent(text, defaultIntent = 'support') {
    const fallback = () => {
        const t = String(text || '').toLowerCase();
        const supportWords = ['issue', 'problem', 'not working', 'broken', 'complaint', 'error', 'help', 'support', 'refund', 'cancel', 'fix', 'fault', 'failed', 'down'];
        const salesWords = ['buy', 'purchase', 'new', 'interested', 'pricing', 'price', 'quote', 'upgrade', 'plan', 'subscribe', 'add', 'another', 'demo', 'service'];
        const isSupport = supportWords.some(w => t.includes(w));
        const isSales = salesWords.some(w => t.includes(w));
        const intent = isSupport && !isSales ? 'support' : isSales && !isSupport ? 'sales' : defaultIntent;
        return { intent, product: '', reason: 'Keyword-based classification.', source: 'rule' };
    };
    if (!isAIEnabled() || !text) return fallback();

    const prompt = [
        'A customer contacted us. Decide what they want and respond ONLY with strict JSON:',
        '{"intent": "support" | "sales", "product": string, "reason": string (max 120 chars)}',
        '"support" = a problem/complaint/help with something they ALREADY have → becomes a support Case.',
        '"sales" = interested in a NEW product or service → becomes a sales Opportunity.',
        '"product" = the product/service mentioned (empty string if none).',
        '',
        `Message/transcript: "${String(text).slice(0, 800)}"`,
    ].join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 150, responseMimeType: 'application/json' } }),
        });
        if (!res.ok) return fallback();
        const data = await res.json();
        const parsed = parseJsonLoose(data?.candidates?.[0]?.content?.parts?.[0]?.text);
        if (!parsed || (parsed.intent !== 'support' && parsed.intent !== 'sales')) return fallback();
        return { intent: parsed.intent, product: String(parsed.product || '').slice(0, 60), reason: String(parsed.reason || '').slice(0, 140), source: 'gemini' };
    } catch (e) {
        return fallback();
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Suggest the next-best product to upsell to a customer.
 * @returns {Promise<{product:string, reason:string, source:string}>} always returns something (rule-based fallback)
 */
export async function generateUpsellSuggestion(ctx = {}) {
    const owned = Array.isArray(ctx.ownedProducts) ? ctx.ownedProducts : [];
    // Rule-based fallback (used when AI disabled/fails)
    const fallback = () => {
        const catalog = ['Premium Support Plan', 'Insurance Add-on', 'Investment Advisory', 'Annual Maintenance Contract'];
        const ownedLc = owned.map(o => String(o).toLowerCase());
        const pick = catalog.find(c => !ownedLc.some(o => c.toLowerCase().includes(o.split(' ')[0]))) || catalog[0];
        return { product: pick, reason: 'Recommended based on current holdings and engagement.', source: 'rule' };
    };

    if (!isAIEnabled()) return fallback();

    const prompt = [
        'You are a CRM cross-sell assistant. Suggest the single best next product to offer this customer.',
        'Respond ONLY with strict JSON: {"product": string (max 5 words), "reason": string (max 200 chars)}.',
        `Customer: ${ctx.name || 'Unknown'}, industry: ${ctx.industry || 'Unknown'}, lifetime value: ${ctx.ltv ?? 'Unknown'}.`,
        `Products already owned: ${owned.length ? owned.join(', ') : 'none'}.`,
        'Do not suggest a product they already own.',
    ].join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 200, responseMimeType: 'application/json' } }),
        });
        if (!res.ok) return fallback();
        const data = await res.json();
        const parsed = parseJsonLoose(data?.candidates?.[0]?.content?.parts?.[0]?.text);
        if (!parsed || !parsed.product) return fallback();
        return { product: String(parsed.product).slice(0, 60), reason: String(parsed.reason || '').slice(0, 220), source: 'gemini' };
    } catch (e) {
        return fallback();
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Normalize a messy inbound lead payload into clean structured fields using Gemini.
 * Returns null when AI is unavailable (caller falls back to raw mapping).
 */
export async function generateLeadNormalization(payload = {}) {
    if (!isAIEnabled()) return null;

    const prompt = [
        'You are a data-cleaning assistant for a CRM lead-capture pipeline.',
        'Given the raw inbound data below, extract a clean lead record.',
        'Respond ONLY with strict JSON using these keys (omit a key if unknown):',
        '{"firstName": string, "lastName": string, "email": string, "phone": string, "company": string, "title": string, "website": string, "location": string, "notes": string}',
        'Normalize casing (proper case names), trim whitespace, and format phone/email sensibly. Do not invent data.',
        '',
        'Raw data (JSON):',
        JSON.stringify(payload).slice(0, 4000),
    ].join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 256, responseMimeType: 'application/json' },
            }),
        });
        if (!res.ok) {
            console.error(`[ai] Lead normalization error ${res.status}`);
            return null;
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = parseJsonLoose(text);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        console.error('[ai] Lead normalization failed:', error.message);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
