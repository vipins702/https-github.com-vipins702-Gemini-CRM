import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Search, ChevronRight, X, Loader2, CornerDownLeft, Bell, CheckCheck, Clock, AlertCircle, Info } from 'lucide-react';
import { ViewState, EntityDefinition, AppNotification } from '../types';
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
  reports: 'Reports',
  whatsapp: 'WhatsApp',
  'email-inbox': 'Email',
  calendar: 'Calendar & Tasks',
  quotes: 'Quotes',
  pipeline: 'Sales Pipeline',
  processes: 'Process Builder',
  settings: 'Settings',
  'customer-360': 'Customer 360',
  'lead-360': 'Lead 360',
  categories: 'Product Categories',
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

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  reminder: <Clock className="w-4 h-4 text-amber-500" />,
  alert: <AlertCircle className="w-4 h-4 text-rose-500" />,
  task_due: <Clock className="w-4 h-4 text-orange-500" />,
  info: <Info className="w-4 h-4 text-blue-500" />,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Notification Center Dropdown ────────────────────────────────────────────
const NotificationCenter: React.FC<{ onClose: () => void; onNavigate: (v: ViewState, p?: any) => void }> = ({ onClose, onNavigate }) => {
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getNotifications().then(n => { setNotifs(n); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const markAll = async () => {
    await api.markNotificationsRead('all');
    setNotifs(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  const markOne = async (id: string) => {
    await api.markNotificationsRead([id]);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
  };

  const handleClick = (n: AppNotification) => {
    markOne(n.id);
    if (n.entity_type && n.record_id) {
      if (n.entity_type === 'lead') onNavigate('lead-360', { leadId: n.record_id });
      else if (n.entity_type === 'customer') onNavigate('customer-360', { customerId: n.record_id });
      else onNavigate(n.entity_type as ViewState, { recordId: n.record_id });
    }
    onClose();
  };

  const unread = notifs.filter(n => !n.is_read).length;

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-slate-200 z-50 animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-sm text-ink flex items-center gap-2">
          Notifications
          {unread > 0 && <span className="bg-[#2563EB] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>}
        </h3>
        {unread > 0 && (
          <button onClick={markAll} className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium">
            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300 mx-auto" /></div>
        ) : notifs.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-ink-muted">All caught up!</p>
          </div>
        ) : (
          notifs.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${!n.is_read ? 'bg-blue-50/40' : ''}`}
            >
              <div className="mt-0.5 shrink-0">{NOTIF_ICONS[n.kind] || NOTIF_ICONS.info}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.is_read ? 'font-semibold text-ink' : 'text-slate-600'} truncate`}>{n.title}</p>
                {n.body && <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{n.body}</p>}
                <p className="text-[11px] text-ink-muted mt-1">{timeAgo(n.created_at)}</p>
              </div>
              {!n.is_read && <span className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0 mt-1.5" />}
            </button>
          ))
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100 text-center">
        <button onClick={onClose} className="text-xs text-ink-muted hover:text-ink">Close</button>
      </div>
    </div>
  );
};

// ─── TopBar ───────────────────────────────────────────────────────────────────
export const TopBar: React.FC<TopBarProps> = ({ currentView, schemas, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const viewLabel = (v: string) => STATIC_LABELS[v] || schemas[v]?.pluralLabel || schemas[v]?.label || v;

  // Poll unread count every 30s
  useEffect(() => {
    const fetchCount = async () => {
      try { const r = await api.getUnreadNotificationCount(); setUnreadCount(r.count); } catch {}
    };
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await api.globalSearch(query, 10); setResults(r); setActiveIndex(0); }
      catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ⌘K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const goToResult = (r: SearchResult) => {
    setQuery(''); setResults([]); setOpen(false);
    if (r.entityType === 'customer') onNavigate('customer-360', { customerId: r.id });
    else if (r.entityType === 'lead') onNavigate('lead-360', { leadId: r.id });
    else onNavigate(r.entityType as ViewState, { recordId: r.id });
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
        <button onClick={() => onNavigate('dashboard')} className="text-slate-500 hover:text-slate-900 font-medium transition-colors">Home</button>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={open && !!query.trim()}
            placeholder="Search…"
            className="w-full h-10 pl-9 pr-16 text-sm rounded-lg bg-slate-100/80 border border-transparent text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:bg-white focus:border-slate-300 focus-ring"
          />
          {query ? (
            <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            </button>
          ) : (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
              <kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd>
            </span>
          )}
        </div>

        {open && query.trim() && (
          <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-[var(--elev-pop)] ring-1 ring-slate-200 overflow-hidden max-h-96 overflow-y-auto z-40 animate-slideDown">
            {loading && results.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400 text-sm">No results for "{query}"</div>
            ) : (
              <ul className="py-1">
                {results.map((r, idx) => (
                  <li key={`${r.entityType}-${r.id}`}>
                    <button
                      onClick={() => goToResult(r)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === activeIndex ? 'bg-slate-50' : ''}`}
                    >
                      <span className="status-pill status-blue shrink-0">{entityLabel(r.entityType)}</span>
                      <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800">{r.primaryDisplay}</span>
                      <CornerDownLeft className={`w-3.5 h-3.5 text-slate-300 transition-opacity ${idx === activeIndex ? 'opacity-100' : 'opacity-0'}`} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Notification Bell */}
      <div ref={notifRef} className="relative shrink-0">
        <button
          onClick={() => { setShowNotifs(v => !v); setUnreadCount(0); }}
          className="relative p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-[#2563EB] text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {showNotifs && (
          <NotificationCenter onClose={() => setShowNotifs(false)} onNavigate={onNavigate} />
        )}
      </div>
    </header>
  );
};
