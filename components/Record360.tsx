import React, { useMemo, useState } from 'react';
import {
  Phone, MessageCircle, Mail, StickyNote, Pencil, Camera, Loader2, Send, Check,
  ArrowRightLeft, PhoneCall, FileText, Sparkles, Activity as ActivityIcon,
} from 'lucide-react';
import { Activity, ProcessStage, RelatedActivity } from '../types';

/**
 * Building blocks shared by the Lead 360 and Customer 360 pages:
 * avatar, quick actions, stage progress, key-number tiles, "about" list and
 * one combined activity timeline (notes, stage changes, calls, WhatsApp, email).
 */

// ── Time helpers ─────────────────────────────────────────────────────────────
/** Stored timestamps are UTC 'YYYY-MM-DD HH:MM:SS' (no zone) or ISO strings. */
export const parseTs = (s?: string | null): Date | null => {
  if (!s) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

export const timeAgo = (d: Date | null): string => {
  if (!d) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

// ── Avatar ───────────────────────────────────────────────────────────────────
export const Avatar360: React.FC<{
  name: string; image?: string; size?: number;
  onUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void; uploading?: boolean;
}> = ({ name, image, size = 72, onUpload, uploading }) => {
  const initials = (name || '?').split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {image ? (
        <img src={image} alt={name} className="w-full h-full rounded-full object-cover shadow-[var(--elev-2)]" />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center bg-gradient-to-b from-accent-400 to-accent-600 text-white font-semibold shadow-[var(--elev-2)] select-none"
          style={{ fontSize: size * 0.36 }}
          aria-hidden="true"
        >
          {initials}
        </div>
      )}
      {onUpload && (
        <label
          className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-surface shadow-[var(--elev-3)] flex items-center justify-center cursor-pointer text-gray-600 hover:text-accent transition-colors"
          title={image ? 'Change photo' : 'Add photo'}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          <span className="sr-only">{image ? 'Change photo' : 'Add photo'}</span>
          <input type="file" accept="image/*" className="sr-only" onChange={onUpload} disabled={uploading} />
        </label>
      )}
    </div>
  );
};

// ── Quick actions (iOS contact-card style) ───────────────────────────────────
type QuickAction = { key: string; label: string; icon: React.ElementType; onClick?: () => void; href?: string; disabled?: boolean; hint?: string };

export const QuickActions: React.FC<{ actions: QuickAction[] }> = ({ actions }) => (
  <div className="flex flex-wrap gap-2.5" role="toolbar" aria-label="Quick actions">
    {actions.map(({ key, label, icon: Icon, onClick, href, disabled, hint }) => {
      const cls = `group flex flex-col items-center justify-center gap-1.5 w-[76px] h-[64px] rounded-2xl text-xs font-medium transition-[background-color,transform] duration-150 active:scale-[0.97] ${
        disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-accent-50 text-accent-700 hover:bg-accent-100'
      }`;
      const body = (<><Icon className="w-5 h-5" strokeWidth={2} aria-hidden="true" /><span>{label}</span></>);
      if (href && !disabled) return <a key={key} href={href} className={cls} title={label}>{body}</a>;
      return <button key={key} type="button" onClick={onClick} disabled={disabled} className={cls} title={disabled ? hint : label}>{body}</button>;
    })}
  </div>
);

/** The standard set: call, WhatsApp, email, note, edit. */
export const contactActions = (o: {
  phone?: string; email?: string; onWhatsApp?: () => void; onEmail?: () => void; onNote?: () => void; onEdit?: () => void;
}): QuickAction[] => [
  { key: 'call', label: 'Call', icon: Phone, href: o.phone ? `tel:${o.phone}` : undefined, disabled: !o.phone, hint: 'No phone number' },
  { key: 'wa', label: 'WhatsApp', icon: MessageCircle, onClick: o.onWhatsApp, disabled: !o.phone || !o.onWhatsApp, hint: 'No phone number' },
  { key: 'mail', label: 'Email', icon: Mail, onClick: o.onEmail, disabled: !o.email || !o.onEmail, hint: 'No email address' },
  { key: 'note', label: 'Note', icon: StickyNote, onClick: o.onNote },
  { key: 'edit', label: 'Edit', icon: Pencil, onClick: o.onEdit, disabled: !o.onEdit },
];

// ── Stage progress ───────────────────────────────────────────────────────────
export const StageProgress: React.FC<{ stages: ProcessStage[]; current?: string }> = ({ stages, current }) => {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const open = ordered.filter(s => s.type === 'open');
  const closing = ordered.filter(s => s.type !== 'open');
  const currentStage = ordered.find(s => s.name.toLowerCase() === String(current || '').toLowerCase());
  const idx = currentStage?.type === 'open' ? open.indexOf(currentStage) : currentStage ? open.length : -1;
  if (!ordered.length) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">Stage</span>
        {currentStage && currentStage.type !== 'open' && (
          <span className={`status-pill ${currentStage.type === 'won' ? 'status-green' : 'status-red'}`}>{currentStage.name}</span>
        )}
      </div>
      <ol className="flex gap-1" aria-label="Pipeline stage">
        {open.map((s, i) => {
          const done = idx > i, here = idx === i;
          return (
            <li key={s.id} className="flex-1 min-w-0" aria-current={here ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full ${done || here ? 'bg-accent' : 'bg-gray-100'} ${here ? 'ring-2 ring-accent/25' : ''}`} />
              <div className={`mt-1.5 text-xs truncate ${here ? 'font-semibold text-gray-900' : done ? 'text-gray-600' : 'text-gray-400'}`}>
                {done && <Check className="inline w-3 h-3 mr-0.5 -mt-0.5" aria-hidden="true" />}{s.name}
              </div>
            </li>
          );
        })}
        {closing.length > 0 && (
          <li className="flex-1 min-w-0">
            <div className={`h-1.5 rounded-full ${currentStage?.type === 'won' ? 'bg-green-500' : currentStage?.type === 'lost' ? 'bg-red-500' : 'bg-gray-100'}`} />
            <div className="mt-1.5 text-xs truncate text-gray-400">{closing.map(s => s.name).join(' / ')}</div>
          </li>
        )}
      </ol>
    </div>
  );
};

// ── Key-number tiles ─────────────────────────────────────────────────────────
const TONES = {
  accent: 'bg-accent-50 text-accent-700',
  green: 'bg-green-50 text-green-700',
  orange: 'bg-orange-50 text-orange-700',
  purple: 'bg-purple-50 text-purple-700',
  teal: 'bg-teal-50 text-teal-700',
  pink: 'bg-pink-50 text-pink-700',
};
export type Tone = keyof typeof TONES;

export const StatTile: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ElementType; tone?: Tone; children?: React.ReactNode }> =
  ({ label, value, sub, icon: Icon, tone = 'accent', children }) => (
  <div className="glass-showcase p-4 flex items-start gap-3 min-w-0">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONES[tone]}`}><Icon className="w-5 h-5" aria-hidden="true" /></div>
    <div className="min-w-0 flex-1">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="text-[20px] leading-7 font-semibold text-gray-900 tnum truncate">{value}</div>
      {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
      {children}
    </div>
  </div>
);

// ── About list (Apple grouped-list style) ────────────────────────────────────
export const AboutList: React.FC<{ rows: { icon: React.ElementType; label: string; value?: React.ReactNode; href?: string }[] }> = ({ rows }) => (
  <dl className="divide-y divide-gray-100 -my-1">
    {rows.map(({ icon: Icon, label, value, href }) => (
      <div key={label} className="flex items-center gap-3 py-2.5">
        <Icon className="w-[18px] h-[18px] text-gray-400 shrink-0" aria-hidden="true" />
        <dt className="text-sm text-gray-500 w-24 shrink-0">{label}</dt>
        <dd className="text-sm text-gray-900 font-medium min-w-0 truncate flex-1 text-right">
          {value ? (href ? <a href={href} className="text-accent hover:underline">{value}</a> : value) : <span className="text-gray-400 font-normal">—</span>}
        </dd>
      </div>
    ))}
  </dl>
);

// ── Combined timeline ────────────────────────────────────────────────────────
type Kind = 'note' | 'stage' | 'call' | 'whatsapp' | 'email' | 'event';
type Item = { id: string; kind: Kind; title: string; body?: string; at: Date | null; by?: string };

const KIND_META: Record<Kind, { icon: React.ElementType; tone: string; label: string }> = {
  note:     { icon: StickyNote,     tone: 'bg-orange-50 text-orange-700', label: 'Notes' },
  stage:    { icon: ArrowRightLeft, tone: 'bg-accent-50 text-accent-700', label: 'Stage' },
  call:     { icon: PhoneCall,      tone: 'bg-teal-50 text-teal-700',     label: 'Calls' },
  whatsapp: { icon: MessageCircle,  tone: 'bg-green-50 text-green-700',   label: 'WhatsApp' },
  email:    { icon: Mail,           tone: 'bg-purple-50 text-purple-700', label: 'Email' },
  event:    { icon: ActivityIcon,   tone: 'bg-gray-100 text-gray-600',    label: 'Updates' },
};

const ACTION_TITLES: Record<string, string> = {
  create: 'Record created', update: 'Details updated', delete: 'Deleted', convert: 'Converted to customer',
  call: 'Call logged', email: 'Email', assign: 'Owner changed', score: 'Score updated', ai_tasks: 'AI follow-up tasks created',
};

function buildItems(timeline: Activity[], activity: RelatedActivity | null): Item[] {
  const items: Item[] = [];
  const hasStageHistory = !!activity?.stageHistory?.length;
  for (const a of timeline as any[]) {
    const action = String(a.action || a.type || 'note');
    if (action === 'status' && hasStageHistory) continue; // shown from stage history below
    const d = a.details && typeof a.details === 'object' ? a.details : {};
    const at = parseTs(a.timestamp || a.created_at);
    if (action === 'note') items.push({ id: `n-${a.id}`, kind: 'note', title: 'Note', body: d.note || a.content, at, by: a.author || a.actor });
    else if (action === 'status') items.push({ id: `s-${a.id}`, kind: 'stage', title: `${d.from ? `${d.from} → ` : ''}${d.to || 'Stage changed'}`, body: d.note, at, by: a.author });
    else items.push({ id: `e-${a.id}`, kind: action === 'call' ? 'call' : 'event', title: ACTION_TITLES[action] || action.replace(/_/g, ' '), body: d.note || d.subject, at, by: a.author });
  }
  for (const h of activity?.stageHistory || []) items.push({ id: `h-${h.id}`, kind: 'stage', title: `${h.from ? `${h.from} → ` : ''}${h.to}`, body: h.note, at: parseTs(h.created_at), by: h.actor });
  for (const c of activity?.calls || []) items.push({ id: `c-${c.id}`, kind: 'call', title: `${c.direction === 'outbound' ? 'Outgoing' : 'Incoming'} call${c.outcome ? ` · ${c.outcome}` : ''}`, body: c.direction === 'outbound' ? c.to_number : c.from_number, at: parseTs(c.created_at) });
  for (const w of activity?.whatsapp || []) items.push({ id: `w-${w.id}`, kind: 'whatsapp', title: w.direction === 'outbound' ? 'WhatsApp sent' : 'WhatsApp received', body: w.body, at: parseTs(w.created_at) });
  for (const e of activity?.emails || []) items.push({ id: `m-${e.id}`, kind: 'email', title: e.direction === 'outbound' ? 'Email sent' : 'Email received', body: e.subject, at: parseTs(e.created_at) });
  return items.sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0));
}

export const ActivityTimeline: React.FC<{
  timeline: Activity[]; activity: RelatedActivity | null;
  note: string; onNoteChange: (v: string) => void; onAddNote: () => void; savingNote: boolean;
  noteInputRef?: React.Ref<HTMLTextAreaElement>;
}> = ({ timeline, activity, note, onNoteChange, onAddNote, savingNote, noteInputRef }) => {
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const items = useMemo(() => buildItems(timeline, activity), [timeline, activity]);
  const counts = useMemo(() => items.reduce((m, i) => ({ ...m, [i.kind]: (m[i.kind] || 0) + 1 }), {} as Record<string, number>), [items]);
  const shown = filter === 'all' ? items : items.filter(i => i.kind === filter);
  const kinds = (Object.keys(KIND_META) as Kind[]).filter(k => counts[k]);

  return (
    <div className="glass-showcase overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <h3 className="font-heading text-[17px] font-semibold text-gray-900">Activity</h3>
        {/* Composer */}
        <div className="mt-3 flex items-end gap-2">
          <textarea
            ref={noteInputRef}
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAddNote(); }}
            placeholder="Write a note… (Ctrl/⌘ + Enter to save)"
            rows={2}
            className="flex-1 resize-none !rounded-xl"
            aria-label="New note"
          />
          <button
            type="button"
            onClick={onAddNote}
            disabled={savingNote || !note.trim()}
            className="btn-tri-primary h-10 px-4 inline-flex items-center gap-1.5 text-sm font-semibold disabled:opacity-40"
          >
            {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Save
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-purple-500" aria-hidden="true" />Notes can create follow-up tasks automatically.</p>
        {/* Filters */}
        {kinds.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter activity">
            {(['all', ...kinds] as (Kind | 'all')[]).map(k => (
              <button
                key={k}
                role="tab"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
                className={`h-7 px-3 rounded-full text-xs font-medium transition-colors ${filter === k ? 'bg-gray-900 text-surface' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {k === 'all' ? `All ${items.length}` : `${KIND_META[k].label} ${counts[k]}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 mx-auto flex items-center justify-center mb-3"><FileText className="w-6 h-6 text-gray-400" aria-hidden="true" /></div>
          <p className="text-sm font-medium text-gray-900">No activity yet</p>
          <p className="text-sm text-gray-500 mt-0.5">Calls, messages, emails and notes will appear here.</p>
        </div>
      ) : (
        <ol className="px-5 py-4 space-y-1">
          {shown.slice(0, 60).map((it, i) => {
            const meta = KIND_META[it.kind];
            const Icon = meta.icon;
            return (
              <li key={it.id} className="relative flex gap-3 pb-3">
                {i < shown.length - 1 && <span className="absolute left-[15px] top-9 bottom-0 w-px bg-gray-100" aria-hidden="true" />}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.tone}`}><Icon className="w-4 h-4" aria-hidden="true" /></div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{it.title}</p>
                    <time className="ml-auto text-xs text-gray-500 shrink-0" dateTime={it.at?.toISOString()} title={it.at?.toLocaleString()}>{timeAgo(it.at)}</time>
                  </div>
                  {it.body && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line break-words">{it.body}</p>}
                  {it.by && <p className="text-xs text-gray-500 mt-0.5">by {it.by}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};
