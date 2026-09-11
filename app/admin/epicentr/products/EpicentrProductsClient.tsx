'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { epicentrPrice, epicentrMargin } from '../../../../lib/marketplace-pricing';

export type EpiProduct  = { sku: string; name: string; brand: string | null; category_slug: string | null; volume: string | null; on_epicentr: boolean | null; epicentr_markup_pct: number | null };
export type EpiStock    = { sku: string; price_cost: number | null; price_retail: number | null; stock_status: string | null };
export type EpiCategory = { slug: string; name: string; epicentr_commission_pct: number | null; epicentr_markup_pct: number | null; epicentr_category_code: string | null };

type Props = { products: EpiProduct[]; stock: EpiStock[]; categories: EpiCategory[]; fallbackPct: number };

const fmt = (n: number) => n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
const inp: React.CSSProperties = { width: 64, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5, textAlign: 'right', background: '#fff' };
const codeInp: React.CSSProperties = { ...inp, width: 90, textAlign: 'left', fontFamily: 'monospace' };

/**
 * Товари й категорії для Епіцентру: одна таблиця, згрупована по категоріях.
 * Рядок категорії — комісія / націнка / код категорії Епіцентру (для <category code>
 * у фіді) і перемикач «усі товари категорії». Рядок товару — участь у фіді,
 * товарний override націнки, розрахункова ціна та чистий прибуток ТІЄЮ САМОЮ
 * формулою, що йде у фід і в пуш через API (lib/marketplace-pricing.epicentrPrice).
 */
export default function EpicentrProductsClient({ products: initialProducts, stock, categories: initialCats, fallbackPct }: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [cats, setCats]         = useState(initialCats);
  const [q, setQ]               = useState('');
  const [onlyOn, setOnlyOn]     = useState(false);
  const [open, setOpen]         = useState<Record<string, boolean>>({});
  const [err, setErr]           = useState<string | null>(null);

  const stockMap = useMemo(() => new Map(stock.map(s => [s.sku, s])), [stock]);
  const catMap   = useMemo(() => new Map(cats.map(c => [c.slug, c])), [cats]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const by = new Map<string, EpiProduct[]>();
    for (const p of products) {
      if (onlyOn && !p.on_epicentr) continue;
      if (needle && !`${p.sku} ${p.name} ${p.brand ?? ''}`.toLowerCase().includes(needle)) continue;
      const key = p.category_slug ?? '';
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(p);
    }
    const order = new Map(cats.map((c, i) => [c.slug, i]));
    return [...by.entries()].sort((a, b) => (order.get(a[0]) ?? 9999) - (order.get(b[0]) ?? 9999));
  }, [products, cats, q, onlyOn]);

  async function patchProduct(sku: string, body: Record<string, unknown>) {
    setErr(null);
    const res = await fetch('/api/admin/epicentr/product', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, ...body }) });
    if (!res.ok) { setErr((await res.json()).error ?? 'Помилка збереження'); return false; }
    return true;
  }

  async function toggleProduct(p: EpiProduct) {
    const next = !p.on_epicentr;
    setProducts(ps => ps.map(x => x.sku === p.sku ? { ...x, on_epicentr: next } : x));
    if (!await patchProduct(p.sku, { on_epicentr: next })) {
      setProducts(ps => ps.map(x => x.sku === p.sku ? { ...x, on_epicentr: !next } : x));
    }
  }

  async function setMarkup(p: EpiProduct, raw: string) {
    const val = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    if (val !== null && !Number.isFinite(val)) return;
    if ((p.epicentr_markup_pct ?? null) === val) return;
    setProducts(ps => ps.map(x => x.sku === p.sku ? { ...x, epicentr_markup_pct: val } : x));
    await patchProduct(p.sku, { epicentr_markup_pct: val });
  }

  async function toggleCategory(slug: string, on: boolean) {
    setErr(null);
    setProducts(ps => ps.map(x => x.category_slug === slug ? { ...x, on_epicentr: on } : x));
    const res = await fetch('/api/admin/epicentr/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category_slug: slug, on_epicentr: on }) });
    if (!res.ok) setErr((await res.json()).error ?? 'Помилка збереження');
  }

  async function patchCategory(slug: string, field: 'epicentr_commission_pct' | 'epicentr_markup_pct' | 'epicentr_category_code', raw: string) {
    const c = catMap.get(slug);
    if (!c) return;
    const val: string | number | null = field === 'epicentr_category_code'
      ? (raw.trim() || null)
      : (raw.trim() === '' ? null : Number(raw.replace(',', '.')));
    if (typeof val === 'number' && !Number.isFinite(val)) return;
    if ((c[field] ?? null) === val) return;
    setErr(null);
    setCats(cs => cs.map(x => x.slug === slug ? { ...x, [field]: val } : x));
    const res = await fetch('/api/admin/epicentr/category', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, [field]: val }) });
    if (!res.ok) setErr((await res.json()).error ?? 'Помилка збереження');
  }

  const totalOn = products.filter(p => p.on_epicentr).length;

  return (
    <div style={{ padding: '24px 32px 64px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Товари Епіцентр</h1>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>у фіді {totalOn} з {products.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyOn} onChange={e => setOnlyOn(e.target.checked)} /> лише увімкнені
          </label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--text-muted)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Артикул, назва, бренд"
              style={{ padding: '6px 10px 6px 26px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, width: 240 }} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Ціна = вхід × (1 + націнка) ÷ (1 − комісія), округлення вгору до гривні; без входу — від роздрібу. Товарна націнка перебиває категорійну.
        Базова комісія для категорій без ставки — {fallbackPct}% (змінюється на «Огляді»). Код категорії — з дерева категорій Епіцентру (Google-таблиця в кабінеті).
      </div>
      {err && <div style={{ marginBottom: 10, padding: '8px 12px', background: '#FEF2F2', color: '#DC2626', borderRadius: 7, fontSize: 12.5 }}>{err}</div>}

      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="fin-table" style={{ marginTop: 0 }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <td style={{ paddingLeft: 14 }}>Товар / категорія</td>
                <td className="num">У фіді</td>
                <td className="num">Вхід</td>
                <td className="num">Роздріб</td>
                <td className="num">Націнка %</td>
                <td className="num">Комісія %</td>
                <td className="num">Ціна Епіцентр</td>
                <td className="num">Чистий прибуток</td>
                <td>Код категорії</td>
              </tr>
            </thead>
            <tbody>
              {groups.map(([slug, list]) => {
                const cat = catMap.get(slug);
                const isOpen = open[slug] ?? true;
                const onCount = list.filter(p => p.on_epicentr).length;
                const commPct = cat?.epicentr_commission_pct ?? fallbackPct;
                return [
                  <tr key={`c:${slug}`} style={{ background: 'var(--bg-soft)' }}>
                    <td style={{ paddingLeft: 10, fontWeight: 700 }}>
                      <button onClick={() => setOpen(o => ({ ...o, [slug]: !isOpen }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginRight: 6, verticalAlign: 'middle', color: 'var(--text-muted)' }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {cat?.name ?? slug ?? 'Без категорії'}
                      <span style={{ fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>{onCount}/{list.length}</span>
                    </td>
                    <td className="num">
                      <button onClick={() => toggleCategory(slug, onCount < list.length)}
                        style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        {onCount < list.length ? 'увімкнути всі' : 'вимкнути всі'}
                      </button>
                    </td>
                    <td /><td />
                    <td className="num">
                      <input style={inp} defaultValue={cat?.epicentr_markup_pct ?? ''} placeholder="—" inputMode="decimal"
                        onBlur={e => patchCategory(slug, 'epicentr_markup_pct', e.target.value)} />
                    </td>
                    <td className="num">
                      <input style={inp} defaultValue={cat?.epicentr_commission_pct ?? ''} placeholder={String(fallbackPct)} inputMode="decimal"
                        onBlur={e => patchCategory(slug, 'epicentr_commission_pct', e.target.value)} />
                    </td>
                    <td /><td />
                    <td>
                      <input style={codeInp} defaultValue={cat?.epicentr_category_code ?? ''} placeholder="код"
                        onBlur={e => patchCategory(slug, 'epicentr_category_code', e.target.value)} />
                    </td>
                  </tr>,
                  ...(isOpen ? list.map(p => {
                    const s = stockMap.get(p.sku);
                    const cost = s?.price_cost != null ? Number(s.price_cost) : null;
                    const retail = Number(s?.price_retail ?? 0);
                    const inputs = { cost, retail, productMarkupPct: p.epicentr_markup_pct, categoryMarkupPct: cat?.epicentr_markup_pct, commissionPct: Number(commPct) };
                    const price = retail > 0 ? epicentrPrice(inputs) : 0;
                    const margin = retail > 0 ? epicentrMargin(inputs) : null;
                    const out = s?.stock_status && s.stock_status !== 'in_stock';
                    return (
                      <tr key={p.sku} style={{ opacity: p.on_epicentr ? 1 : 0.6 }}>
                        <td className="name" style={{ paddingLeft: 34, maxWidth: 420 }} title={`${p.sku} · ${p.name}`}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-muted)', marginRight: 8 }}>{p.sku}</span>
                          {p.name}{p.volume ? ` · ${p.volume}` : ''}
                          {out && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#B45309' }}>немає</span>}
                        </td>
                        <td className="num">
                          <input type="checkbox" checked={!!p.on_epicentr} onChange={() => toggleProduct(p)} style={{ cursor: 'pointer' }} />
                        </td>
                        <td className="num muted">{cost ? fmt(cost) : '—'}</td>
                        <td className="num muted">{retail ? fmt(retail) : '—'}</td>
                        <td className="num">
                          <input style={inp} defaultValue={p.epicentr_markup_pct ?? ''} placeholder={cat?.epicentr_markup_pct != null ? String(cat.epicentr_markup_pct) : '—'} inputMode="decimal"
                            onBlur={e => setMarkup(p, e.target.value)} />
                        </td>
                        <td className="num muted">{commPct}</td>
                        <td className="num">{price ? `${fmt(price)} ₴` : '—'}</td>
                        <td className="num" style={{ color: margin ? (margin.uah >= 0 ? '#15803D' : '#DC2626') : undefined }}>
                          {margin ? `${fmt(margin.uah)} ₴ · ${margin.pct.toFixed(1)}%` : '—'}
                        </td>
                        <td />
                      </tr>
                    );
                  }) : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
