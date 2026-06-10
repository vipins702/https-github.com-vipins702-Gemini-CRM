import React, { useEffect, useRef, useState } from 'react';
import { Search, ChevronRight, X, Loader2, CornerDownLeft } from 'lucide-react';
import { ViewState, EntityDefinition } from '../types';
import { api } from '../services/api';

interface TopBarProps {
  currentView: ViewState;
  schemas: Record<string, EntityDefinition>;
  onNavigate: (view: ViewState, params?: any) => void;
}

interface SearchResult {
  id: string;
  entityType: string;
  primaryDisplay: string;
  status?: string;
}

const STATIC_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  settings: 'Settings',
  'customer-360': 'Customer 360',
  'lead-rules': 'Lead Rules',
  autoflow: 'Journeys',
  layout: 'Form Designer',
  'web-presenter': 'Web Presenter',
  users: 'Users & Roles',
  campaigns: 'Campaigns',
  'object-manager': 'Object Manager',
  'menu-manager': 'Menu Builder',
  lookups: 'Lookup Manager',
};

export const TopBar: React.FC<TopBarProps> = ({ currentView, schemas, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const viewLabel = (v: string) =>
    STATIC_LABELS[v] || schemas[v]?.pluralLabel || schemas[v]?.label || v;

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.globalSearch(query, 10);
        setResults(r);
        setActiveIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ⌘K / Ctrl+K focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const goToResult = (r: SearchResult) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    if (r.entityType === 'customer') {
      onNavigate('customer-360', { customerId: r.id });
    } else {
      onNavigate(r.entityType as ViewState, { recordId: r.id });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); goToResult(results[activeIndex]); }
  };

  const entityLabel = (type: string) => schemas[type]?.label || type;

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 flex items-center gap-6 px-5 sm:px-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm shrink-0 min-w-0" aria-label="Breadcrumb">
        <button onClick={() => onNavigate('dashboard')} className="text-slate-500 hover:text-slate-900 font-medium transition-colors">
          Home
        </button>
        {currentView !== 'dashboard' && (
          <>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
            <span className="text-slate-900 font-semibold truncate">{viewLabel(currentView)}</span>
          </>
        )}
      </nav>

      {/* Global Search */}
      <div ref={boxRef} className="relative ml-auto w-full max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={open && !!query.trim()}
            aria-controls="global-search-results"
            aria-label="Search customers, leads and cases"
            placeholder="Search…"
            className="w-full h-10 pl-9 pr-16 text-sm rounded-lg bg-slate-100/80 border border-transparent text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:bg-white focus:border-slate-300 focus-ring"
          />
          {query ? (
            <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            </button>
          ) : (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
              <kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd>
            </span>
          )}
        </div>

        {open && query.trim() && (
          <div id="global-search-results" role="listbox" className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-[var(--elev-3)] ring-1 ring-slate-200 overflow-hidden max-h-96 overflow-y-auto z-40">
            {loading && results.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400 text-sm">No results for “{query}”</div>
            ) : (
              <ul className="py-1">
                {results.map((r, idx) => (
                  <li key={`${r.entityType}-${r.id}`} role="option" aria-selected={idx === activeIndex}>
                    <button
                      onClick={() => goToResult(r)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === activeIndex ? 'bg-slate-50' : ''}`}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 ring-1 ring-inset ring-indigo-600/15 px-2 py-0.5 rounded-md shrink-0">
                        {entityLabel(r.entityType)}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800">{r.primaryDisplay}</span>
                      <CornerDownLeft className={`w-3.5 h-3.5 text-slate-300 transition-opacity ${idx === activeIndex ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
