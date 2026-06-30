'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, CheckCircle, List } from 'lucide-react';

type Plan = 'single' | 'econom' | 'more_sales' | 'turbo';

interface Category {
  slug:                            string;
  name:                            string;
  parent_slug:                     string | null;
  prom_commission_pct:             number | null;
  prom_commission_pct_econom:      number | null;
  prom_commission_pct_more_sales:  number | null;
  prom_commission_pct_turbo:       number | null;
  prom_section_id:                 number | null;
  prom_section_name:               string | null;
  prom_section_url:                string | null;
  prom_markup_pct:                 number | null;
}

interface RefEntry {
  prom_category_id:  number;
  name:              string;
  path:              string | null;
  commission_single: number | null;
  commission_ecom:   number | null;
  commission_more:   number | null;
  commission_turbo:  number | null;
}

interface RowVals {
  prom_id:           string;
  prom_name:         string;
  commission_single: string;
  commission_ecom:   string;
  commission_more:   string;
  commission_turbo:  string;
  markup:            string;
}

interface Props {
  categories: Category[];
  plan:       Plan;
}

const PLANS: { key: Plan; label: string; short: string; color: string }[] = [
  { key: 'econom',     label: 'Економ',          short: 'Еко',    color: '#059669' },
  { key: 'single',     label: 'Єдина комісія',   short: 'Єдина',  color: '#1D4ED8' },
  { key: 'more_sales', label: 'Більше продажів', short: 'Більше', color: '#7C3AED' },
  { key: 'turbo',      label: 'Турбо',           short: 'Турбо',  color: '#DC2626' },
];

const GRID = '200px 1fr 64px 64px 64px 64px 82px';

function pctColor(pct: number | null): string {
  if (pct == null) return '#9CA3AF';
  if (pct >= 20)  return '#7C2D12';
  if (pct >= 15)  return '#DC2626';
  if (pct >= 12)  return '#EA580C';
  if (pct >= 10)  return '#D97706';
  if (pct >= 7)   return '#16A34A';
  return '#0369A1';
}

function planPct(c: RowVals, planKey: Plan): number | null {
  const raw =
    planKey === 'econom'     ? c.commission_ecom   :
    planKey === 'more_sales' ? c.commission_more   :
    planKey === 'turbo'      ? c.commission_turbo  :
                               c.commission_single;
  return raw !== '' && raw != null ? Number(raw) : null;
}

// ── Каталог-браузер (модальне вікно) ─────────────────────────────────────────

interface CatalogModalProps {
  onPick:  (entry: RefEntry) => void;
  onClose: () => void;
}

function CatalogModal({ onPick, onClose }: CatalogModalProps) {
  const [q,       setQ]       = useState('');
  const [items,   setItems]   = useState<RefEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    load('');
  }, []);

  async function load(query: string) {
    setLoading(true);
    try {
      const lim = query.length < 2 ? 200 : 50;
      const res  = await fetch(`/api/admin/prom/category-search?q=${encodeURIComponent(query)}&limit=${lim}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  // Debounce пошуку
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQ(val: string) {
    setQ(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => load(val), 250);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '90%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <input
              ref={inputRef}
              value={q}
              onChange={e => handleQ(e.target.value)}
              placeholder="Пошук по ID або назві Prom категорії…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none' }}
            />
          </div>
          <button
            onClick={onClose}
            style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', fontSize: 13, cursor: 'pointer' }}
          >
            Закрити
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Завантаження…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Нічого не знайдено</div>
          ) : items.map(entry => (
            <div
              key={entry.prom_category_id}
              onClick={() => { onPick(entry); onClose(); }}
              style={{ padding: '8px 20px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 12 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F0FDF4')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#059669', flexShrink: 0, minWidth: 60 }}>
                {entry.prom_category_id}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{entry.name}</div>
                {entry.path && <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.path}</div>}
              </div>
              {entry.commission_single != null && (
                <span style={{ fontSize: 12, fontWeight: 700, color: pctColor(entry.commission_single), flexShrink: 0 }}>
                  {entry.commission_single}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 20px', borderTop: '1px solid #F1F5F9', fontSize: 11, color: '#CBD5E1' }}>
          {loading ? 'Завантаження…' : `${items.length} категорій${q.length < 2 ? ' · введи запит для звуження' : ''}`}
        </div>
      </div>
    </div>
  );
}

// ── Row (поза компонентом, щоб уникнути ремаунту при кожному keystroke) ──────

interface RowProps {
  cat:         Category;
  indent:      number;
  v:           RowVals;
  plan:        Plan;
  dropOpen:    boolean;
  suggestions: RefEntry[];
  dropLoading: boolean;
  isSaving:    boolean;
  isSaved:     boolean;
  onField:     (slug: string, field: keyof RowVals, val: string) => void;
  onSearch:    (slug: string, q: string) => void;
  onDropFocus: (slug: string) => void;
  onDropBlur:  (slug: string) => void;
  onPick:      (slug: string, entry: RefEntry) => void;
  onClear:     (slug: string) => void;
  onSave:      (slug: string) => void;
  onCatalog:   (slug: string) => void;
}

function PromRow({
  cat, indent, v, plan, dropOpen, suggestions, dropLoading,
  isSaving, isSaved,
  onField, onSearch, onDropFocus, onDropBlur, onPick, onClear, onSave, onCatalog,
}: RowProps) {
  const isMapped = v.prom_id !== '';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: GRID,
      gap: 6, alignItems: 'center',
      padding: '6px 10px', borderBottom: '1px solid #F1F5F9',
      background: indent === 0 ? '#F8FAFC' : '#fff',
    }}>

      {/* Наша категорія */}
      <div style={{
        paddingLeft: indent * 14,
        fontSize: indent === 0 ? 13 : 12, fontWeight: indent === 0 ? 700 : 400,
        color: indent === 0 ? '#1E293B' : '#475569',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {indent > 0 && <span style={{ color: '#D1D5DB', marginRight: 4 }}>└</span>}
        {cat.name}
      </div>

      {/* Prom категорія */}
      <div style={{ position: 'relative' }}>
        {isMapped ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 6px', borderRadius: 5,
            border: '1px solid #D1FAE5', background: '#ECFDF5',
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#059669', flexShrink: 0, fontWeight: 700 }}>
              {v.prom_id}
            </span>
            <span style={{ fontSize: 12, color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.prom_name}
            </span>
            <button
              onMouseDown={e => { e.preventDefault(); onClear(cat.slug); }}
              title="Змінити категорію"
              style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
            >×</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                value={v.prom_name}
                onChange={e => {
                  onField(cat.slug, 'prom_name', e.target.value);
                  onSearch(cat.slug, e.target.value);
                }}
                onFocus={() => onDropFocus(cat.slug)}
                onBlur={() => onDropBlur(cat.slug)}
                placeholder="ID або назва Prom…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '5px 8px', borderRadius: 5,
                  border: '1px solid #CBD5E1', fontSize: 12,
                  color: '#374151', background: '#fff', outline: 'none',
                }}
              />
              {dropOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                  background: '#fff', border: '1px solid #CBD5E1', borderRadius: 8,
                  boxShadow: '0 4px 24px rgba(0,0,0,.18)', marginTop: 3,
                  display: 'flex', flexDirection: 'column',
                }}>
                  {dropLoading ? (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: '#94A3B8' }}>Пошук…</div>
                  ) : suggestions.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: '#94A3B8' }}>Нічого не знайдено</div>
                  ) : (
                    <>
                      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {suggestions.map(entry => (
                          <div
                            key={entry.prom_category_id}
                            onMouseDown={() => onPick(cat.slug, entry)}
                            style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 2 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#F0FDF4')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#059669', flexShrink: 0 }}>{entry.prom_category_id}</span>
                              <span style={{ color: '#1E293B', fontWeight: 600 }}>{entry.name}</span>
                              {entry.commission_single != null && (
                                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: pctColor(entry.commission_single), flexShrink: 0 }}>{entry.commission_single}%</span>
                              )}
                            </div>
                            {entry.path && <div style={{ fontSize: 10, color: '#9CA3AF' }}>{entry.path}</div>}
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: '4px 12px', fontSize: 10, color: '#94A3B8', borderTop: '1px solid #F1F5F9', background: '#FAFAFA', borderRadius: '0 0 8px 8px' }}>
                        {v.prom_name.length < 2 ? `Перші ${suggestions.length} · введи запит для звуження` : `${suggestions.length} результатів`}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Кнопка каталогу */}
            <button
              onMouseDown={e => { e.preventDefault(); onCatalog(cat.slug); }}
              title="Переглянути повний каталог Prom"
              style={{
                flexShrink: 0, padding: '5px 7px', borderRadius: 5,
                border: '1px solid #CBD5E1', background: '#F8FAFC',
                color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center',
              }}
            >
              <List size={13} />
            </button>
          </div>
        )}
      </div>

      {/* 4 plan commission columns */}
      {PLANS.map(p => {
        const pct = planPct(v, p.key);
        const isActive = p.key === plan;
        return (
          <div key={p.key} style={{
            fontSize: 13, fontWeight: isActive ? 700 : 500,
            color: pct != null ? pctColor(pct) : '#E5E7EB',
            textAlign: 'center',
            background: isActive && pct != null ? `${p.color}08` : 'transparent',
            borderRadius: 4, padding: '2px 4px',
          }}>
            {pct != null ? `${Number(pct).toFixed(2)}%` : '—'}
          </div>
        );
      })}

      {/* Зберегти */}
      <button
        onClick={() => onSave(cat.slug)}
        disabled={isSaving}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '5px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none',
          background: isSaved ? '#ECFDF5' : '#0EA5E9',
          color: isSaved ? '#059669' : '#fff',
          cursor: isSaving ? 'not-allowed' : 'pointer',
          opacity: isSaving ? 0.6 : 1,
        }}
      >
        {isSaved ? <><CheckCircle size={12} /> OK</> : <><Save size={12} /> Зберегти</>}
      </button>
    </div>
  );
}

// ── Основний компонент ────────────────────────────────────────────────────────

export default function PromCommissionsClient({ categories, plan: initialPlan }: Props) {
  const [plan,       setPlan]       = useState<Plan>(initialPlan);
  const [savingPlan, setSavingPlan] = useState(false);

  const [vals, setVals] = useState<Record<string, RowVals>>(
    Object.fromEntries(categories.map(c => [c.slug, {
      prom_id:           c.prom_section_id   != null ? String(c.prom_section_id) : '',
      prom_name:         c.prom_section_name ?? '',
      commission_single: c.prom_commission_pct             != null ? String(c.prom_commission_pct)            : '',
      commission_ecom:   c.prom_commission_pct_econom      != null ? String(c.prom_commission_pct_econom)     : '',
      commission_more:   c.prom_commission_pct_more_sales  != null ? String(c.prom_commission_pct_more_sales) : '',
      commission_turbo:  c.prom_commission_pct_turbo       != null ? String(c.prom_commission_pct_turbo)      : '',
      markup:            c.prom_markup_pct != null ? String(c.prom_markup_pct) : '',
    }]))
  );

  const [saving, setSaving] = useState<string | null>(null);
  const [saved,  setSaved]  = useState<Record<string, boolean>>({});

  // Autocomplete dropdown
  const [drop, setDrop] = useState<{ slug: string | null; items: RefEntry[]; loading: boolean }>({
    slug: null, items: [], loading: false,
  });

  // Каталог-браузер
  const [catalogSlug, setCatalogSlug] = useState<string | null>(null);

  const onField = useCallback((slug: string, field: keyof RowVals, val: string) => {
    setVals(p => ({ ...p, [slug]: { ...p[slug], [field]: val } }));
  }, []);

  const onSearch = useCallback(async (slug: string, q: string) => {
    setDrop(d => ({ ...d, loading: true }));
    try {
      const lim = q.length < 2 ? 30 : 20;
      const res  = await fetch(`/api/admin/prom/category-search?q=${encodeURIComponent(q)}&limit=${lim}`);
      const data = await res.json();
      setDrop(d => ({ ...d, items: Array.isArray(data) ? data : [], loading: false }));
    } catch {
      setDrop(d => ({ ...d, items: [], loading: false }));
    }
  }, []);

  const onDropFocus = useCallback((slug: string) => {
    setDrop(d => ({ ...d, slug, loading: true }));
    // Завантажуємо поточний запит (або порожній список)
    fetch(`/api/admin/prom/category-search?q=&limit=30`)
      .then(r => r.json())
      .then(data => setDrop(d => d.slug === slug ? { ...d, items: Array.isArray(data) ? data : [], loading: false } : d))
      .catch(() => setDrop(d => ({ ...d, loading: false })));
  }, []);

  const onDropBlur = useCallback((slug: string) => {
    setTimeout(() => {
      setDrop(d => d.slug === slug ? { slug: null, items: [], loading: false } : d);
    }, 150);
  }, []);

  const onPick = useCallback((slug: string, entry: RefEntry) => {
    setVals(p => ({ ...p, [slug]: {
      ...p[slug],
      prom_id:           String(entry.prom_category_id),
      prom_name:         entry.name,
      commission_single: entry.commission_single != null ? String(entry.commission_single) : '',
      commission_ecom:   entry.commission_ecom   != null ? String(entry.commission_ecom)   : '',
      commission_more:   entry.commission_more   != null ? String(entry.commission_more)   : '',
      commission_turbo:  entry.commission_turbo  != null ? String(entry.commission_turbo)  : '',
    }}));
    setDrop({ slug: null, items: [], loading: false });
    setCatalogSlug(null);
  }, []);

  const onClear = useCallback((slug: string) => {
    setVals(p => ({ ...p, [slug]: {
      ...p[slug],
      prom_id: '', prom_name: '',
      commission_single: '', commission_ecom: '', commission_more: '', commission_turbo: '',
    }}));
    setDrop({ slug: null, items: [], loading: false });
  }, []);

  const onSave = useCallback(async (slug: string) => {
    setSaving(slug);
    const v = vals[slug];
    await fetch('/api/admin/prom/category-commission', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        prom_section_id:   v.prom_id   ? parseInt(v.prom_id)           : null,
        prom_section_name: v.prom_name || null,
        single:            v.commission_single !== '' ? Number(v.commission_single) : null,
        econom:            v.commission_ecom   !== '' ? Number(v.commission_ecom)   : null,
        more_sales:        v.commission_more   !== '' ? Number(v.commission_more)   : null,
        turbo:             v.commission_turbo  !== '' ? Number(v.commission_turbo)  : null,
        prom_markup_pct:   v.markup            !== '' ? Number(v.markup)            : null,
      }),
    });
    setSaving(null);
    setSaved(p => ({ ...p, [slug]: true }));
    setTimeout(() => setSaved(p => ({ ...p, [slug]: false })), 2000);
  }, [vals]);

  async function savePlan(newPlan: Plan) {
    setSavingPlan(true);
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prom_plan: newPlan }),
      });
      setPlan(newPlan);
    } finally {
      setSavingPlan(false);
    }
  }

  const roots    = useMemo(() => categories.filter(c => !c.parent_slug).sort((a, b) => a.name.localeCompare(b.name, 'uk')), [categories]);
  const children = useCallback((slug: string) => categories.filter(c => c.parent_slug === slug).sort((a, b) => a.name.localeCompare(b.name, 'uk')), [categories]);

  const filledCount    = categories.filter(c => vals[c.slug]?.prom_id !== '').length;
  const activePlanMeta = PLANS.find(p => p.key === plan)!;

  function renderRow(cat: Category, indent: number) {
    return (
      <PromRow
        key={cat.slug}
        cat={cat}
        indent={indent}
        v={vals[cat.slug]}
        plan={plan}
        dropOpen={drop.slug === cat.slug && (drop.items.length > 0 || drop.loading)}
        suggestions={drop.items}
        dropLoading={drop.loading}
        isSaving={saving === cat.slug}
        isSaved={!!saved[cat.slug]}
        onField={onField}
        onSearch={onSearch}
        onDropFocus={onDropFocus}
        onDropBlur={onDropBlur}
        onPick={onPick}
        onClear={onClear}
        onSave={onSave}
        onCatalog={setCatalogSlug}
      />
    );
  }

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link href="/admin/prom" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E7EB', color: '#6B7280', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111' }}>Комісії Prom.ua</h1>
          <p style={{ margin: '3px 0 0', color: '#6B7280', fontSize: 13 }}>
            {filledCount} / {categories.length} категорій з Prom ID
            &nbsp;·&nbsp; Активний план: <strong style={{ color: activePlanMeta.color }}>{activePlanMeta.label}</strong>
          </p>
        </div>
      </div>

      {/* Plan selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {PLANS.map(p => (
          <button
            key={p.key}
            onClick={() => !savingPlan && p.key !== plan && savePlan(p.key)}
            style={{
              padding: '10px 14px', borderRadius: 9, textAlign: 'left',
              border: `2px solid ${plan === p.key ? p.color : '#E5E7EB'}`,
              background: plan === p.key ? `${p.color}10` : '#F9FAFB',
              color: plan === p.key ? p.color : '#374151',
              cursor: savingPlan ? 'not-allowed' : 'pointer',
              fontWeight: plan === p.key ? 700 : 400, fontSize: 13,
            }}
          >
            {plan === p.key ? '★ ' : ''}{p.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: GRID,
          gap: 6, padding: '8px 10px',
          background: '#F1F5F9', borderBottom: '1px solid #E2E8F0',
          fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em',
        }}>
          <div>Категорія</div>
          <div>Prom категорія</div>
          {PLANS.map(p => (
            <div key={p.key} style={{ textAlign: 'center', color: plan === p.key ? p.color : '#94A3B8' }}>
              {plan === p.key ? '★ ' : ''}{p.short}
            </div>
          ))}
          <div />
        </div>

        {roots.map(root => (
          <div key={root.slug}>
            {renderRow(root, 0)}
            {children(root.slug).map(child => (
              <div key={child.slug}>
                {renderRow(child, 1)}
                {children(child.slug).map(grand => renderRow(grand, 2))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
        Введи ID або назву для швидкого пошуку, або натисни <List size={11} style={{ verticalAlign: 'middle' }} /> щоб переглянути повний каталог Prom.
      </p>

      {/* Каталог-браузер */}
      {catalogSlug && (
        <CatalogModal
          onPick={entry => onPick(catalogSlug, entry)}
          onClose={() => setCatalogSlug(null)}
        />
      )}
    </div>
  );
}
