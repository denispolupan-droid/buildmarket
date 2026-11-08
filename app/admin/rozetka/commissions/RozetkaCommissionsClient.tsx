'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Save, CheckCircle, Upload, X, AlertTriangle, Download, Search, List, Percent } from 'lucide-react';
import Link from 'next/link';

interface Category {
  slug: string;
  name: string;
  parent_slug: string | null;
  rozetka_category_id: string | null;
  rozetka_category_name: string | null;
  rozetka_commission_pct: number | null;
  rozetka_markup_pct: number | null;
  rozetka_commission_rz_id: string | null;
  rozetka_commission_label: string | null;
}

type RefEntry     = { rz_id: string; name: string; commission_pct: number | null };
type TreeEntry    = { rz_id: string; name: string; commission_rz_id: string | null };
type TariffChange   = { rz_id: string; category_name: string | null; price_from: number; old_pct: number | null; new_pct: number };
type TariffResult   = { applied: boolean; categories?: number; brackets?: number; added?: number; changed?: number; removed?: number; unchanged?: number; sampleChanges?: TariffChange[]; totalInTable?: number } | null;
type CatRefEntry    = { rz_id: string; rz_name: string; commission_rz_id: string | null; commission_name: string | null; commission_pct: number | null; our_categories: string[] };

export default function RozetkaCommissionsClient({ categories }: { categories: Category[] }) {
  const [vals, setVals] = useState<Record<string, { commission: string; markup: string; rz_id: string; rz_name: string; commission_rz_id: string; commission_label: string }>>(
    Object.fromEntries(categories.map(c => [c.slug, {
      commission:       c.rozetka_commission_pct != null ? String(c.rozetka_commission_pct) : '',
      markup:           c.rozetka_markup_pct != null     ? String(c.rozetka_markup_pct)     : '',
      rz_id:            c.rozetka_category_id   ?? '',
      rz_name:          c.rozetka_category_name ?? '',
      commission_rz_id: c.rozetka_commission_rz_id ?? '',
      commission_label: c.rozetka_commission_label ?? '',
    }]))
  );

  const [view, setView] = useState<'commissions' | 'categories'>('commissions');

  const [refs, setRefs] = useState<RefEntry[]>([]);
  const [tree, setTree] = useState<TreeEntry[]>([]);

  const [catRef,        setCatRef]        = useState<CatRefEntry[]>([]);
  const [catRefLoaded,  setCatRefLoaded]  = useState(false);
  const [catRefLoading, setCatRefLoading] = useState(false);
  const [catSearch,     setCatSearch]     = useState('');

  useEffect(() => {
    fetch('/api/admin/rozetka/import-commissions')
      .then(r => r.json())
      .then((data: RefEntry[]) => Array.isArray(data) && setRefs(data))
      .catch(() => {});
    fetch('/api/admin/rozetka/category-tree')
      .then(r => r.json())
      .then((data: TreeEntry[]) => Array.isArray(data) && setTree(data))
      .catch(() => {});
  }, []);

  const refsMap = useMemo(() => new Map(refs.map(r => [r.rz_id, r])), [refs]);
  const treeMap = useMemo(() => new Map(tree.map(t => [t.rz_id, t])), [tree]);

  async function loadCatRef() {
    if (catRefLoaded || catRefLoading) return;
    setCatRefLoading(true);
    try {
      const data: CatRefEntry[] = await fetch('/api/admin/rozetka/categories-reference').then(r => r.json());
      if (Array.isArray(data)) { setCatRef(data); setCatRefLoaded(true); }
    } finally { setCatRefLoading(false); }
  }

  function switchToCategories() { setView('categories'); loadCatRef(); }

  const catRefFiltered = useMemo(() => {
    if (!catSearch.trim()) return catRef;
    const q = catSearch.toLowerCase();
    return catRef.filter(r =>
      r.rz_id.includes(q) ||
      r.rz_name.toLowerCase().includes(q) ||
      (r.commission_name ?? '').toLowerCase().includes(q) ||
      (r.commission_rz_id ?? '').includes(q) ||
      r.our_categories.some(c => c.toLowerCase().includes(q))
    );
  }, [catRef, catSearch]);

  function downloadCsv() {
    const header = 'rz_id\tКатегорія Rozetka\tКомісійна категорія ID\tКомісійна категорія\tКомісія %\tНаші категорії';
    const rows = catRef.map(r =>
      [r.rz_id, r.rz_name, r.commission_rz_id ?? '', r.commission_name ?? '', r.commission_pct ?? '', r.our_categories.join(', ')].join('\t')
    );
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/tab-separated-values;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'rozetka_categories.tsv'; a.click();
  }

  // Dropdown state: which row + which field is active
  const [dropSlug,  setDropSlug]  = useState<string | null>(null);
  const [dropField, setDropField] = useState<'rz_id' | 'rz_name'>('rz_id');

  const treeSuggestions = useMemo(() => {
    if (!dropSlug) return [];
    const query = (dropField === 'rz_id' ? vals[dropSlug]?.rz_id : vals[dropSlug]?.rz_name) ?? '';
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    return tree.filter(t =>
      dropField === 'rz_id'
        ? t.rz_id.startsWith(q)
        : t.name.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [dropSlug, dropField, vals, tree]);

  const pickTree = useCallback((slug: string, entry: TreeEntry) => {
    setVals(p => ({ ...p, [slug]: { ...p[slug], rz_id: entry.rz_id, rz_name: entry.name } }));
    setDropSlug(null);
  }, []);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved,  setSaved]  = useState<Record<string, boolean>>({});

  // Tariff (price-bracket) import state
  const tariffRef        = useRef<HTMLInputElement>(null);
  const tariffFileRef    = useRef<File | null>(null);
  const [tImporting, setTImporting] = useState(false);
  const [tRes,       setTRes]       = useState<TariffResult>(null);
  const [tErr,       setTErr]       = useState<string | null>(null);
  const [tApplying,  setTApplying]  = useState(false);

  async function uploadTariff(file: File) {
    setTImporting(true); setTErr(null); setTRes(null);
    tariffFileRef.current = file;
    const form = new FormData();
    form.append('xlsx', file); form.append('apply', 'false');
    try {
      const res = await fetch('/api/admin/rozetka/import-tariff', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) { setTErr(json.error ?? 'Помилка'); return; }
      setTRes(json);
    } catch { setTErr('Мережева помилка'); }
    finally { setTImporting(false); }
  }

  async function applyTariff() {
    const file = tariffFileRef.current;
    if (!file) return;
    setTApplying(true);
    const form = new FormData();
    form.append('xlsx', file); form.append('apply', 'true');
    try {
      const res = await fetch('/api/admin/rozetka/import-tariff', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) { setTErr(json.error ?? 'Помилка'); return; }
      setTRes({ ...json, applied: true });
    } catch { setTErr('Мережева помилка'); }
    finally { setTApplying(false); }
  }

  async function save(slug: string) {
    setSaving(slug);
    const v = vals[slug];
    await fetch('/api/admin/rozetka/commission', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        commission_pct:            v.commission !== '' ? Number(v.commission) : null,
        markup_pct:                v.markup     !== '' ? Number(v.markup)     : null,
        rozetka_category_id:       v.rz_id    || null,
        rozetka_category_name:     v.rz_name  || null,
        rozetka_commission_rz_id:  v.commission_rz_id || null,
        rozetka_commission_label:  v.commission_label || null,
      }),
    });
    setSaving(null);
    setSaved(p => ({ ...p, [slug]: true }));
    setTimeout(() => setSaved(p => ({ ...p, [slug]: false })), 2000);
  }

  function set(slug: string, field: 'commission' | 'markup' | 'rz_id' | 'rz_name' | 'commission_rz_id', val: string) {
    setVals(p => {
      const next = { ...p[slug], [field]: val };
      if (field === 'commission_rz_id') {
        const ref = refsMap.get(val);
        if (ref) next.commission_label = ref.name;
        else if (!val) next.commission_label = '';
      }
      return { ...p, [slug]: next };
    });
  }

  const roots    = categories.filter(c => !c.parent_slug);
  const children = (slug: string) => categories.filter(c => c.parent_slug === slug);
  const filledCommissions = categories.filter(c => vals[c.slug]?.commission !== '').length;

  function Row({ cat, indent = 0 }: { cat: Category; indent?: number }) {
    const v = vals[cat.slug];

    return (
      <div style={{
        display: 'grid', gridTemplateColumns: '180px 1fr 1fr 110px 90px',
        gap: 6, alignItems: 'center',
        padding: '5px 10px',
        borderBottom: '1px solid var(--bg-page)',
        background: indent === 0 ? 'var(--bg-soft)' : 'var(--surface)',
      }}>
        <div style={{ fontSize: indent === 0 ? 13 : 12, fontWeight: indent === 0 ? 600 : 400, color: indent === 0 ? 'var(--ink)' : 'var(--text-secondary)', paddingLeft: indent * 16 }}>
          {cat.name}
        </div>

        {/* Feed rz_id + category name — inline with tree autocomplete */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            value={v.rz_id}
            onChange={e => { set(cat.slug, 'rz_id', e.target.value); setDropSlug(cat.slug); setDropField('rz_id'); }}
            onFocus={() => { setDropSlug(cat.slug); setDropField('rz_id'); }}
            onBlur={() => setTimeout(() => setDropSlug(s => s === cat.slug ? null : s), 150)}
            placeholder="rz_id"
            style={{
              padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)',
              fontSize: 12, width: 96, flexShrink: 0, boxSizing: 'border-box',
              background: v.rz_id ? 'var(--emerald-bg)' : 'var(--surface)',
            }}
          />
          <input
            value={v.rz_name}
            onChange={e => { set(cat.slug, 'rz_name', e.target.value); setDropSlug(cat.slug); setDropField('rz_name'); }}
            onFocus={() => { setDropSlug(cat.slug); setDropField('rz_name'); }}
            onBlur={() => setTimeout(() => setDropSlug(s => s === cat.slug ? null : s), 150)}
            placeholder="Назва"
            style={{
              padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)',
              fontSize: 12, flex: 1, minWidth: 0, boxSizing: 'border-box',
              color: 'var(--text-secondary)', background: v.rz_name ? 'var(--bg-success)' : 'var(--surface)',
            }}
          />
          {dropSlug === cat.slug && treeSuggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: 'var(--surface)', border: '1px solid var(--line-slate)', borderRadius: 7,
              boxShadow: '0 4px 16px rgba(0,0,0,.12)', marginTop: 2, overflow: 'hidden',
            }}>
              {treeSuggestions.map(entry => (
                <div
                  key={entry.rz_id}
                  onMouseDown={() => pickTree(cat.slug, entry)}
                  style={{
                    padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: '1px solid var(--bg-page)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-success)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--emerald)', flexShrink: 0 }}>{entry.rz_id}</span>
                  <span style={{ color: 'var(--ink)', flex: 1 }}>{entry.name}</span>
                  {entry.commission_rz_id && (() => {
                    const parentName = refsMap.get(entry.commission_rz_id)?.name ?? treeMap.get(entry.commission_rz_id)?.name;
                    return (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                        → {entry.commission_rz_id}{parentName ? ` ${parentName}` : ''}
                      </span>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commission source rz_id + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <input
            value={v.commission_rz_id}
            onChange={e => set(cat.slug, 'commission_rz_id', e.target.value)}
            placeholder="rz_id"
            list="commission-refs-list"
            style={{
              padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)',
              fontSize: 12, width: 88, flexShrink: 0, boxSizing: 'border-box',
              background: v.commission_rz_id && v.commission_rz_id !== v.rz_id ? 'var(--orange-bg)' : 'var(--emerald-bg)',
            }}
          />
          {v.commission_label && v.commission_label !== v.rz_id && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {v.commission_label}
            </span>
          )}
        </div>

        {/* commission */}
        <div style={{ position: 'relative' }}>
          <input
            value={v.commission}
            onChange={e => set(cat.slug, 'commission', e.target.value)}
            placeholder="0"
            type="number" min="0" max="50" step="0.5"
            style={{
              padding: '4px 22px 4px 8px', borderRadius: 5, border: '1px solid var(--border)',
              fontSize: 12, width: '100%', boxSizing: 'border-box',
              background: v.commission ? 'var(--orange-bg)' : 'var(--surface)',
            }}
          />
          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>%</span>
        </div>

        {/* save */}
        <button
          onClick={() => save(cat.slug)}
          disabled={saving === cat.slug}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
            padding: '4px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
            background: saved[cat.slug] ? 'var(--emerald-bg)' : '#0EA5E9',
            color: saved[cat.slug] ? 'var(--emerald)' : 'var(--surface)',
            border: 'none', cursor: 'pointer',
          }}
        >
          {saved[cat.slug] ? <CheckCircle size={11} /> : <Save size={11} />}
          {saved[cat.slug] ? 'OK' : 'Зберегти'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <Link href="/admin/rozetka/products" style={{ fontSize: 13, color: 'var(--text-soft)', textDecoration: 'none' }}>← Товари</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Rozetka</h1>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--bg-page)', borderRadius: 8, padding: 3, gap: 2 }}>
          {([
            { key: 'commissions', label: 'Комісії',   icon: <Percent size={13} /> },
            { key: 'categories',  label: 'Категорії', icon: <List size={13} /> },
          ] as const).map(({ key, label, icon }) => (
            <button key={key} onClick={() => key === 'categories' ? switchToCategories() : setView('commissions')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                background: view === key ? 'var(--surface)' : 'transparent',
                color: view === key ? 'var(--ink)' : 'var(--text-soft)',
                boxShadow: view === key ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                transition: 'all .15s',
              }}
            >{icon}{label}</button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {view === 'commissions' && (
            <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
              {filledCommissions} / {categories.length} категорій з комісією
            </span>
          )}
          {view === 'categories' && catRefLoaded && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                {catRef.length} категорій Rozetka · {catRef.filter(r => r.our_categories.length > 0).length} з прив'язкою
              </span>
              <button onClick={downloadCsv} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 8,
                fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
              }}>
                <Download size={13} /> Скачати TSV
              </button>
            </>
          )}
          {view === 'commissions' && (
            <button onClick={() => tariffRef.current?.click()} disabled={tImporting} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: '#0EA5E9', color: 'var(--surface)', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: tImporting ? 0.7 : 1,
            }}>
              <Upload size={14} />
              {tImporting ? 'Читаємо тариф…' : 'Оновити тариф (пороги)'}
            </button>
          )}
        </div>
        <input
          ref={tariffRef} type="file" accept=".xlsx" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadTariff(f); e.target.value = ''; }}
        />
      </div>

      {view === 'commissions' && (<>
      {/* Tariff import error */}
      {tErr && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-danger)', border: '1px solid var(--danger-border)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--color-danger)' }}>
          <AlertTriangle size={14} /> {tErr}
          <button onClick={() => setTErr(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}><X size={14} /></button>
        </div>
      )}

      {/* Tariff import preview panel */}
      {tRes && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: tRes.applied ? 'var(--emerald-bg)' : '#F0F9FF', borderBottom: '1px solid var(--border)' }}>
            {tRes.applied
              ? <><CheckCircle size={15} color="#059669" /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--emerald)' }}>Тариф оновлено: {tRes.categories} категорій, {tRes.brackets} порогів{tRes.totalInTable != null ? ` · у таблиці ${tRes.totalInTable}` : ''}</span></>
              : <>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    Тариф: {tRes.categories} категорій · {tRes.brackets} порогів
                    {(tRes.added ?? 0) > 0 && ` · +${tRes.added} нових`}
                    {(tRes.changed ?? 0) > 0 && ` · ${tRes.changed} змін`}
                    {(tRes.removed ?? 0) > 0 && ` · −${tRes.removed} зникло`}
                    {(tRes.unchanged ?? 0) > 0 && ` · ${tRes.unchanged} без змін`}
                  </span>
                  {((tRes.added ?? 0) + (tRes.changed ?? 0) + (tRes.removed ?? 0)) > 0 ? (
                    <button onClick={applyTariff} disabled={tApplying} style={{ marginLeft: 'auto', padding: '5px 14px', background: '#0EA5E9', color: 'var(--surface)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {tApplying ? 'Застосовуємо…' : 'Застосувати тариф'}
                    </button>
                  ) : (
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--emerald)' }}>Все актуально, змін немає</span>
                  )}
                </>
            }
            <button onClick={() => setTRes(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={14} /></button>
          </div>

          {!tRes.applied && (tRes.sampleChanges?.length ?? 0) > 0 && (
            <div style={{ padding: '10px 16px', maxHeight: 220, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                Зміни (перші {tRes.sampleChanges!.length})
              </div>
              {tRes.sampleChanges!.map((c, i) => (
                <div key={`${c.rz_id}-${c.price_from}-${i}`} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--bg-soft)' }}>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{c.category_name ?? c.rz_id}</span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>[{c.rz_id}] від {c.price_from}₴</span>
                  <span style={{ color: 'var(--color-danger)', textDecoration: c.old_pct != null ? 'line-through' : 'none' }}>{c.old_pct != null ? `${c.old_pct}%` : 'нове'}</span>
                  <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>→ {c.new_pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Datalist for commission source refs */}
      <datalist id="commission-refs-list">
        {refs.map(r => (
          <option key={r.rz_id} value={r.rz_id} label={`${r.rz_id} — ${r.name}`} />
        ))}
      </datalist>

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '180px 1fr 1fr 110px 90px',
          gap: 6, padding: '8px 10px',
          background: 'var(--bg-page)', borderBottom: '1px solid var(--border)',
          fontSize: 11, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.04em',
        }}>
          <div>Категорія</div>
          <div>Rozetka ID · Назва</div>
          <div>PDF rz_id · Мітка комісії</div>
          <div>Комісія</div>
          <div />
        </div>

        {roots.map(root => (
          <div key={root.slug}>
            <Row cat={root} indent={0} />
            {children(root.slug).map(child => (
              <div key={child.slug}>
                <Row cat={child} indent={1} />
                {children(child.slug).map(grand => (
                  <Row key={grand.slug} cat={grand} indent={2} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
        Ціна на Rozetka = ціна входу × (1 + наценка%) / (1 − комісія%), округлення до 5 грн.
        Наценки налаштовуються на вкладці «Товари».
      </p>
      </>)}

      {/* ── Categories reference view ─────────────────────────────── */}
      {view === 'categories' && (
        <>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 14, maxWidth: 420 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              value={catSearch} onChange={e => setCatSearch(e.target.value)}
              placeholder="Пошук за ID, назвою або нашою категорією…"
              style={{
                width: '100%', boxSizing: 'border-box', paddingLeft: 32, paddingRight: 12,
                height: 36, border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
                outline: 'none', color: 'var(--ink)',
              }}
            />
          </div>

          {catRefLoading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>Завантаження…</div>
          )}

          {catRefLoaded && (
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {/* 6 columns: rz_id | rz_name | comm_id | comm_name | % | our cats */}
              {(() => {
                const cols = '100px 1fr 100px 1fr 64px 1fr';
                const cellStyle: React.CSSProperties = { padding: '0 10px', display: 'flex', alignItems: 'center', minHeight: 38 };
                return (
                  <>
                    <div style={{
                      display: 'grid', gridTemplateColumns: cols,
                      background: 'var(--bg-page)', borderBottom: '2px solid var(--border)',
                      fontSize: 11, fontWeight: 700, color: 'var(--text-soft)',
                      textTransform: 'uppercase', letterSpacing: '.05em',
                    }}>
                      {['ID', 'Категорія Rozetka', 'Ком. ID', 'Комісійна категорія', '%', 'Наші категорії'].map(h => (
                        <div key={h} style={cellStyle}>{h}</div>
                      ))}
                    </div>

                    {catRefFiltered.map((r, i) => (
                      <div key={r.rz_id} style={{
                        display: 'grid', gridTemplateColumns: cols,
                        borderBottom: '1px solid var(--bg-page)',
                        background: i % 2 === 0 ? 'var(--surface)' : '#FAFBFC',
                        fontSize: 13, color: 'var(--ink)',
                      }}>
                        <div style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 12, color: 'var(--emerald)', fontWeight: 600 }}>
                          {r.rz_id}
                        </div>
                        <div style={{ ...cellStyle }}>
                          {r.rz_name}
                        </div>
                        <div style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                          {r.commission_rz_id ?? <span style={{ color: 'var(--border)' }}>—</span>}
                        </div>
                        <div style={{ ...cellStyle, color: r.commission_name ? 'var(--text-secondary)' : 'var(--line-slate)' }}>
                          {r.commission_name ?? '—'}
                        </div>
                        <div style={{ ...cellStyle, fontWeight: 600, color: r.commission_pct ? 'var(--text-primary)' : 'var(--line-slate)' }}>
                          {r.commission_pct != null ? `${r.commission_pct}%` : '—'}
                        </div>
                        <div style={{ ...cellStyle, color: r.our_categories.length > 0 ? '#334155' : 'var(--line-slate)', flexWrap: 'wrap', gap: 4, paddingTop: 6, paddingBottom: 6 }}>
                          {r.our_categories.length > 0
                            ? r.our_categories.map(name => (
                                <span key={name} style={{
                                  display: 'inline-block', padding: '2px 7px',
                                  background: 'var(--bg-success)', color: 'var(--emerald)',
                                  borderRadius: 4, fontSize: 12, lineHeight: 1.5,
                                }}>{name}</span>
                              ))
                            : '—'
                          }
                        </div>
                      </div>
                    ))}

                    {catRefFiltered.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Нічого не знайдено</div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
