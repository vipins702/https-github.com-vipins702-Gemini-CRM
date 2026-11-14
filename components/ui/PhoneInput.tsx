import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SearchSelect, SelectOption } from './SearchSelect';
import { COUNTRIES, countryByIso, defaultCountryIso, joinPhone, phoneLengthOk, splitPhone } from '../../services/countries';

interface Props {
  /** The stored number, e.g. "+919876543210" (older records may hold "98765 43210" or "+91 98765 43210"). */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  ariaLabel?: string;
  required?: boolean;
}

const OPTIONS: SelectOption[] = COUNTRIES.map(c => ({ value: c.iso, label: c.name, hint: `+${c.dial}` }));

const groupIndia = (d: string) => (d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5, 10)}` : d);

/**
 * A phone number as two parts: the country (with its dial code, searchable) and then the number.
 * It stores one value, "+" + dial code + digits, which is what WhatsApp and calling need, and what the duplicate
 * check compares. Typing a full number with "+" or pasting "+91 98765 43210" into the number box is understood.
 */
export const PhoneInput: React.FC<Props> = ({ value, onChange, onBlur, disabled, invalid, id, ariaLabel = 'Phone number', required }) => {
  const parsed = useMemo(() => splitPhone(value), [value]);
  const [iso, setIso] = useState(parsed.iso);
  const [text, setText] = useState(parsed.national);
  const last = useRef(value);

  // A value that arrives from outside (another record opened, a reset) replaces what is shown.
  useEffect(() => {
    if (value !== last.current) { last.current = value; const p = splitPhone(value); setIso(p.iso); setText(p.national); }
  }, [value]);

  const emit = (nextIso: string, nextText: string) => {
    const v = joinPhone(nextIso, nextText);
    last.current = v;
    onChange(v);
  };

  const country = countryByIso(iso) || countryByIso(defaultCountryIso())!;
  const shown = iso === 'IN' ? groupIndia(text.replace(/\D/g, '')) : text;
  const digits = text.replace(/\D/g, '');
  const odd = !phoneLengthOk(iso, digits);

  const onType = (raw: string) => {
    // "+44 20 7946 0958" or "0091 ..." pasted into the number box: take the country from it.
    if (/^\s*(\+|00)/.test(raw)) {
      const p = splitPhone(raw.trim(), iso);
      if (p.known) { setIso(p.iso); setText(p.national); emit(p.iso, p.national); return; }
    }
    const d = raw.replace(/\D/g, '').slice(0, 15);
    setText(d); emit(iso, d);
  };

  return (
    <div>
      <div className={`flex items-stretch rounded-[var(--r-lg)] border bg-surface transition-[border-color,box-shadow] ${invalid ? 'border-red-400' : 'border-slate-200 hover:border-slate-300'} focus-within:border-accent focus-within:shadow-[0_0_0_4px_rgb(var(--accent-500)/0.18)] ${disabled ? 'opacity-60' : ''}`}>
        <div className="shrink-0 border-r border-slate-200 rounded-l-[inherit]">
          <SearchSelect
            variant="inline" options={OPTIONS} value={iso} disabled={disabled} ariaLabel="Country code" listWidth={300}
            onChange={v => { setIso(v); emit(v, text); }}
            renderValue={() => <span className="flex items-center gap-1.5 tnum"><span className="text-[11px] font-semibold text-ink-muted bg-slate-100 rounded px-1 py-px">{country.iso}</span>+{country.dial}</span>}
          />
        </div>
        <input
          id={id} type="tel" inputMode="tel" autoComplete="tel-national" disabled={disabled} required={required}
          aria-label={ariaLabel} aria-invalid={invalid || undefined} aria-describedby={odd ? `${id || 'phone'}-hint` : undefined}
          value={shown} onChange={e => onType(e.target.value)} onBlur={onBlur}
          placeholder={iso === 'IN' ? '98765 43210' : 'Phone number'}
          className="!border-0 !shadow-none !bg-transparent !rounded-l-none flex-1 min-w-0 tnum"
        />
      </div>
      {odd && <p id={`${id || 'phone'}-hint`} className="text-xs text-amber-700 mt-1">{iso === 'IN' ? 'Indian mobile numbers have 10 digits.' : 'This number looks too short or too long.'}</p>}
      {!parsed.known && <p className="text-xs text-ink-muted mt-1">Country not recognised; choose it above.</p>}
    </div>
  );
};
