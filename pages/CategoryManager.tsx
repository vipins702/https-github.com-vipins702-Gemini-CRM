import React, { useEffect, useState } from 'react';
import { Layers, Plus, Trash2, Save, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import { CategoryNode } from '../types';

const SET_KEY = 'product';

export const CategoryManager: React.FC = () => {
  const { addToast } = useToast();
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState('');

  const load = async () => {
    setLoading(true);
    try { setTree(await api.getCategoryTree(SET_KEY)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const addCategory = () => {
    if (!newCat.trim()) return;
    setTree(prev => [...prev, { name: newCat.trim(), children: [] }]);
    setNewCat('');
  };
  const removeCategory = (i: number) => setTree(prev => prev.filter((_, idx) => idx !== i));
  const renameCategory = (i: number, name: string) => setTree(prev => prev.map((n, idx) => idx === i ? { ...n, name } : n));
  const addSub = (i: number, name: string) => {
    if (!name.trim()) return;
    setTree(prev => prev.map((n, idx) => idx === i ? { ...n, children: [...(n.children || []), { name: name.trim() }] } : n));
  };
  const removeSub = (i: number, j: number) =>
    setTree(prev => prev.map((n, idx) => idx === i ? { ...n, children: (n.children || []).filter((_, k) => k !== j) } : n));

  const save = async () => {
    setSaving(true);
    try {
      await api.saveCategoryTree(SET_KEY, tree);
      addToast('Category matrix saved', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 lg:p-8 font-sans max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="tri-ring-sq w-9 h-9"><span className="flex items-center justify-center"><Layers className="w-[18px] h-[18px] text-[#4F46E5]" /></span></span>
            Product Categories
          </h1>
          <p className="text-ink-muted text-sm mt-1">Cascading matrix (Category → Subcategory). Used on Product, Lead & Case forms.</p>
        </div>
        <Button icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} onClick={save} disabled={saving}>Save matrix</Button>
      </div>

      {loading ? (
        <div className="glass-showcase p-5"><Skeleton variant="card" className="h-40" /></div>
      ) : (
        <div className="glass-showcase p-5 space-y-4">
          {tree.map((cat, i) => (
            <div key={i} className="border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <ChevronRight className="w-4 h-4 text-[#4F46E5] shrink-0" />
                <input value={cat.name} onChange={e => renameCategory(i, e.target.value)} className="!h-9 font-semibold flex-1" />
                <button onClick={() => removeCategory(i)} className="text-slate-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="pl-6 flex flex-wrap gap-1.5">
                {(cat.children || []).map((sub, j) => (
                  <span key={j} className="inline-flex items-center gap-1 bg-slate-100 text-ink-soft text-xs font-medium px-2 py-1 rounded-lg">
                    {sub.name}
                    <button onClick={() => removeSub(i, j)} className="text-slate-400 hover:text-red-500">×</button>
                  </span>
                ))}
                <SubAdder onAdd={(name) => addSub(i, name)} />
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <input value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} placeholder="New category (e.g. Card)" className="flex-1" />
            <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={addCategory}>Add category</Button>
          </div>
        </div>
      )}
    </div>
  );
};

const SubAdder: React.FC<{ onAdd: (name: string) => void }> = ({ onAdd }) => {
  const [v, setV] = useState('');
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={v}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onAdd(v); setV(''); } }}
        placeholder="+ subcategory"
        className="!h-7 !text-xs !w-32 !py-0"
      />
    </span>
  );
};
