'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Check, X, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { computeSmartFee, type SmartBracket } from '../../../../lib/rozetka-smart-tariff';

interface Product {
  sku:               string;
  name:              string;
  rozetka_name:      string | null;
  brand:             string;
  category_slug:     string | null;
  color:             string | null;
  volume:            string | null;
  on_rozetka:        boolean | null;
  rozetka_markup_pct: number | null;
  rozetka_smart:     boolean | null;
}
interface Stock {
  sku:          string;
  price_retail: number | null;
  price_unit:   number | null;
  price_cost:   number | null;
}
interface Category {
  slug:                   string;
  name:                   string;
  rozetka_commission_pct: number | null;
  rozetka_markup_pct:     number | null;
  rozetka_category_id:    string | null;
  rozetka_category_name:  string | null;
}

function calcRzPrice(base: number, markup: number, commission: number): number {
  const withMarkup = base * (1 + markup / 100);
  const withComm   = commission > 0 ? withMarkup / (1 - commission / 100) : withMarkup;
  return Math.ceil(withComm / 5) * 5;
}

// Rozetka Smart: та сама формула, що у фіді (app/api/rozetka/feed) — надбавка
// покриває компенсацію доставки (тариф з адмінки, «Умови Smart») з урахуванням
// комісії на саму надбавку, зі ступінчастим перескоком порогів.
function calcSmartPrice(P: number, commission: number, tariff: SmartBracket[]): number {
  const c = commission > 0 ? commission / 100 : 0.15;
  const feeOf = (p: number) => computeSmartFee(p, tariff);
  let fee = feeOf(P);
  let raised = P + fee / (1 - c);
  if (feeOf(raised) !== fee) {
    const fee2 = feeOf(raised);
    const raised2 = P + fee2 / (1 - c);
    if (feeOf(raised2) === fee2) { fee = fee2; raised = raised2; }
  }
  return Math.ceil(raised / 5) * 5;
}

function marginColor(pct: number) {
  if (pct >= 30) return '#16A34A';
  if (pct >= 20) return '#65A30D';
  if (pct >= 10) return '#D97706';
  if (pct >= 0)  return '#EA580C';
  return '#DC2626';
}

const TH: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
  fontSize: 11, color: '#64748B', whiteSpace: 'nowrap',
  borderBottom: '1px solid #E2E8F0', background: '#FAFAFA',
  textTransform: 'uppercase', letterSpacing: '.03em',
};

export default function RozetkaProductsClient({ products, stock, categories, smartTariff }: {
  products:    Product[];
  stock:       Stock[];
  categories:  Category[];
  smartTariff: SmartBracket[];
}) {
  const stockMap = useMemo(() => new Map(stock.map(s => [s.sku, s])), [stock]);
  const catMap   = useMemo(() => new Map(categories.map(c => [c.slug, c])), [categories]);

  const [search,       setSearch]       = useState('');
  const [filterBrand,  setFilterBrand]  = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [collapsed,    setCollapsed]    = useState<Record<string, boolean>>({});

  const [enabled,  setEnabled]  = useState<Record<string, boolean>>(
    Object.fromEntries(products.map(p => [p.sku, p.on_rozetka !== false]))
  );
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const [smart, setSmart] = useState<Record<string, boolean>>(
    Object.fromEntries(products.map(p => [p.sku, p.rozetka_smart === true]))
  );
  const [smartToggling, setSmartToggling] = useState<Set<string>>(new Set());

  const [markups,      setMarkups]      = useState<Record<string, string>>(
    Object.fromEntries(products.map(p => [p.sku, p.rozetka_markup_pct != null ? String(p.rozetka_markup_pct) : '']))
  );
  const [savingMarkup, setSavingMarkup] = useState<string | null>(null);

  const [catMarkupInputs, setCatMarkupInputs] = useState<Record<string, string>>({});
  const [catSaving,       setCatSaving]       = useState<string | null>(null);

  const [globalMarkup, setGlobalMarkup] = useState('');
  const [globalSaving, setGlobalSaving] = useState(false);

  // rozetka_name editing
  const [editSku,    setEditSku]    = useState<string | null>(null);
  const [editName,   setEditName]   = useState('');
  const [savingName, setSavingName] = useState(false);
  const [rzNames,    setRzNames]    = useState<Record<string, string>>(
    Object.fromEntries(products.map(p => [p.sku, p.rozetka_name ?? '']))
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Умови Smart (тариф компенсації доставки): редагується тут, діє з моменту
  // збереження — застосовується до нових відгрузок/фіда, минулі списання не чіпаємо.
  const [tariff,       setTariff]       = useState<SmartBracket[]>(smartTariff);
  const [tariffOpen,   setTariffOpen]   = useState(false);
  const [tariffDraft,  setTariffDraft]  = useState<{ upTo: string; fee: string }[]>(
    smartTariff.map(b => ({ upTo: b.upTo != null ? String(b.upTo) : '', fee: String(b.fee) }))
  );
  const [tariffSaving, setTariffSaving] = useState(false);
  const [tariffError,  setTariffError]  = useState('');

  async function saveTariff() {
    setTariffSaving(true);
    setTariffError('');
    const brackets = tariffDraft.map((b, i) => ({
      upTo: i === tariffDraft.length - 1 ? null : Number(b.upTo),
      fee:  Number(b.fee),
    }));
    const res = await fetch('/api/admin/rozetka/smart-tariff', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brackets }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTariffError(json.error ?? 'Не вдалося зберегти');
    } else {
      setTariff(json.brackets);
      setTariffOpen(false);
    }
    setTariffSaving(false);
  }

  const brands = useMemo(() => {
    const s = new Set(products.map(p => p.brand).filter(Boolean));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'uk'));
  }, [products]);

  const allRows = useMemo(() => products.map(p => {
    const s          = stockMap.get(p.sku);
    const cat        = p.category_slug ? catMap.get(p.category_slug) : null;
    const retailPrice = Number(s?.price_retail ?? s?.price_unit ?? 0);
    const cost        = s?.price_cost != null ? Number(s.price_cost) : null;
    const basePrice   = cost != null && cost > 0 ? cost : retailPrice;
    const mkpStr      = markups[p.sku];
    const productMkp  = mkpStr !== '' ? parseFloat(mkpStr) : null;
    const catMkp      = cat?.rozetka_markup_pct ?? null;
    const markup      = productMkp ?? catMkp ?? 0;
    const commission  = cat?.rozetka_commission_pct ?? 0;
    const baseRz      = basePrice > 0 ? calcRzPrice(basePrice, markup, commission) : null;
    const isSmart     = smart[p.sku] === true;
    const rzPrice     = baseRz != null && isSmart ? calcSmartPrice(baseRz, commission, tariff) : baseRz;
    // Маржа рахується від базової ціни: Smart-надбавка йде на компенсацію доставки, не в маржу
    const net         = baseRz != null && commission > 0 ? baseRz * (1 - commission / 100) : baseRz;
    const marginUah   = net != null && cost != null ? net - cost : null;
    const marginPct   = marginUah != null && net != null && net > 0 ? (marginUah / net) * 100 : null;
    return { p, cat, retailPrice, cost, basePrice, productMkp, catMkp, markup, commission, rzPrice, baseRz, isSmart, marginPct };
  }), [products, stockMap, catMap, markups, smart, tariff]);

  const filteredRows = useMemo(() => {
    let list = allRows;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.p.name.toLowerCase().includes(q) || r.p.sku.toLowerCase().includes(q) || r.p.brand.toLowerCase().includes(q));
    }
    if (filterBrand)            list = list.filter(r => r.p.brand === filterBrand);
    if (filterStatus === 'on')       list = list.filter(r => enabled[r.p.sku] !== false);
    if (filterStatus === 'off')      list = list.filter(r => enabled[r.p.sku] === false);
    if (filterStatus === 'smart')    list = list.filter(r => smart[r.p.sku] === true);
    if (filterStatus === 'nosmart')  list = list.filter(r => smart[r.p.sku] !== true);
    return list;
  }, [allRows, search, filterBrand, filterStatus, enabled, smart]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredRows>();
    for (const r of filteredRows) {
      const key = r.p.category_slug ?? '—';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return map;
  }, [filteredRows]);

  const totalEnabled = products.filter(p => enabled[p.sku] !== false).length;
  const allSlugs     = [...grouped.keys()];
  const allCollapsed = allSlugs.every(s => collapsed[s]);

  // Actions
  async function toggleProduct(sku: string) {
    if (toggling.has(sku)) return;
    const next = !(enabled[sku] !== false);
    setEnabled(prev => ({ ...prev, [sku]: next }));
    setToggling(prev => new Set(prev).add(sku));
    await fetch('/api/admin/rozetka/product', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, on_rozetka: next }) });
    setToggling(prev => { const s = new Set(prev); s.delete(sku); return s; });
  }

  async function toggleSmart(sku: string) {
    if (smartToggling.has(sku)) return;
    const next = !(smart[sku] === true);
    setSmart(prev => ({ ...prev, [sku]: next }));
    setSmartToggling(prev => new Set(prev).add(sku));
    await fetch('/api/admin/rozetka/product', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, rozetka_smart: next }) });
    setSmartToggling(prev => { const s = new Set(prev); s.delete(sku); return s; });
  }

  async function bulkToggle(catSlug: string, val: boolean) {
    const skus = products.filter(p => p.category_slug === catSlug).map(p => p.sku);
    setEnabled(prev => Object.fromEntries([...Object.entries(prev), ...skus.map(s => [s, val])]));
    await fetch('/api/admin/rozetka/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category_slug: catSlug, on_rozetka: val }) });
  }

  async function toggleAll(val: boolean) {
    setEnabled(Object.fromEntries(products.map(p => [p.sku, val])));
    await fetch('/api/admin/rozetka/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on_rozetka: val }) });
  }

  async function saveMarkup(sku: string, val: string) {
    setSavingMarkup(sku);
    const pct = val === '' ? null : parseFloat(val);
    await fetch('/api/admin/rozetka/product', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, rozetka_markup_pct: isNaN(pct as number) ? null : pct }) });
    setSavingMarkup(null);
  }

  async function applyBulkMarkup(catSlug: string) {
    const val = catMarkupInputs[catSlug];
    if (!val) return;
    const pct = parseFloat(val);
    if (isNaN(pct)) return;
    const catItems = products.filter(p => p.category_slug === catSlug);
    setCatSaving(catSlug);
    setMarkups(prev => { const n = { ...prev }; catItems.forEach(p => { n[p.sku] = String(pct); }); return n; });
    await Promise.all(catItems.map(p => fetch('/api/admin/rozetka/product', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: p.sku, rozetka_markup_pct: pct }) })));
    setCatSaving(null);
    setCatMarkupInputs(prev => ({ ...prev, [catSlug]: '' }));
  }

  async function applyGlobalMarkup() {
    if (!globalMarkup) return;
    const pct = parseFloat(globalMarkup);
    if (isNaN(pct)) return;
    setGlobalSaving(true);
    setMarkups(Object.fromEntries(products.map(p => [p.sku, String(pct)])));
    await Promise.all(products.map(p => fetch('/api/admin/rozetka/product', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: p.sku, rozetka_markup_pct: pct }) })));
    setGlobalSaving(false);
    setGlobalMarkup('');
  }

  async function saveName(sku: string) {
    setSavingName(true);
    const name = editName.trim() || null;
    await fetch('/api/admin/rozetka/product', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, rozetka_name: name ?? '' }) });
    setRzNames(prev => ({ ...prev, [sku]: name ?? '' }));
    setEditSku(null);
    setSavingName(false);
  }

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: 1400 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/rozetka" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid #E2E8F0', color: '#6B7280', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111' }}>Товари Rozetka</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6B7280' }}>
            {totalEnabled} / {products.length} увімкнено в Rozetka
            <span style={{ marginLeft: 8, color: '#B45309', fontWeight: 600 }}>· {Object.values(smart).filter(Boolean).length} у Smart</span>
            <button onClick={() => setTariffOpen(v => !v)}
              style={{ marginLeft: 10, padding: '2px 10px', borderRadius: 7, border: '1px solid #FDBA74', background: tariffOpen ? '#FFF7ED' : '#fff', color: '#B45309', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Умови Smart
            </button>
          </p>
        </div>
      </div>

      {/* Умови Smart — редагований тариф компенсації доставки */}
      {tariffOpen && (
        <div style={{ margin: '0 0 20px', padding: '14px 18px', borderRadius: 12, border: '1.5px solid #FDBA74', background: '#FFFBEB', maxWidth: 640 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309', marginBottom: 10 }}>
            Компенсація вартості доставки Smart (грн з ПДВ, за сумою замовлення)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tariffDraft.map((b, i) => {
              const isLast = i === tariffDraft.length - 1;
              const prevUpTo = i > 0 ? tariffDraft[i - 1].upTo : null;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                  <span style={{ minWidth: 170 }}>
                    {isLast
                      ? `замовлення від ${prevUpTo || '…'} грн`
                      : i === 0 ? <>замовлення до{' '}
                          <input value={b.upTo} onChange={e => setTariffDraft(d => d.map((x, j) => j === i ? { ...x, upTo: e.target.value } : x))}
                            style={{ width: 60, padding: '3px 6px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 13, textAlign: 'right' }} /> грн</>
                        : <>{prevUpTo || '…'} –{' '}
                          <input value={b.upTo} onChange={e => setTariffDraft(d => d.map((x, j) => j === i ? { ...x, upTo: e.target.value } : x))}
                            style={{ width: 60, padding: '3px 6px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 13, textAlign: 'right' }} /> грн</>}
                  </span>
                  <span>→</span>
                  <input value={b.fee} onChange={e => setTariffDraft(d => d.map((x, j) => j === i ? { ...x, fee: e.target.value } : x))}
                    style={{ width: 60, padding: '3px 6px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 13, textAlign: 'right' }} />
                  <span>грн</span>
                </div>
              );
            })}
          </div>
          {tariffError && <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{tariffError}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <button onClick={saveTariff} disabled={tariffSaving}
              style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#B45309', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: tariffSaving ? 0.6 : 1 }}>
              {tariffSaving ? 'Зберігаю…' : 'Зберегти'}
            </button>
            <span style={{ fontSize: 12, color: '#92400E' }}>
              Діє з моменту збереження: нові відгрузки та фід — за новим тарифом; вже проведені списання не перераховуються.
            </span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 42, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13, fontWeight: 500, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap', background: '#fff' }}>
          <input type="checkbox"
            checked={filteredRows.length > 0 && filteredRows.every(r => selected.has(r.p.sku))}
            ref={el => { if (el) el.indeterminate = filteredRows.some(r => selected.has(r.p.sku)) && !filteredRows.every(r => selected.has(r.p.sku)); }}
            onChange={e => {
              if (e.target.checked) setSelected(new Set(filteredRows.map(r => r.p.sku)));
              else setSelected(prev => { const s = new Set(prev); filteredRows.forEach(r => s.delete(r.p.sku)); return s; });
            }}
            style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#2563EB' }} />
          {filteredRows.every(r => selected.has(r.p.sku)) && filteredRows.length > 0 ? 'Зняти вибір' : 'Вибрати всі'}
        </label>
        <button
          onClick={() => setCollapsed(allCollapsed ? Object.fromEntries(allSlugs.map(s => [s, false])) : Object.fromEntries(allSlugs.map(s => [s, true])))}
          style={{ display: 'flex', alignItems: 'center', gap: 5, height: 42, padding: '0 14px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13, fontWeight: 500, background: '#fff', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {allCollapsed ? <><ChevronDown size={13} /> Розгорнути всі</> : <><ChevronRight size={13} /> Згорнути всі</>}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 42, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13, fontWeight: 500, color: '#475569', whiteSpace: 'nowrap', background: '#fff' }}>
          <span>Всі в Rozetka</span>
          <button
            onClick={() => {
              const next = !(totalEnabled === products.length);
              const msg  = next
                ? `Увімкнути всі ${products.length} товарів для відображення в Rozetka?`
                : `Вимкнути всі ${products.length} товарів з Rozetka?`;
              if (window.confirm(msg)) toggleAll(next);
            }}
            style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, background: totalEnabled === products.length ? '#22C55E' : totalEnabled > 0 ? '#86EFAC' : '#CBD5E1', transition: 'background 0.2s' }}>
            <span style={{ position: 'absolute', top: 2, left: totalEnabled === products.length ? 18 : totalEnabled > 0 ? 10 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </label>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input type="text" placeholder="Пошук за назвою, SKU, брендом..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 42, paddingLeft: 38, paddingRight: 14, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
          style={{ height: 42, padding: '0 14px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13, background: filterBrand ? '#EFF6FF' : '#fff', minWidth: 150 }}>
          <option value="">Всі бренди</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ height: 42, padding: '0 14px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13, background: filterStatus ? '#EFF6FF' : '#fff', minWidth: 180 }}>
          <option value="">Всі статуси Rozetka</option>
          <option value="on">Увімкнено в Rozetka</option>
          <option value="off">Виключено з Rozetka</option>
          <option value="smart">У програмі Smart</option>
          <option value="nosmart">Без Smart</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: '#64748B', whiteSpace: 'nowrap' }}>Наценка на всі:</span>
          <div style={{ position: 'relative' }}>
            <input value={globalMarkup} onChange={e => setGlobalMarkup(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyGlobalMarkup()}
              type="number" min="0" max="200" step="0.5" placeholder="0"
              style={{ width: 64, height: 42, padding: '0 20px 0 8px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13, boxSizing: 'border-box' }} />
            <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94A3B8', pointerEvents: 'none' }}>%</span>
          </div>
          <button onClick={applyGlobalMarkup} disabled={globalSaving || !globalMarkup}
            style={{ height: 42, padding: '0 14px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, cursor: globalMarkup && !globalSaving ? 'pointer' : 'default', background: globalMarkup && !globalSaving ? '#2563EB' : '#F1F5F9', color: globalMarkup && !globalSaving ? '#fff' : '#94A3B8', whiteSpace: 'nowrap' }}>
            {globalSaving ? 'Зберігаю...' : 'Застосувати'}
          </button>
        </div>
      </div>

      {/* Знайдено */}
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
        Знайдено: <strong>{filteredRows.length}</strong> товарів у <strong>{grouped.size}</strong> категоріях
        {selected.size > 0 && <span style={{ marginLeft: 8, color: '#2563EB', fontWeight: 600 }}>· вибрано {selected.size}</span>}
      </div>

      {/* Grouped categories */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...grouped.entries()].map(([catSlug, rows]) => {
          const cat        = catSlug !== '—' ? catMap.get(catSlug) : null;
          const commission = cat?.rozetka_commission_pct ?? 0;
          const catMkp     = cat?.rozetka_markup_pct ?? null;
          const isCollapsed = collapsed[catSlug];
          const allOn   = rows.every(r => enabled[r.p.sku] !== false);
          const someOn  = rows.some(r => enabled[r.p.sku] !== false);

          const setMarkupVals = rows.map(r => {
            const v = markups[r.p.sku];
            return v !== '' ? parseFloat(v) : null;
          }).filter((m): m is number => m !== null);
          const avgMarkup = setMarkupVals.length > 0
            ? Math.round(setMarkupVals.reduce((a, b) => a + b, 0) / setMarkupVals.length * 10) / 10
            : null;

          return (
            <div key={catSlug} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>

              {/* Category header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: '#F8FAFC', borderBottom: isCollapsed ? 'none' : '1px solid #E2E8F0' }}>
                <button onClick={() => setCollapsed(p => ({ ...p, [catSlug]: !isCollapsed }))} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  {isCollapsed ? <ChevronRight size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
                </button>
                <button
                  onClick={() => bulkToggle(catSlug, !allOn)}
                  title={allOn ? 'Вимкнути всі в Rozetka' : 'Увімкнути всі в Rozetka'}
                  style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, background: allOn ? '#22C55E' : someOn ? '#86EFAC' : '#CBD5E1', transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 2, left: allOn ? 18 : someOn ? 10 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
                <span onClick={() => setCollapsed(p => ({ ...p, [catSlug]: !isCollapsed }))} style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', flex: 1, cursor: 'pointer' }}>
                  {cat?.name ?? catSlug}
                </span>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>{rows.length} товарів</span>
                {commission > 0 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#FFF7ED', color: '#92400E' }}>комісія {commission}%</span>}
                {rows.some(r => smart[r.p.sku]) && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>Smart {rows.filter(r => smart[r.p.sku]).length}</span>}
                {avgMarkup !== null && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#EFF6FF', color: '#1D4ED8' }}>наценка ~{avgMarkup}%</span>}
                {!cat?.rozetka_category_id && catSlug !== '—' && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#FEF2F2', color: '#DC2626' }}>без rz_id</span>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap' }}>Наценка:</span>
                  <div style={{ position: 'relative' }}>
                    <input value={catMarkupInputs[catSlug] ?? ''} onChange={e => setCatMarkupInputs(p => ({ ...p, [catSlug]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && applyBulkMarkup(catSlug)}
                      type="number" min="0" max="200" step="1" placeholder={catMkp != null ? String(catMkp) : '0'}
                      style={{ padding: '3px 18px 3px 6px', borderRadius: 4, border: '1px solid #CBD5E1', fontSize: 11, width: 52, boxSizing: 'border-box' }} />
                    <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#94A3B8', pointerEvents: 'none' }}>%</span>
                  </div>
                  <button onClick={() => applyBulkMarkup(catSlug)} disabled={catSaving === catSlug || !catMarkupInputs[catSlug]}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap', background: catMarkupInputs[catSlug] && catSaving !== catSlug ? '#EFF6FF' : '#F1F5F9', color: catMarkupInputs[catSlug] && catSaving !== catSlug ? '#2563EB' : '#94A3B8', border: `1px solid ${catMarkupInputs[catSlug] && catSaving !== catSlug ? '#BFDBFE' : '#E2E8F0'}`, cursor: catMarkupInputs[catSlug] && catSaving !== catSlug ? 'pointer' : 'default' }}>
                    {catSaving === catSlug ? 'Зберігаю...' : 'Застосувати'}
                  </button>
                </div>
              </div>

              {/* Products table */}
              {!isCollapsed && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, width: 40, padding: '8px 8px 8px 16px' }}>
                        <input type="checkbox"
                          checked={rows.every(r => selected.has(r.p.sku))}
                          ref={el => { if (el) el.indeterminate = rows.some(r => selected.has(r.p.sku)) && !rows.every(r => selected.has(r.p.sku)); }}
                          onChange={() => {
                            const allSel = rows.every(r => selected.has(r.p.sku));
                            setSelected(prev => { const s = new Set(prev); rows.forEach(r => allSel ? s.delete(r.p.sku) : s.add(r.p.sku)); return s; });
                          }}
                          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#2563EB' }} />
                      </th>
                      <th style={{ ...TH, width: 90 }}>SKU</th>
                      <th style={TH}>Назва</th>
                      <th style={TH}>Бренд</th>
                      <th style={TH}>Категорія Rozetka</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Ціна входу</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Комісія</th>
                      <th style={{ ...TH, textAlign: 'right', width: 110 }}>Наценка</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Ціна Rozetka</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Маржа</th>
                      <th style={{ ...TH, textAlign: 'center' }} title="Програма Smart: безкоштовна доставка покупцю, компенсація 12/18/30 грн включена в ціну">Smart</th>
                      <th style={{ ...TH, textAlign: 'center' }}>Rozetka</th>
                      <th style={{ ...TH, width: 36 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const { p, cost, retailPrice, productMkp, catMkp: rCatMkp, commission: rComm, rzPrice: rPrice, baseRz, isSmart, marginPct } = r;
                      const isOn       = enabled[p.sku] !== false;
                      const isSmartToggling = smartToggling.has(p.sku);
                      const isToggling = toggling.has(p.sku);
                      const isSelected = selected.has(p.sku);
                      const isEditing  = editSku === p.sku;
                      const hasRzName  = rzNames[p.sku] !== '';

                      return (
                        <tr key={p.sku} style={{ borderBottom: '1px solid #F1F5F9', background: isSelected ? 'rgba(37,99,235,0.03)' : undefined, opacity: isOn ? 1 : 0.45 }}>
                          <td style={{ padding: '8px 8px 8px 16px' }}>
                            <input type="checkbox" checked={isSelected} onChange={() => setSelected(prev => { const s = new Set(prev); s.has(p.sku) ? s.delete(p.sku) : s.add(p.sku); return s; })}
                              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#2563EB' }} />
                          </td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#64748B', whiteSpace: 'nowrap' }}>{p.sku}</td>
                          <td style={{ padding: '8px 12px', maxWidth: 280 }}>
                            <div style={{ fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                            {p.volume && <div style={{ fontSize: 11, color: '#94A3B8' }}>{p.volume}</div>}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#475569', whiteSpace: 'nowrap' }}>{p.brand}</td>
                          <td style={{ padding: '8px 12px' }}>
                            {cat?.rozetka_category_id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#F0FDF4', color: '#15803D', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{cat.rozetka_category_id}</span>
                                {cat.rozetka_category_name && (
                                  <span style={{ fontSize: 12, color: '#475569' }}>{cat.rozetka_category_name}</span>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#111' }}>
                            {cost != null ? `${cost.toFixed(0)} ₴` : retailPrice > 0 ? <span style={{ color: '#94A3B8' }}>{retailPrice.toFixed(0)} ₴</span> : <span style={{ color: '#D1D5DB' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: rComm > 0 ? '#92400E' : '#D1D5DB', fontWeight: 500 }}>
                            {rComm > 0 ? `${rComm}%` : '—'}
                          </td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                              {productMkp != null && rCatMkp != null && productMkp !== rCatMkp && (
                                <span style={{ fontSize: 10, color: '#94A3B8' }}>кат:{rCatMkp}</span>
                              )}
                              <div style={{ position: 'relative' }}>
                                <input type="number" min="0" max="200" step="0.5"
                                  value={markups[p.sku]}
                                  onChange={e => setMarkups(prev => ({ ...prev, [p.sku]: e.target.value }))}
                                  onBlur={e => saveMarkup(p.sku, e.target.value)}
                                  placeholder={rCatMkp != null ? `${rCatMkp}` : '0'}
                                  style={{ width: 56, height: 26, padding: '0 18px 0 6px', borderRadius: 5, border: '1px solid #E2E8F0', fontSize: 12, background: markups[p.sku] ? '#EFF6FF' : '#fff', outline: savingMarkup === p.sku ? '2px solid #93C5FD' : undefined }} />
                                <span style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#94A3B8', pointerEvents: 'none' }}>%</span>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#111', whiteSpace: 'nowrap' }}>
                            {rPrice != null ? (
                              <span title={isSmart && baseRz != null ? `База ${baseRz} ₴ + Smart-надбавка ${rPrice - baseRz} ₴` : undefined}>
                                {rPrice} ₴
                                {isSmart && <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 800, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 4, padding: '1px 4px', verticalAlign: 'middle' }}>S</span>}
                              </span>
                            ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            {marginPct != null
                              ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: marginPct >= 20 ? '#ECFDF5' : marginPct >= 10 ? '#FFFBEB' : '#FEF2F2', color: marginColor(marginPct) }}>{marginPct.toFixed(1)}%</span>
                              : <span style={{ color: '#D1D5DB' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button onClick={() => toggleSmart(p.sku)} disabled={isSmartToggling}
                              title={isSmart ? 'Вимкнути Smart-надбавку в ціні фіда' : 'Увімкнути Smart (ціна у фіді виросте на компенсацію доставки). Не забудьте синхронно підключити/відключити товар у кабінеті Rozetka!'}
                              style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none', cursor: isSmartToggling ? 'wait' : 'pointer', padding: 0, background: isSmart ? '#F59E0B' : '#CBD5E1', transition: 'background 0.2s', opacity: isSmartToggling ? 0.6 : 1 }}>
                              <span style={{ position: 'absolute', top: 2, left: isSmart ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                            </button>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button onClick={() => toggleProduct(p.sku)} disabled={isToggling}
                              style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none', cursor: isToggling ? 'wait' : 'pointer', padding: 0, background: isOn ? '#22C55E' : '#CBD5E1', transition: 'background 0.2s', opacity: isToggling ? 0.6 : 1 }}>
                              <span style={{ position: 'absolute', top: 2, left: isOn ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                            </button>
                          </td>
                          {/* Rozetka name edit */}
                          <td style={{ padding: '8px 8px' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                                  placeholder="авто"
                                  style={{ width: 180, height: 26, padding: '0 5px', border: '1.5px solid #7C3AED', borderRadius: 5, fontSize: 11, outline: 'none' }} />
                                <button onClick={() => saveName(p.sku)} disabled={savingName}
                                  style={{ width: 24, height: 24, borderRadius: 5, border: '1.5px solid #16A34A', background: '#F0FDF4', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Check size={11} />
                                </button>
                                <button onClick={() => setEditSku(null)}
                                  style={{ width: 24, height: 24, borderRadius: 5, border: '1.5px solid #E2E8F0', background: '#F9FAFB', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <X size={11} />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditSku(p.sku); setEditName(rzNames[p.sku]); }}
                                title={hasRzName ? `Rozetka-назва: ${rzNames[p.sku]}` : 'Встановити Rozetka-назву'}
                                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E2E8F0', background: hasRzName ? '#F5F3FF' : 'transparent', color: hasRzName ? '#7C3AED' : '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Pencil size={11} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', fontSize: 12, color: '#64748B' }}>
        {([['#16A34A', '≥ 30%'], ['#65A30D', '20–30%'], ['#D97706', '10–20%'], ['#EA580C', '0–10%'], ['#DC2626', '< 0%']] as [string, string][]).map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} /> {label}
          </div>
        ))}
        <span style={{ color: '#94A3B8' }}>— маржа після комісії Rozetka · олівець = Rozetka-назва (фіолетовий = задана вручну)</span>
      </div>
    </div>
  );
}
