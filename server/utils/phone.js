import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normalizes a phone number to E.164 format.
 * Falls back to strict digits-only if parsing fails.
 * 
 * @param {string} phone The raw phone number string
 * @param {string} defaultCountry The ISO country code (e.g. 'US', 'IN') to assume if there is no '+' prefix. Default 'US'.
 * @returns {string|null} E.164 string (e.g. '+14155552671') or null if empty/invalid.
 */
export function normalizePhoneE164(phone, defaultCountry = 'US') {
    if (!phone || typeof phone !== 'string') return null;
    const raw = phone.trim();
    if (!raw) return null;

    const phoneNumber = parsePhoneNumberFromString(raw, defaultCountry);
    if (phoneNumber && phoneNumber.isValid()) {
        return phoneNumber.format('E.164');
    }

    // Fallback: strip all non-digits, keep leading '+' if it was there
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 0) return null;
    if (raw.startsWith('+')) return '+' + digits;
    
    return digits;
}
