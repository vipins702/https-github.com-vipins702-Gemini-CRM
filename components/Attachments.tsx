import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Upload, Trash2, Loader2, FileText, ImageIcon } from 'lucide-react';
import { api } from '../services/api';
import { Attachment } from '../types';

interface Props {
  entityType: string;
  recordId: string;
  compact?: boolean;
}

const fmtSize = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export const Attachments: React.FC<Props> = ({ entityType, recordId, compact }) => {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await api.getAttachments(entityType, recordId)); }
    catch { setItems([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (recordId) load(); /* eslint-disable-next-line */ }, [entityType, recordId]);

  const onPick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) await api.uploadAttachment(entityType, recordId, f);
      await load();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    await api.deleteAttachment(id);
    setItems(prev => prev.filter(x => x.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="mono-label flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Files ({items.length})</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#4F46E5] hover:text-[#3730A3] disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => onPick(e.target.files)} />
      </div>

      {loading ? (
        <p className="text-xs text-ink-muted py-3 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <button onClick={() => inputRef.current?.click()} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-xl text-xs text-ink-muted hover:border-[#4F46E5]/40 hover:text-[#4F46E5] transition-colors">
          Drop files or click to upload
        </button>
      ) : (
        <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 sm:grid-cols-3 gap-2'}>
          {items.map(a => (
            <div key={a.id} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden">
              {a.kind === 'image' ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="block">
                  <img src={a.url} alt={a.filename} className="w-full h-20 object-cover" />
                </a>
              ) : (
                <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 h-20">
                  <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                  <span className="text-xs text-ink truncate">{a.filename}</span>
                </a>
              )}
              <div className="px-2 py-1.5 flex items-center justify-between gap-1 border-t border-slate-100">
                <span className="text-[10px] text-ink-muted truncate">{a.kind === 'image' ? a.filename : fmtSize(a.size)}</span>
                <button onClick={() => remove(a.id)} className="text-slate-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
