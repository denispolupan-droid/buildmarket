'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, X, Pencil } from 'lucide-react';

interface Product {
  sku:             string;
  name:            string;
  brand:           string;
  category_slug:   string | null;
  volume:          string | null;
  prom_markup_pct: number | null;
}

interface Stock {
  sku:             string;
  price_cost:      number | null;
  price_retail:    number | null;
  price_unit:      number | null;
  price_wholesale: number | null;
}

interface Category {
  slug:                string;
  name:                string;
  prom_commission_pct: number | null;
  prom_markup_pct:     number | null;
}

interface Props {
  products:   Product[];
  stock:      Stock[];
  categories: Category[];
  plan:       'single' | 'econom';
}

function calcPromPrice(
  basePrice: number,
  markup: number,
  commission: number,
): number {
  return Math.ceil(basePrice * (1 + markup / 100) / (1 - commission / 100));
}

function marginColor(pct: number): string {
  if (pct >= 30) return '#16A34A';
  if (pct >= 20) return '#65A30D';
  if (pct >= 10) return '#D97706';
  if (pct >= 0)  return '#EA580C';
  return '#DC2626';
}

export default function PromPricesClient({ products, stock, categories, plan }: Props) {
  const stockMap    = useMemo(() => new Map(stock.map(s => [s.sku, s])), [stock]);
  const catMap      = useMemo(() => new Map(categories.map(c => [c.slug, c])), [categories]);

  const [search, setSearch]       = useState('');
  const [editSku, setEditSku]     = useState<string | null>(null);
  const [editMarkup, setEditMarkup] = useState('');
  const [editManual, setEditManual] = useState('');
  const [saving, setSaving]       = useState(false);

  // Local overrides so UI reflects saves without full reload
  const [overrides, setOverrides] = useState<Record<string, { prom_markup_pct: number | null; price_wholesale: number | null }>>({});

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return products
      .map(p => {
        const s   = stockMap.get(p.sku);
        const cat = p.category_slug ? catMap.get(p.category_slug) : null;
        const ov  = overrides[p.sku];

        const basePrice  = s?.price_retail ?? s?.price_unit ?? 0;
        const cost       = s?.price_cost ?? null;
        const manual     = ov !== undefined ? ov.price_wholesale   : (s?.price_wholesale ?? null);
        const productMkp = ov !== undefined ? ov.prom_markup_pct   : p.prom_markup_pct;
        const markup     = productMkp ?? cat?.prom_markup_pct ?? 0;
        const commission = cat?.prom_commission_pct ?? 0;

        const promPrice  = manual && manual > 0
          ? manual
          : (basePrice > 0 ? calcPromPrice(basePrice, markup, commission) : null);

        const netAfterCommission = promPrice != null
          ? promPrice * (1 - commission / 100)
          : null;
        const marginUah = netAfterCommission != null && cost != null
          ? netAfterCommission - cost
          : null;
        const marginPct = marginUah != null && netAfterCommission != null && netAfterCommission > 0
          ? (marginUah / netAfterCommission) * 100
          : null;

        return { p, s, cat, basePrice, cost, manual, productMkp, markup, commission, promPrice, marginUah, marginPct };
      })
      .filter(r => {
        if (!q) return true;
        return r.p.name.toLowerCase().includes(q)
          || r.p.sku.toLowerCase().includes(q)
          || r.p.brand.toLowerCase().includes(q)
          || (r.p.category_slug ?? '').toLowerCase().includes(q);
      });
  }, [products, stockMap, catMap, overrides, search]);

  function startEdit(row: typeof rows[0]) {
    setEditSku(row.p.sku);
    setEditMarkup(row.productMkp != null ? String(row.productMkp) : '');
    setEditManual(row.manual != null ? String(row.manual) : '');
  }

  async function save(sku: string) {
    setSaving(true);
    const markup  = parseFloat(editMarkup);
    const manual  = parseFloat(editManual);
    try {
      await Promise.all([
        fetch('/api/admin/products/prom-price', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku,
            prom_markup_pct:  isNaN(markup) ? null : markup,
            price_wholesale:  isNaN(manual) ? null : manual,
          }),
        }),
      ]);
      setOverrides(prev => ({
        ...prev,
        [sku]: {
          prom_markup_pct: isNaN(markup) ? null : markup,
          price_wholesale: isNaN(manual) ? null : manual,
        },
      }));
      setEditSku(null);
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.p.category_slug ?? '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/prom" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E7EB', color: '#6B7280', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111' }}>Ціни Prom.ua</h1>
          <p style={{ margin: '3px 0 0', color: '#6B7280', fontSize: 13 }}>
            Наценка категорії → товар. Ручна ціна скасовує розрахунок.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', fontSize: 12, color: '#374151' }}>
        {([['#16A34A', '≥ 30%'], ['#65A30D', '20–30%'], ['#D97706', '10–20%'], ['#EA580C', '0–10%'], ['#DC2626', '< 0%']] as [string, string][]).map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            {label}
          </div>
        ))}
        <span style={{ color: '#9CA3AF' }}>— маржа після комісії Prom</span>
      </div>

      <input
        type="text" placeholder="Пошук по назві, SKU, бренду, категорії..."
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 20, boxSizing: 'border-box', outline: 'none' }}
      />

      {[...grouped.entries()].map(([catSlug, catRows]) => {
        const catName = catRows[0]?.cat?.name ?? catSlug;
        const catCommission = catRows[0]?.commission ?? 0;
        const catMarkup     = catRows[0]?.cat?.prom_markup_pct;
        return (
          <div key={catSlug} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{catName}</span>
              <span style={{ fontSize: 12, color: '#9CA3AF', fontFamily: 'monospace' }}>{catSlug}</span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                комісія <strong>{catCommission}%</strong>
                {catMarkup != null && <> · наценка кат. <strong>+{catMarkup}%</strong></>}
              </span>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={th}>Товар</th>
                    <th style={{ ...th, width: 90 }}>Собів.</th>
                    <th style={{ ...th, width: 90 }}>Роздріб</th>
                    <th style={{ ...th, width: 80 }}>Наценка</th>
                    <th style={{ ...th, width: 90 }}>Ціна Prom</th>
                    <th style={{ ...th, width: 80 }}>Маржа грн</th>
                    <th style={{ ...th, width: 70 }}>Маржа %</th>
                    <th style={{ ...th, width: 90 }}>Ручна ціна</th>
                    <th style={{ width: 36 }} />
                  </tr>
                </thead>
                <tbody>
                  {catRows.map(r => {
                    const isEditing = editSku === r.p.sku;
                    return (
                      <tr key={r.p.sku} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '8px 14px' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>
                            {r.p.brand} {r.p.name}{r.p.volume ? ` ${r.p.volume}` : ''}
                          </div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{r.p.sku}</div>
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 13, color: '#6B7280' }}>
                          {r.cost != null ? `${r.cost.toFixed(0)} ₴` : <span style={{ color: '#D1D5DB' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 13 }}>
                          {r.basePrice > 0 ? `${r.basePrice.toFixed(0)} ₴` : <span style={{ color: '#D1D5DB' }}>—</span>}
                        </td>

                        {isEditing ? (
                          <>
                            <td style={{ padding: '6px 8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <input type="number" step="0.1" min="0" value={editMarkup}
                                  onChange={e => setEditMarkup(e.target.value)}
                                  placeholder={r.cat?.prom_markup_pct != null ? `кат: ${r.cat.prom_markup_pct}` : '0'}
                                  style={{ width: 52, height: 28, padding: '0 5px', border: '1.5px solid #6B7280', borderRadius: 6, fontSize: 12, outline: 'none' }} />
                                <span style={{ fontSize: 11, color: '#9CA3AF' }}>%</span>
                              </div>
                            </td>
                            <td style={{ padding: '6px 8px', fontSize: 13, color: '#6B7280' }}>
                              {r.promPrice != null ? `${r.promPrice} ₴` : '—'}
                            </td>
                            <td style={{ padding: '6px 8px', fontSize: 13, color: '#6B7280' }}>
                              {r.marginUah != null ? `${r.marginUah.toFixed(0)} ₴` : '—'}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              {r.marginPct != null
                                ? <span style={{ fontSize: 12, fontWeight: 700, color: marginColor(r.marginPct) }}>{r.marginPct.toFixed(1)}%</span>
                                : <span style={{ color: '#D1D5DB' }}>—</span>}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input type="number" step="1" min="0" value={editManual}
                                onChange={e => setEditManual(e.target.value)}
                                placeholder="0 = авто"
                                style={{ width: 72, height: 28, padding: '0 5px', border: '1.5px solid #C2410C', borderRadius: 6, fontSize: 12, outline: 'none' }} />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <div style={{ display: 'flex', gap: 3 }}>
                                <button onClick={() => save(r.p.sku)} disabled={saving}
                                  style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid #16A34A', background: '#F0FDF4', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Check size={12} />
                                </button>
                                <button onClick={() => setEditSku(null)}
                                  style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <X size={12} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '8px 14px' }}>
                              {r.productMkp != null
                                ? <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>+{r.productMkp}%</span>
                                : <span style={{ fontSize: 12, color: '#D1D5DB' }}>кат</span>}
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              {r.promPrice != null
                                ? <span style={{ fontSize: 13, fontWeight: 700, color: r.manual ? '#C2410C' : '#111' }}>
                                    {r.promPrice} ₴{r.manual ? ' ✎' : ''}
                                  </span>
                                : <span style={{ color: '#D1D5DB' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              {r.marginUah != null
                                ? <span style={{ fontSize: 13, color: marginColor(r.marginPct ?? 0) }}>{r.marginUah.toFixed(0)} ₴</span>
                                : <span style={{ color: '#D1D5DB' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              {r.marginPct != null
                                ? <span style={{ fontSize: 13, fontWeight: 700, color: marginColor(r.marginPct) }}>{r.marginPct.toFixed(1)}%</span>
                                : <span style={{ color: '#D1D5DB' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              {r.manual != null && r.manual > 0
                                ? <span style={{ fontSize: 12, color: '#C2410C', fontWeight: 600 }}>{r.manual} ₴</span>
                                : <span style={{ fontSize: 11, color: '#D1D5DB' }}>авто</span>}
                            </td>
                            <td style={{ padding: '8px 8px' }}>
                              <button onClick={() => startEdit(r)}
                                style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid #E5E7EB', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Pencil size={11} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '8px 14px', textAlign: 'left', fontSize: 11,
  fontWeight: 700, color: '#6B7280', textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
