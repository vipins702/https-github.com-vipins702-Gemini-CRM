import test from 'node:test';
import assert from 'node:assert';
import { normalizePhoneE164 } from './phone.js';

test('normalizePhoneE164', async (t) => {
    await t.test('formats US numbers with + prefix', () => {
        assert.strictEqual(normalizePhoneE164('+1 415 555 2671'), '+14155552671');
    });

    await t.test('assumes US default and formats correctly', () => {
        assert.strictEqual(normalizePhoneE164('415-555-2671'), '+14155552671');
        assert.strictEqual(normalizePhoneE164('(415) 555-2671'), '+14155552671');
    });

    await t.test('handles non-US default country (IN)', () => {
        assert.strictEqual(normalizePhoneE164('9876543210', 'IN'), '+919876543210');
        assert.strictEqual(normalizePhoneE164('09876543210', 'IN'), '+919876543210');
    });

    await t.test('handles explicit country codes bypassing default', () => {
        assert.strictEqual(normalizePhoneE164('+44 20 7123 1234', 'US'), '+442071231234');
    });

    await t.test('falls back to stripping non-digits if parsing fails but number looks weird', () => {
        assert.strictEqual(normalizePhoneE164('123'), '123'); // Too short to be valid E.164, so fallback fires
        assert.strictEqual(normalizePhoneE164('+invalid-1234'), '+1234');
    });

    await t.test('handles empty or invalid inputs', () => {
        assert.strictEqual(normalizePhoneE164(''), null);
        assert.strictEqual(normalizePhoneE164(null), null);
        assert.strictEqual(normalizePhoneE164('   '), null);
        assert.strictEqual(normalizePhoneE164('abcd'), null);
    });
});
