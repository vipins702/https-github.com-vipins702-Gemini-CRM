import React, { useMemo } from 'react';
import { SearchSelect, SelectOption } from './SearchSelect';
import { AddressValue, COUNTRIES, asAddress, countryByIso, countryByName, defaultCountryIso, postalLabel, stateLabel, statesOf } from '../../services/countries';

interface Props {
  value: unknown;
  onChange: (value: AddressValue | '') => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}

const COUNTRY_OPTIONS: SelectOption[] = COUNTRIES.map(c => ({ value: c.iso, label: c.name }));

const Label: React.FC<{ htmlFor: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-1">{children}</label>
);

/**
 * An address in its parts (street, city, state, postal code, country) instead of one box where everything is typed.
 * The state is a list for India and the US, and the postal code is checked as a hint (6 digits for India).
 * Older records that hold the address as one piece of text show it in the first line, untouched.
 */
export const AddressInput: React.FC<Props> = ({ value, onChange, disabled, invalid, id = 'addr' }) => {
  const a = useMemo(() => asAddress(value), [value]);
  const iso = a.countryCode || countryByName(a.country)?.iso || defaultCountryIso();
  const states = statesOf(iso);
  const set = (patch: Partial<AddressValue>) => {
    const next: AddressValue = { ...a, ...patch };
    // The country is part of the address as soon as anything else is written.
    if (!next.countryCode) { next.countryCode = iso; next.country = countryByIso(iso)?.name; }
    const filled = Object.entries(next).some(([k, v]) => k !== 'country' && k !== 'countryCode' && String(v ?? '').trim());
    onChange(filled ? next : '');
  };
  const pin = (a.postalCode || '').trim();
  const pinOdd = iso === 'IN' && pin !== '' && !/^\d{6}$/.test(pin);

  return (
    <div className="space-y-3" role="group" aria-label="Address">
      <div>
        <Label htmlFor={`${id}-1`}>Address line 1</Label>
        <input id={`${id}-1`} value={a.line1 || ''} disabled={disabled} aria-invalid={invalid || undefined} autoComplete="address-line1" placeholder="House / building, street" onChange={e => set({ line1: e.target.value })} />
      </div>
      <div>
        <Label htmlFor={`${id}-2`}>Address line 2 <span className="normal-case font-normal">(optional)</span></Label>
        <input id={`${id}-2`} value={a.line2 || ''} disabled={disabled} autoComplete="address-line2" placeholder="Area, landmark" onChange={e => set({ line2: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${id}-city`}>City</Label>
          <input id={`${id}-city`} value={a.city || ''} disabled={disabled} autoComplete="address-level2" onChange={e => set({ city: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${id}-state`}>{stateLabel(iso)}</Label>
          {states ? (
            <SearchSelect id={`${id}-state`} ariaLabel={stateLabel(iso)} disabled={disabled} value={a.state || ''} emptyLabel="— None —" placeholder="Select…"
              options={states.map(s => ({ value: s, label: s }))} onChange={v => set({ state: v })} />
          ) : (
            <input id={`${id}-state`} value={a.state || ''} disabled={disabled} autoComplete="address-level1" onChange={e => set({ state: e.target.value })} />
          )}
        </div>
        <div>
          <Label htmlFor={`${id}-pin`}>{postalLabel(iso)}</Label>
          <input id={`${id}-pin`} value={a.postalCode || ''} disabled={disabled} inputMode={iso === 'IN' || iso === 'US' ? 'numeric' : 'text'} autoComplete="postal-code" aria-invalid={pinOdd || undefined}
            maxLength={12} onChange={e => set({ postalCode: e.target.value })} />
          {pinOdd && <p className="text-xs text-amber-700 mt-1">PIN codes have 6 digits.</p>}
        </div>
        <div>
          <Label htmlFor={`${id}-country`}>Country</Label>
          <SearchSelect id={`${id}-country`} ariaLabel="Country" disabled={disabled} value={iso} options={COUNTRY_OPTIONS}
            onChange={v => set({ countryCode: v, country: countryByIso(v)?.name, state: statesOf(v) ? '' : a.state })} />
        </div>
      </div>
    </div>
  );
};
