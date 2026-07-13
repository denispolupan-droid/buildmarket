'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle, XCircle, HelpCircle,
  ExternalLink, ChevronDown, ChevronUp, Play, Search,
} from 'lucide-react';
import type { Category } from '../../../types';

/* ── Search query (mirrors lib/price-checker — can't import server lib) ─ */
function buildSearchQuery(name: string, volume?: string | null): string {
  const shortName = name.split('—')[0].trim();
  const cleaned   = shortName.replace(/\([^)]{0,20}\)/g, '').trim();
  const q = volume ? `${cleaned} ${volume}` : cleaned;
  return q.replace(/\s+/g, ' ').trim();
}

/* ── Types ────────────────────────────────────────────────────────────── */

interface MarketPrice {
  source:     'rozetka' | 'prom' | 'epicentr';
  title:      string;
  price:      number;
  url:        string;
  confidence: number;
}

interface CheckData {
  sku:         string;
  our_price:   number | null;
  rozetka_min: number | null;
  prom_min:    number | null;
  market_min:  number | null;
  market_avg:  number | null;
  match_count: number;
  delta_pct:   number | null;
  status:      string;
  results:     MarketPrice[];
  checked_at:  string;
}

interface Row {
  sku:              string;
  name:             string;
  brand:            string | null;
  volume:           string | null;
  category_slug:    string | null;
  our_price:        number | null;   // price_unit (B2B/wholesale)
  our_price_retail: number | null;   // price_retail (shown to end customers)
  check:            CheckData | null;
}

interface Props {
  rows: Row[];
  categories: Category[];
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  expensive:   { icon: <TrendingUp size={14} />,    label: 'Дорого',    color: '#EF4444', bg: '#FEF2F2' },
  warning:     { icon: <AlertTriangle size={14} />, label: 'Увага',     color: '#F59E0B', bg: '#FFFBEB' },
  ok:          { icon: <CheckCircle size={14} />,   label: 'ОК',        color: '#10B981', bg: '#ECFDF5' },
  cheap:       { icon: <TrendingDown size={14} />,  label: 'Нижче ринку', color: '#3B82F6', bg: '#EFF6FF' },
  not_found:   { icon: <XCircle size={14} />,       label: 'Не знайдено', color: '#9CA3AF', bg: '#F9FAFB' },
  not_checked: { icon: <HelpCircle size={14} />,    label: 'Не перевірено', color: '#9CA3AF', bg: '#F9FAFB' },
};

type Filter = 'all' | 'expensive' | 'warning' | 'ok' | 'cheap' | 'not_found' | 'not_checked';

function fmt(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ₴';
}

function fmtDelta(d: number | null) {
  if (d == null) return '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d}%`;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'менше години';
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
}

/* ── Status badge ─────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_checked;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20,
      fontSize: 12, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

/* ── Results drawer ───────────────────────────────────────────────────── */
function ResultsDrawer({ results }: { results: MarketPrice[] }) {
  if (results.length === 0) return <span style={{ color: '#9CA3AF', fontSize: 13 }}>Результати відсутні</span>;

  const sorted = [...results].sort((a, b) => a.price - b.price);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      {sorted.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 10px', borderRadius: 8,
          background: i === 0 ? '#F0FDF4' : '#F9FAFB',
          border: `1px solid ${i === 0 ? '#BBF7D0' : '#E5E7EB'}`,
          fontSize: 13,
        }}>
          <span style={{
            padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: r.source === 'rozetka' ? '#EEF2FF'
                      : r.source === 'epicentr' ? '#F0FDF4'
                      : '#FFF7ED',
            color:      r.source === 'rozetka' ? '#4338CA'
                      : r.source === 'epicentr' ? '#15803D'
                      : '#C2410C',
          }}>
            {r.source === 'rozetka' ? 'Rozetka'
           : r.source === 'epicentr' ? 'Epicentr'
           : 'Prom.ua'}
          </span>
          <a
            href={r.url} target="_blank" rel="noreferrer"
            style={{
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: '#111', textDecoration: 'none', fontWeight: 500,
            }}
            title={r.url}
          >
            {r.title}
          </a>
          <span style={{ fontWeight: 700, color: '#111', whiteSpace: 'nowrap' }}>
            {r.price.toLocaleString('uk-UA')} ₴
          </span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
            {Math.round(r.confidence * 100)}% збіг
          </span>
          <ExternalLink size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */

export default function PricingClient({ rows, categories }: Props) {
  const [filter, setFilter]           = useState<Filter>('all');
  const [search, setSearch]           = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [sortByDemand, setSortByDemand] = useState(false);
  const [checks, setChecks]           = useState<Record<string, CheckData>>(() => {
    const m: Record<string, CheckData> = {};
    for (const r of rows) if (r.check) m[r.sku] = r.check;
    return m;
  });
  const [loading, setLoading]         = useState<Record<string, boolean>>({});
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({});
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const parentCats = useMemo(() => categories.filter(c => !c.parent_slug), [categories]);

  /* check single product */
  const checkOne = useCallback(async (sku: string) => {
    setLoading(prev => ({ ...prev, [sku]: true }));
    try {
      const resp = await fetch('/api/admin/pricing/check', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sku }),
      });
      if (resp.ok) {
        const data = await resp.json() as CheckData;
        setChecks(prev => ({ ...prev, [sku]: data }));
      }
    } finally {
      setLoading(prev => ({ ...prev, [sku]: false }));
    }
  }, []);

  /* check a given list of skus (defaults to everything) with progress */
  const checkAll = useCallback(async (skus?: string[]) => {
    const pending = skus ?? rows.map(r => r.sku);
    setBatchProgress({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      await checkOne(pending[i]);
      setBatchProgress({ done: i + 1, total: pending.length });
      if (i < pending.length - 1) await new Promise(r => setTimeout(r, 600));
    }
    setBatchProgress(null);
  }, [rows, checkOne]);

  /* computed rows after search + category + status filter + optional sort by demand */
  const visibleRows = useMemo(() => {
    let list = rows;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        (r.brand ?? '').toLowerCase().includes(q)
      );
    }

    if (filterCategory) {
      const children = categories.filter(c => c.parent_slug === filterCategory).map(c => c.slug);
      const slugs = new Set([filterCategory, ...children]);
      list = list.filter(r => slugs.has(r.category_slug ?? ''));
    }

    list = list.filter(r => {
      const status = checks[r.sku]?.status ?? r.check?.status ?? 'not_checked';
      return filter === 'all' || status === filter;
    });

    if (!sortByDemand) return list;
    return [...list].sort((a, b) => {
      const ca = checks[a.sku]?.match_count ?? a.check?.match_count ?? 0;
      const cb = checks[b.sku]?.match_count ?? b.check?.match_count ?? 0;
      return cb - ca;
    });
  }, [rows, categories, checks, filter, search, filterCategory, sortByDemand]);

  /* stats (always over the full set, unaffected by search/category/status filters) */
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const s = checks[r.sku]?.status ?? r.check?.status ?? 'not_checked';
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [rows, checks]);

  const isBatchRunning = batchProgress !== null;

  /* selection helpers — operate on the currently visible (filtered) rows */
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(r => selected.has(r.sku));
  const someSelected = selected.size > 0;

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        visibleRows.forEach(r => next.delete(r.sku));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        visibleRows.forEach(r => next.add(r.sku));
        return next;
      });
    }
  }

  function toggleSelect(sku: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Аналіз цін</h1>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: 14 }}>
            Порівняння ваших цін з Prom.ua та Epicentr
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {someSelected && (
            <button
              onClick={() => checkAll(Array.from(selected))}
              disabled={isBatchRunning}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 10,
                background: isBatchRunning ? '#E5E7EB' : '#10B981',
                color: isBatchRunning ? '#9CA3AF' : '#fff',
                border: 'none', cursor: isBatchRunning ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap',
              }}
            >
              <Play size={16} /> Перевірити вибрані ({selected.size})
            </button>
          )}
          <button
            onClick={() => checkAll()}
            disabled={isBatchRunning}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10,
              background: isBatchRunning ? '#E5E7EB' : '#1D4ED8',
              color: isBatchRunning ? '#9CA3AF' : '#fff',
              border: 'none', cursor: isBatchRunning ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap',
            }}
          >
            {isBatchRunning ? (
              <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                {batchProgress!.done}/{batchProgress!.total} перевірено</>
            ) : (
              <><Play size={16} /> Перевірити всі ({rows.length})</>
            )}
          </button>
        </div>
      </div>

      {/* Search + category filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder="Пошук за назвою, SKU, брендом..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', height: 44, paddingLeft: 42, paddingRight: 16,
              borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none',
            }}
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          style={{
            flex: '0 1 240px', height: 44, padding: '0 16px', borderRadius: 10,
            border: '1px solid #E5E7EB', fontSize: 14,
            background: filterCategory ? '#EFF6FF' : '#fff',
          }}
        >
          <option value="">Всі категорії</option>
          {parentCats.map(c => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Selection bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, minHeight: 28 }}>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          Знайдено: {visibleRows.length} товарів
          {someSelected && (
            <span style={{ marginLeft: 8, color: '#10B981', fontWeight: 600 }}>
              · вибрано {selected.size}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!allVisibleSelected && visibleRows.length > 0 && (
            <button
              onClick={() => setSelected(new Set(visibleRows.map(r => r.sku)))}
              style={{
                height: 30, padding: '0 12px', borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#fff',
                color: '#6B7280', fontSize: 13, cursor: 'pointer',
              }}
            >
              Вибрати всі {visibleRows.length}
            </button>
          )}
          {someSelected && (
            <button
              onClick={() => setSelected(new Set())}
              style={{
                height: 30, padding: '0 12px', borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#fff',
                color: '#6B7280', fontSize: 13, cursor: 'pointer',
              }}
            >
              Зняти вибір
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['expensive', 'warning', 'ok', 'cheap', 'not_found', 'not_checked'] as const).map(s => {
          const cfg = STATUS_CONFIG[s];
          const count = stats[s] ?? 0;
          return (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? 'all' : s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10,
                background: filter === s ? cfg.bg : '#F9FAFB',
                color:      filter === s ? cfg.color : '#374151',
                border:    `1.5px solid ${filter === s ? cfg.color + '60' : '#E5E7EB'}`,
                cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}
            >
              {cfg.icon} {cfg.label}
              <span style={{
                marginLeft: 2, background: filter === s ? cfg.color : '#E5E7EB',
                color: filter === s ? '#fff' : '#6B7280',
                borderRadius: 20, padding: '1px 7px', fontSize: 12,
              }}>
                {count}
              </span>
            </button>
          );
        })}
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '8px 14px', borderRadius: 10, background: 'transparent',
              border: '1.5px solid #E5E7EB', color: '#6B7280',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            × Скинути фільтр
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB',
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr 95px 95px 110px 110px 90px 110px 130px 100px',
          padding: '12px 16px',
          background: '#F9FAFB', borderBottom: '1px solid #E5E7EB',
          fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            style={{ cursor: 'pointer', width: 15, height: 15 }}
          />
          <span>Товар</span>
          <span style={{ textAlign: 'right' }}>Роздріб</span>
          <span style={{ textAlign: 'right' }}>Опт</span>
          <span style={{ textAlign: 'right' }}>Мін. ринку</span>
          <button
            onClick={() => setSortByDemand(v => !v)}
            style={{
              textAlign: 'center', background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', fontWeight: 700, fontSize: 12, color: sortByDemand ? '#F59E0B' : '#6B7280',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
            title="Сортувати за попитом"
          >
            Попит {sortByDemand ? '▼' : '↕'}
          </button>
          <span style={{ textAlign: 'right' }}>Delta</span>
          <span style={{ textAlign: 'center' }}>Статус</span>
          <span style={{ textAlign: 'center' }}>Перевірено</span>
          <span style={{ textAlign: 'center' }}>Дії</span>
        </div>

        {/* Rows */}
        {visibleRows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
            Немає товарів для показу
          </div>
        ) : visibleRows.map(row => {
          const c       = checks[row.sku] ?? row.check;
          const status  = c?.status ?? 'not_checked';
          const cfg     = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_checked;
          const isLoading   = loading[row.sku] ?? false;
          const isExpanded  = expanded[row.sku] ?? false;
          const delta   = c?.delta_pct ?? null;
          const isSelected  = selected.has(row.sku);

          return (
            <div key={row.sku} style={{ borderBottom: '1px solid #F3F4F6' }}>
              {/* Main row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 95px 95px 110px 110px 90px 110px 130px 100px',
                padding: '12px 16px',
                alignItems: 'center',
                background: isSelected ? 'rgba(16,185,129,0.05)' : isLoading ? '#FAFAFA' : undefined,
                transition: 'background 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(row.sku)}
                  style={{ cursor: 'pointer', width: 15, height: 15 }}
                />
                {/* Product name */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#111' }}>
                    {row.brand && <span style={{ color: '#4B5563', marginRight: 4 }}>{row.brand}</span>}
                    {row.name.split('—')[0].trim()}
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                    {row.sku}{row.volume ? ` · ${row.volume}` : ''}
                  </div>
                  <div style={{
                    fontSize: 11, color: '#94A3B8', marginTop: 3,
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  }}>
                    <span style={{ opacity: 0.6 }}>🔍</span>
                    <a
                      href={`https://prom.ua/ua/search?search_term=${encodeURIComponent(buildSearchQuery(row.name, row.volume))}`}
                      target="_blank" rel="noreferrer"
                      style={{
                        fontFamily: 'monospace', background: '#F1F5F9',
                        padding: '1px 5px', borderRadius: 4,
                        color: '#64748B', textDecoration: 'none',
                      }}
                      title="Пошук на Prom.ua"
                    >
                      {buildSearchQuery(row.name, row.volume)}
                    </a>
                    <a
                      href={`https://trends.google.com/trends/explore?q=${encodeURIComponent(buildSearchQuery(row.name, row.volume))}&geo=UA&hl=uk`}
                      target="_blank" rel="noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '1px 6px', borderRadius: 4,
                        background: '#FFF8F0', border: '1px solid #FBBF24',
                        color: '#92400E', textDecoration: 'none',
                        fontFamily: 'sans-serif', fontWeight: 600, fontSize: 10,
                        whiteSpace: 'nowrap',
                      }}
                      title="Переглянути тренд пошукового попиту в Україні"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M3 17l6-6 4 4 8-9" stroke="#4285F4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 17l6-6 4 4 8-9" stroke="#EA4335" strokeWidth="0" />
                      </svg>
                      Google Trends
                    </a>
                  </div>
                </div>

                {/* Prices */}
                <span style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#1E3A5F' }}>{fmt(row.our_price_retail)}</span>
                <span style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, color: '#374151' }}>{fmt(row.our_price)}</span>
                <span style={{ textAlign: 'right', color: '#374151', fontSize: 13 }}>{fmt(c?.market_min ?? null)}</span>

                {/* Demand badge */}
                {(() => {
                  const n = c?.match_count ?? 0;
                  if (!c) return <span style={{ textAlign: 'center', color: '#D1D5DB', fontSize: 13 }}>—</span>;
                  const [emoji, label, color, bg] =
                    n >= 8 ? ['🔥', 'Хіт',    '#B45309', '#FEF3C7'] :
                    n >= 4 ? ['📈', 'Добре',   '#0369A1', '#E0F2FE'] :
                    n >= 1 ? ['📦', 'Є',       '#6B7280', '#F3F4F6'] :
                             ['💤', 'Мало',    '#9CA3AF', '#F9FAFB'];
                  return (
                    <div style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '2px 7px', borderRadius: 12,
                        fontSize: 11, fontWeight: 700, color, background: bg,
                      }} title={`${n} продавців знайдено`}>
                        {emoji} {label}
                        {n > 0 && <span style={{ opacity: 0.7, fontWeight: 400 }}>·{n}</span>}
                      </span>
                    </div>
                  );
                })()}

                {/* Delta */}
                <span style={{
                  textAlign: 'right', fontWeight: 700, fontSize: 13,
                  color: delta == null ? '#9CA3AF'
                       : delta > 10   ? '#EF4444'
                       : delta > 0    ? '#F59E0B'
                       : delta < -10  ? '#3B82F6'
                       : '#10B981',
                }}>
                  {fmtDelta(delta)}
                </span>

                {/* Status */}
                <div style={{ textAlign: 'center' }}>
                  <StatusBadge status={status} />
                </div>

                {/* Checked at */}
                <div style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF' }}>
                  {c?.checked_at ? relTime(c.checked_at) : '—'}
                </div>

                {/* Actions */}
                <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 6 }}>
                  <button
                    onClick={() => checkOne(row.sku)}
                    disabled={isLoading || isBatchRunning}
                    title="Перевірити"
                    style={{
                      padding: '5px 8px', borderRadius: 7,
                      background: 'transparent', border: '1.5px solid #E5E7EB',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      color: '#6B7280', display: 'flex', alignItems: 'center',
                    }}
                  >
                    <RefreshCw size={14} style={isLoading ? { animation: 'spin 1s linear infinite' } : {}} />
                  </button>
                  {c && c.results.length > 0 && (
                    <button
                      onClick={() => setExpanded(prev => ({ ...prev, [row.sku]: !isExpanded }))}
                      title="Деталі"
                      style={{
                        padding: '5px 8px', borderRadius: 7,
                        background: 'transparent', border: '1.5px solid #E5E7EB',
                        cursor: 'pointer', color: '#6B7280',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded results */}
              {isExpanded && c && (
                <div style={{
                  padding: '0 16px 14px 16px',
                  background: '#FAFAFA',
                  borderTop: '1px solid #F3F4F6',
                }}>
                  <ResultsDrawer results={c.results} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Batch progress footer */}
      {batchProgress && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#1D4ED8', color: '#fff',
          padding: '12px 20px', borderRadius: 12,
          fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
          Перевіряю {batchProgress.done}/{batchProgress.total}…
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
