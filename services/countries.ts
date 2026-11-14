// Countries, dial codes and states for the phone and address inputs.
// Names come from the browser (Intl.DisplayNames), so they follow the user's language and stay current.

/** ISO code -> international dial code (the "+" is added when a number is written). */
const DIAL: Record<string, string> = Object.fromEntries(
  ('AF93 AL355 DZ213 AS1684 AD376 AO244 AI1264 AG1268 AR54 AM374 AW297 AU61 AT43 AZ994 BS1242 BH973 BD880 BB1246 BY375 BE32 BZ501 BJ229 BM1441 BT975 BO591 BA387 BW267 BR55 IO246 VG1284 BN673 BG359 BF226 BI257 KH855 CM237 CA1 CV238 KY1345 CF236 TD235 CL56 CN86 CO57 KM269 CK682 CR506 HR385 CU53 CW599 CY357 CZ420 CD243 DK45 DJ253 DM1767 DO1809 EC593 EG20 SV503 GQ240 ER291 EE372 SZ268 ET251 FK500 FO298 FJ679 FI358 FR33 GF594 PF689 GA241 GM220 GE995 DE49 GH233 GI350 GR30 GL299 GD1473 GP590 GU1671 GT502 GN224 GW245 GY592 HT509 HN504 HK852 HU36 IS354 IN91 ID62 IR98 IQ964 IE353 IL972 IT39 CI225 JM1876 JP81 JO962 KZ7 KE254 KI686 XK383 KW965 KG996 LA856 LV371 LB961 LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 MQ596 MR222 MU230 YT262 MX52 FM691 MD373 MC377 MN976 ME382 MS1664 MA212 MZ258 MM95 NA264 NR674 NP977 NL31 NC687 NZ64 NI505 NE227 NG234 NU683 KP850 MK389 MP1670 NO47 OM968 PK92 PW680 PS970 PA507 PG675 PY595 PE51 PH63 PL48 PT351 PR1787 QA974 CG242 RE262 RO40 RU7 RW250 WS685 SM378 ST239 SA966 SN221 RS381 SC248 SL232 SG65 SX1721 SK421 SI386 SB677 SO252 ZA27 KR82 SS211 ES34 LK94 KN1869 LC1758 VC1784 SD249 SR597 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 TL670 TG228 TK690 TO676 TT1868 TN216 TR90 TM993 TC1649 TV688 UG256 UA380 AE971 GB44 US1 UY598 UZ998 VU678 VA379 VE58 VN84 YE967 ZM260 ZW263')
    .split(' ').map(s => [s.slice(0, 2), s.slice(2)]),
);

export interface Country { iso: string; name: string; dial: string }

const regionNames = (() => {
  try { return new (Intl as any).DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();
const nameOf = (iso: string): string => { try { return regionNames?.of(iso) || iso; } catch { return iso; } };

/** The people who use the product most, listed first. */
const COMMON = ['IN', 'US', 'GB', 'AE', 'SG', 'AU', 'CA'];

export const COUNTRIES: Country[] = (() => {
  const all = Object.entries(DIAL).map(([iso, dial]) => ({ iso, name: nameOf(iso), dial }));
  const common = COMMON.map(i => all.find(c => c.iso === i)!).filter(Boolean);
  const rest = all.filter(c => !COMMON.includes(c.iso)).sort((a, b) => a.name.localeCompare(b.name));
  return [...common, ...rest];
})();

export const countryByIso = (iso?: string): Country | undefined => COUNTRIES.find(c => c.iso === (iso || '').toUpperCase());
export const countryByName = (name?: string): Country | undefined => {
  const n = (name || '').trim().toLowerCase();
  return n ? COUNTRIES.find(c => c.name.toLowerCase() === n || c.iso.toLowerCase() === n) : undefined;
};

// The workspace's own country (Settings), else what its locale / currency say, else the browser, else India.
let workspaceIso: string | null = null;
const CURRENCY_HOME: Record<string, string> = { INR: 'IN', USD: 'US', GBP: 'GB', AED: 'AE', SGD: 'SG', AUD: 'AU', CAD: 'CA', NZD: 'NZ', ZAR: 'ZA', JPY: 'JP', CNY: 'CN', SAR: 'SA', QAR: 'QA', KWD: 'KW', MYR: 'MY', PKR: 'PK', BDT: 'BD', LKR: 'LK', NPR: 'NP' };
const regionOf = (locale?: string | null): string | undefined => { try { return locale ? new Intl.Locale(locale).region : undefined; } catch { return undefined; } };

/** Called when the workspace settings load: new phone numbers and addresses then start in the right country. */
export function setWorkspaceCountry(country?: string | null, currency?: string | null, locale?: string | null): void {
  const fromLocale = regionOf(locale);
  workspaceIso = countryByName(country || '')?.iso
    || (fromLocale && DIAL[fromLocale] ? fromLocale : undefined)
    || (currency ? CURRENCY_HOME[currency.toUpperCase()] : undefined)
    || null;
}

/** The country to start from. */
export const defaultCountryIso = (): string => {
  if (workspaceIso) return workspaceIso;
  const region = regionOf(typeof navigator !== 'undefined' ? navigator.language : undefined);
  return region && DIAL[region] ? region : 'IN';
};

// Longest dial code first, so +1787 (Puerto Rico) wins over +1 and +971 over +9.
const BY_DIAL_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * Split a stored phone value into country and national number.
 * "+91 98765 43210", "09876543210" and "9876543210" all give { iso: 'IN', national: '9876543210' }.
 */
export function splitPhone(value: unknown, fallbackIso = defaultCountryIso()): { iso: string; national: string; known: boolean } {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { iso: fallbackIso, national: '', known: true };
  const fb = countryByIso(fallbackIso) || countryByIso('IN')!;
  if (raw.startsWith('+') || raw.startsWith('00')) {
    const d = raw.startsWith('00') ? digits.slice(2) : digits;
    const hit = BY_DIAL_LENGTH.find(c => d.startsWith(c.dial) && d.length > c.dial.length);
    if (hit) {
      // +1 belongs to the US unless the browser's own country shares the code (Canada)
      const iso = hit.dial === '1' && fb.dial === '1' ? fb.iso : hit.dial === '91' ? 'IN' : hit.iso;
      return { iso, national: d.slice(hit.dial.length), known: true };
    }
    return { iso: fb.iso, national: d, known: false };
  }
  // No "+": a trunk "0", or the country's own code written in front, or just the number
  if (digits.startsWith('0')) return { iso: fb.iso, national: digits.replace(/^0+/, ''), known: true };
  if (digits.startsWith(fb.dial) && digits.length - fb.dial.length >= 8 && digits.length > 10) return { iso: fb.iso, national: digits.slice(fb.dial.length), known: true };
  return { iso: fb.iso, national: digits, known: true };
}

/** "+" + dial code + national digits, or '' when there is no number. */
export function joinPhone(iso: string, national: string): string {
  const d = String(national ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const c = countryByIso(iso);
  return d && c ? `+${c.dial}${d}` : '';
}

/** How a number reads on screen: "+91 98765 43210". */
export function formatPhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const { iso, national, known } = splitPhone(raw);
  const c = countryByIso(iso);
  if (!known || !c || !national) return raw;
  const grouped = iso === 'IN' && national.length === 10 ? `${national.slice(0, 5)} ${national.slice(5)}` : national.replace(/(\d{3,4})(?=\d)/g, '$1 ').trim();
  return `+${c.dial} ${grouped}`;
}

/** Digit counts that are possible for a national number (a hint, never a block). */
export const phoneLengthOk = (iso: string, national: string): boolean => {
  const n = national.replace(/\D/g, '').length;
  if (!n) return true;
  if (iso === 'IN') return n === 10;
  return n >= 6 && n <= 14;
};

export const INDIA_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

/** A structured address as stored. */
export interface AddressValue { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string; countryCode?: string }

/** Older records hold the whole address as one piece of text; it becomes line 1. */
export const asAddress = (v: unknown): AddressValue => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as AddressValue;
  const t = String(v ?? '').trim();
  return t ? { line1: t } : {};
};

/** One line for lists and detail pages: "12 MG Road, Pune, Maharashtra 411001, India". */
export const formatAddress = (v: unknown): string => {
  const a = asAddress(v);
  const region = [a.state, a.postalCode].filter(Boolean).join(' ');
  return [a.line1, a.line2, a.city, region, a.country].map(x => String(x ?? '').trim()).filter(Boolean).join(', ');
};

export const postalLabel = (iso?: string) => (iso === 'US' ? 'ZIP code' : iso === 'IN' ? 'PIN code' : iso === 'GB' ? 'Postcode' : 'Postal code');
export const stateLabel = (iso?: string) => (iso === 'US' ? 'State' : iso === 'IN' ? 'State / UT' : 'State / region');
export const statesOf = (iso?: string): string[] | null => (iso === 'IN' ? INDIA_STATES : iso === 'US' ? US_STATES : null);
