import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption { value: string; label: string; /** Shown to the right and searched too (a dial code, a code). */ hint?: string }

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
  id?: string;
  /** 'field' looks like a text box; 'inline' sits inside another control (the phone input). */
  variant?: 'field' | 'inline';
  /** What the closed control shows for the chosen option (default: its label). */
  renderValue?: (o: SelectOption | undefined) => React.ReactNode;
  /** Offer a "nothing chosen" row at the top. */
  emptyLabel?: string;
  /** Pixel width of the list (default: as wide as the control, at least 240). */
  listWidth?: number;
}

/**
 * A select you can type into. Long lists (countries, lookup values, people) are searchable, the list is drawn above
 * the page so a card or a modal never clips it, and it works with the keyboard (arrows, Enter, Escape).
 */
export const SearchSelect: React.FC<Props> = ({ options, value, onChange, placeholder = 'Select…', disabled, invalid, ariaLabel, id, variant = 'field', renderValue, emptyLabel, listWidth }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement | null>(null);
  // The search box is drawn a moment after the list opens, so it takes focus when it appears.
  const attachSearch = useCallback((el: HTMLInputElement | null) => { search.current = el; if (el) el.focus({ preventScroll: true }); }, []);
  const uid = useId();

  const rows: SelectOption[] = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = t ? options.filter(o => o.label.toLowerCase().includes(t) || (o.hint || '').toLowerCase().includes(t) || o.value.toLowerCase() === t) : options;
    return emptyLabel && !t ? [{ value: '', label: emptyLabel }, ...hit] : hit;
  }, [options, q, emptyLabel]);
  const chosen = options.find(o => o.value === value);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(listWidth || 0, r.width, 240);
    const roomBelow = window.innerHeight - r.bottom, up = roomBelow < 280 && r.top > roomBelow;
    setBox({ left: Math.min(r.left, Math.max(8, window.innerWidth - width - 8)), top: up ? r.top - 4 : r.bottom + 4, width, up });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    setQ(''); setActive(Math.max(0, options.findIndex(o => o.value === value) + (emptyLabel ? 1 : 0)));
    const close = (e: Event) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const move = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', move);
    window.addEventListener('scroll', move, true);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('resize', move); window.removeEventListener('scroll', move, true); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open]);

  const pick = (o: SelectOption | undefined) => { if (!o) return; onChange(o.value); setOpen(false); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(rows[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const closed = variant === 'inline'
    ? 'h-full px-2.5 gap-1.5 rounded-l-[inherit] hover:bg-slate-100/70 focus-visible:bg-slate-100'
    : `w-full px-3.5 py-2.5 gap-2 rounded-[var(--r-lg)] border bg-surface text-left ${invalid ? 'border-red-400' : 'border-slate-200 hover:border-slate-300'} focus-visible:border-accent`;

  return (
    <>
      <button
        ref={btn} id={id} type="button" disabled={disabled}
        role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? `${uid}-list` : undefined} aria-label={ariaLabel} aria-invalid={invalid || undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); } }}
        className={`inline-flex items-center justify-between text-[0.9375rem] leading-snug text-ink transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${closed}`}
      >
        <span className={`truncate ${!chosen && !renderValue ? 'text-ink-muted' : ''}`}>{renderValue ? renderValue(chosen) : (chosen?.label || placeholder)}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && box && createPortal(
        <div
          ref={list} id={`${uid}-list`} role="listbox" aria-label={ariaLabel}
          style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, transform: box.up ? 'translateY(-100%)' : undefined, zIndex: 1000 }}
          className="bg-surface border border-slate-200 rounded-2xl shadow-[var(--elev-pop)] overflow-hidden"
        >
          <div className="relative border-b border-slate-100">
            <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              ref={attachSearch} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey}
              placeholder="Search…" aria-label="Search the list" aria-activedescendant={rows[active] ? `${uid}-o${active}` : undefined}
              className="!border-0 !shadow-none !rounded-none !bg-transparent !pl-10 !py-3 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {rows.length === 0 ? <p className="px-4 py-6 text-center text-sm text-ink-muted">Nothing matches “{q}”.</p> : rows.map((o, i) => (
              <div
                key={o.value + i} id={`${uid}-o${i}`} role="option" aria-selected={o.value === value} data-active={i === active}
                onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm cursor-pointer ${i === active ? 'bg-accent/[0.08]' : ''} ${o.value === value ? 'font-semibold text-accent-deep' : 'text-ink'}`}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-xs text-ink-muted tnum shrink-0">{o.hint}</span>}
                {o.value === value && <Check className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
