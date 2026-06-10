/**
 * Multi-currency support for the CRM.
 *
 * - A comprehensive currency catalog (code, symbol, name) covering all major markets.
 * - Locale-aware formatting via Intl.NumberFormat (handles grouping, decimals, symbol
 *   placement per the active locale automatically).
 * - A module-level "active currency" driven by SystemSettings.defaultCurrency, so every
 *   currency field renders in the tenant's chosen currency by default. Individual records
 *   may override via a per-record currency code.
 */

export interface CurrencyInfo {
  code: string;   // ISO 4217, e.g. "USD"
  symbol: string; // display symbol, e.g. "$"
  name: string;   // human label
}

// Curated catalog of the world's commonly transacted currencies.
export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal' },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar' },
  { code: 'OMR', symbol: '﷼', name: 'Omani Rial' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'ARS', symbol: '$', name: 'Argentine Peso' },
  { code: 'CLP', symbol: '$', name: 'Chilean Peso' },
  { code: 'COP', symbol: '$', name: 'Colombian Peso' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Złoty' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Đồng' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
  { code: 'NPR', symbol: 'रू', name: 'Nepalese Rupee' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
];

// Currencies that conventionally have no minor units (no decimals).
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'IDR', 'HUF']);

let activeCurrency = 'USD';
let activeLocale: string | undefined;

/** Apply the tenant default currency + optional locale (called from applySettings). */
export function setActiveCurrency(code?: string | null, locale?: string | null): void {
  if (code) activeCurrency = code;
  activeLocale = locale || undefined;
}

export function getActiveCurrency(): string {
  return activeCurrency;
}

export function getCurrencyInfo(code = activeCurrency): CurrencyInfo {
  return CURRENCIES.find(c => c.code === code) || { code, symbol: code, name: code };
}

export function getCurrencySymbol(code = activeCurrency): string {
  return getCurrencyInfo(code).symbol;
}

/**
 * Format a numeric amount as currency. Uses the active (tenant) currency + locale unless
 * an explicit code/locale is given. Falls back to a symbol-prefixed number if Intl rejects
 * the code (e.g. an unknown ISO code).
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  code: string = activeCurrency,
  locale: string | undefined = activeLocale,
): string {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const fractionDigits = ZERO_DECIMAL.has(code) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    }).format(safe);
  } catch {
    return `${getCurrencySymbol(code)}${safe.toLocaleString(locale)}`;
  }
}
