'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Check, X, Lock, Unlock, FileSpreadsheet, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import { showToast } from '../../../lib/toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  sku:             string;
  name:            string;
  brand:           string;
  volume:          string | null;
  category_slug:   string | null;
  is_active:       boolean;
  prom_markup_pct: number | null;
}

interface Stock {
  sku:             string;
  price_cost:      number | null;
  price_unit:      number | null;
  price_retail:    number | null;
  price_drop:      number | null;
  price_wholesale: number | null;
  price_locked:    boolean;
  stock_status:    string;
  stock_qty:       number;
  updated_at:      string;
}

interface Category {
  slug:                string;
  name:                string;
  parent_slug:         string | null;
  prom_commission_pct: number | null;
  prom_markup_pct:     number | null;
}

interface Props {
  products:   Product[];
  stock:      Stock[];
  categories: Category[];
}

type PriceField = 'price_unit' | 'price_retail' | 'price_drop';

interface EditState {
  price_cost:    string;
  price_unit:    string;
  price_retail:  string;
  price_drop:    string;
  lock:          boolean;
}

interface LocalOverride {
  price_cost:    number | null;
  price_unit:    number | null;
  price_retail:  number | null;
  price_drop:    number | null;
  price_locked:  boolean;
}

type RepricingType = 'multiply_cost' | 'increase_pct' | 'fixed';
type RepricingTarget = 'retail' | 'unit' | 'drop' | 'all';

// ── Helpers ───────────────────────────────────────────────────────────────────

function n(v: number | null | undefined) {
  return v != null ? Number(v) : null;
}

function fmt(v: number | null) {
  if (v == null) return '—';
  return v.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ₴';
}

function marginColor(pct: number) {
  if (pct >= 30) return '#16A34A';
  if (pct >= 20) return '#65A30D';
  if (pct >= 10) return '#D97706';
  if (pct >= 0)  return '#EA580C';
  return '#DC2626';
}

function calcPromPrice(retail: number, markup: number, commission: number) {
  return Math.ceil(retail * (1 + markup / 100) / (1 - commission / 100));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PricesClient({ products, stock, categories }: Props) {
  const stockMap = useMemo(() => new Map(stock.map(s => [s.sku, s])), [stock]);
  const catMap   = useMemo(() => new Map(categories.map(c => [c.slug, c])), [categories]);

  const [search, setSearch]             = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [collapsed, setCollapsed]       = useState<Set<string>>(new Set());
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [editSku, setEditSku]           = useState<string | null>(null);
  const [editState, setEditState]       = useState<EditState | null>(null);
  const [saving, setSaving]             = useState(false);
  const [overrides, setOverrides]       = useState<Map<string, LocalOverride>>(new Map());

  // Repricing panel
  const [repricingType, setRepricingType]     = useState<RepricingType>('multiply_cost');
  const [repricingValue, setRepricingValue]   = useState('');
  const [repricingTarget, setRepricingTarget] = useState<RepricingTarget>('retail');
  const [showPreview, setShowPreview]         = useState(false);

  // Pricelist modal
  const [showPricelist, setShowPricelist]           = useState(false);
  const [plPriceType, setPlPriceType]               = useState<PriceField>('price_retail');
  const [plCategories, setPlCategories]             = useState<Set<string>>(new Set());
  const [plAllCats, setPlAllCats]                   = useState(true);
  const [plIncludeOutOfStock, setPlIncludeOutOfStock] = useState(false);
  const [plShowBrand, setPlShowBrand]               = useState(true);
  const [plGenerating, setPlGenerating]             = useState(false);
  const [mounted, setMounted]                       = useState(false);
  useEffect(() => setMounted(true), []);

  // ── Merged data ─────────────────────────────────────────────────────────────

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return products
      .filter(p => showInactive ? true : p.is_active)
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q))
      .map(p => {
        const s   = stockMap.get(p.sku);
        const ov  = overrides.get(p.sku);
        const cat = p.category_slug ? catMap.get(p.category_slug) : null;

        const cost    = n(ov?.price_cost    ?? s?.price_cost);
        const unit    = n(ov?.price_unit    ?? s?.price_unit);
        const retail  = n(ov?.price_retail  ?? s?.price_retail);
        const drop    = n(ov?.price_drop    ?? s?.price_drop);
        const locked  = ov?.price_locked    ?? s?.price_locked ?? false;

        const promMarkup     = p.prom_markup_pct ?? cat?.prom_markup_pct ?? 0;
        const promCommission = cat?.prom_commission_pct ?? 0;
        const baseForProm    = retail ?? unit ?? 0;
        const promPrice      = baseForProm > 0 ? calcPromPrice(baseForProm, promMarkup, promCommission) : null;
        const netProm        = promPrice != null ? promPrice * (1 - promCommission / 100) : null;
        const marginUah      = netProm != null && cost != null ? netProm - cost : null;
        const marginPct      = marginUah != null && netProm != null && netProm > 0 ? (marginUah / netProm) * 100 : null;

        return { p, cost, unit, retail, drop, locked, cat, promPrice, marginUah, marginPct, s };
      });
  }, [products, stock, categories, search, showInactive, overrides, stockMap, catMap]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.p.category_slug ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  // ── Selection helpers ────────────────────────────────────────────────────────

  function toggleRow(sku: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });
  }

  function toggleCategory(catSlug: string, catRows: typeof rows) {
    const allSelected = catRows.every(r => selected.has(r.p.sku));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) catRows.forEach(r => next.delete(r.p.sku));
      else             catRows.forEach(r => next.add(r.p.sku));
      return next;
    });
  }

  function selectAll() { setSelected(new Set(rows.map(r => r.p.sku))); }
  function clearAll()  { setSelected(new Set()); }

  // ── Inline edit ──────────────────────────────────────────────────────────────

  function startEdit(r: typeof rows[0]) {
    setEditSku(r.p.sku);
    setEditState({
      price_cost:   r.cost   != null ? String(r.cost)   : '',
      price_unit:   r.unit   != null ? String(r.unit)   : '',
      price_retail: r.retail != null ? String(r.retail) : '',
      price_drop:   r.drop   != null ? String(r.drop)   : '',
      lock:         r.locked,
    });
  }

  async function saveEdit(sku: string) {
    if (!editState) return;
    setSaving(true);
    try {
      const body = {
        skus: [sku],
        price_cost:   editState.price_cost   !== '' ? parseFloat(editState.price_cost)   : null,
        price_unit:   editState.price_unit   !== '' ? parseFloat(editState.price_unit)   : null,
        price_retail: editState.price_retail !== '' ? parseFloat(editState.price_retail) : null,
        price_drop:   editState.price_drop   !== '' ? parseFloat(editState.price_drop)   : null,
        price_locked: editState.lock,
      };
      const res = await fetch('/api/admin/prices/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      setOverrides(prev => {
        const next = new Map(prev);
        next.set(sku, {
          price_cost:   body.price_cost,
          price_unit:   body.price_unit,
          price_retail: body.price_retail,
          price_drop:   body.price_drop,
          price_locked: body.price_locked,
        });
        return next;
      });
      setEditSku(null);
      showToast('Ціни збережено', 'success');
    } catch {
      showToast('Помилка збереження', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Repricing ────────────────────────────────────────────────────────────────

  const selectedRows = useMemo(() => rows.filter(r => selected.has(r.p.sku)), [rows, selected]);

  function applyFormula(cost: number | null, unit: number | null, retail: number | null, drop: number | null): { unit: number | null; retail: number | null; drop: number | null } {
    const val = parseFloat(repricingValue);
    if (isNaN(val)) return { unit, retail, drop };

    function calc(base: number | null): number | null {
      if (repricingType === 'multiply_cost') return cost != null ? Math.round(cost * val) : base;
      if (repricingType === 'increase_pct')  return base != null ? Math.round(base * (1 + val / 100)) : base;
      if (repricingType === 'fixed')         return Math.round(val);
      return base;
    }

    return {
      unit:   repricingTarget === 'unit'   || repricingTarget === 'all' ? calc(unit)   : unit,
      retail: repricingTarget === 'retail' || repricingTarget === 'all' ? calc(retail) : retail,
      drop:   repricingTarget === 'drop'   || repricingTarget === 'all' ? calc(drop)   : drop,
    };
  }

  const repricingPreview = useMemo(() => {
    if (!showPreview) return [];
    return selectedRows.map(r => {
      const result = applyFormula(r.cost, r.unit, r.retail, r.drop);
      return { sku: r.p.sku, name: r.p.name, brand: r.p.brand, volume: r.p.volume, before: { unit: r.unit, retail: r.retail, drop: r.drop }, after: result };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, selectedRows, repricingType, repricingValue, repricingTarget]);

  async function applyRepricing() {
    setSaving(true);
    try {
      const updates = selectedRows.map(r => {
        const result = applyFormula(r.cost, r.unit, r.retail, r.drop);
        return { sku: r.p.sku, ...result };
      });
      const res = await fetch('/api/admin/prices/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: updates }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOverrides(prev => {
        const next = new Map(prev);
        for (const u of updates) {
          const existing = next.get(u.sku) ?? { price_cost: null, price_unit: null, price_retail: null, price_drop: null, price_locked: false };
          next.set(u.sku, { ...existing, price_unit: u.unit ?? existing.price_unit, price_retail: u.retail ?? existing.price_retail, price_drop: u.drop ?? existing.price_drop });
        }
        return next;
      });
      setSelected(new Set());
      setShowPreview(false);
      showToast(`Переоцінено ${updates.length} товарів`, 'success');
    } catch {
      showToast('Помилка переоцінки', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Pricelist export ─────────────────────────────────────────────────────────

  async function downloadPricelist() {
    setPlGenerating(true);
    try {
      const params = new URLSearchParams({
        priceType:        plPriceType,
        categories:       plAllCats ? 'all' : [...plCategories].join(','),
        includeOutOfStock: String(plIncludeOutOfStock),
        showBrand:        String(plShowBrand),
      });
      const res = await fetch(`/api/admin/prices/pricelist?${params}`);
      if (!res.ok) throw new Error('Помилка генерації');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `pricelist_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Помилка генерації прайс-листа', 'error');
    } finally {
      setPlGenerating(false);
    }
  }

  function printPricelist() {
    const priceLabel = { price_retail: 'Роздрібна ціна', price_unit: 'Оптова ціна', price_drop: 'Ціна дроп' }[plPriceType];
    const printRows = rows.filter(r => {
      if (!plIncludeOutOfStock && r.s?.stock_status !== 'in_stock') return false;
      if (!plAllCats && r.p.category_slug && !plCategories.has(r.p.category_slug)) return false;
      return true;
    });

    const grouped2 = new Map<string, typeof printRows>();
    for (const r of printRows) {
      const key = r.p.category_slug ?? '__none__';
      if (!grouped2.has(key)) grouped2.set(key, []);
      grouped2.get(key)!.push(r);
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Прайс-лист FIXLINE</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 20px; }
  h2 { font-size: 13px; font-weight: 700; background: #f0f4f8; padding: 6px 10px; margin: 16px 0 4px; border-left: 3px solid #1D4ED8; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #f9fafb; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; padding: 5px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  .price { font-weight: 700; text-align: right; }
  @media print { @page { margin: 15mm; } }
</style></head><body>
<h1>FIXLINE — Прайс-лист</h1>
<div class="meta">Дата: ${new Date().toLocaleDateString('uk-UA')} &nbsp;·&nbsp; ${priceLabel}</div>
${[...grouped2.entries()].map(([slug, catRows]) => {
  const catName = catRows[0]?.cat?.name ?? slug;
  return `<h2>${catName}</h2>
<table>
  <thead><tr>
    <th>Назва</th>
    ${plShowBrand ? '<th>Бренд</th>' : ''}
    <th>Об\'єм / Вага</th>
    <th style="text-align:right">${priceLabel}</th>
  </tr></thead>
  <tbody>
    ${catRows.map(r => {
      const price = r[plPriceType === 'price_retail' ? 'retail' : plPriceType === 'price_unit' ? 'unit' : 'drop'];
      return `<tr>
        <td>${r.p.name}</td>
        ${plShowBrand ? `<td>${r.p.brand ?? ''}</td>` : ''}
        <td>${r.p.volume ?? ''}</td>
        <td class="price">${price != null ? price.toLocaleString('uk-UA') + ' ₴' : '—'}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>`;
}).join('')}
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const totalSelected = selected.size;

  return (
    <div style={{ padding: '28px 32px 80px', maxWidth: 1300 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111' }}>Ціни</h1>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: 13 }}>
            {rows.length} товарів · {totalSelected > 0 ? `${totalSelected} вибрано` : 'оберіть для переоцінки'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {totalSelected > 0 && (
            <button onClick={clearAll} style={btnSecondary}>Зняти вибір</button>
          )}
          <button onClick={() => setShowPricelist(true)} style={{ ...btnPrimary, background: '#fff', border: '1.5px solid #E5E7EB', color: '#374151' }}>
            <FileSpreadsheet size={15} /> Прайс-лист
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <input
          type="text" placeholder="Пошук по назві, SKU, бренду..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Показати неактивні
        </label>
        <button onClick={selectAll} style={btnSecondary}>Вибрати всі</button>
      </div>

      {/* Repricing panel */}
      {totalSelected > 0 && (
        <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1D4ED8', marginBottom: 12 }}>
            Переоцінка — {totalSelected} товарів
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Formula type */}
            <div>
              <label style={smallLabel}>Формула</label>
              <select value={repricingType} onChange={e => setRepricingType(e.target.value as RepricingType)} style={selectStyle}>
                <option value="multiply_cost">Собівартість × N</option>
                <option value="increase_pct">Збільшити поточну на %</option>
                <option value="fixed">Фіксована ціна</option>
              </select>
            </div>
            {/* Value */}
            <div>
              <label style={smallLabel}>
                {repricingType === 'multiply_cost' ? 'Множник' : repricingType === 'increase_pct' ? 'Відсоток (%)' : 'Ціна (₴)'}
              </label>
              <input
                type="number" step="0.01" min="0"
                value={repricingValue} onChange={e => setRepricingValue(e.target.value)}
                placeholder={repricingType === 'multiply_cost' ? '1.8' : repricingType === 'increase_pct' ? '10' : '150'}
                style={{ ...inputSmall, width: 90 }}
              />
            </div>
            {/* Target */}
            <div>
              <label style={smallLabel}>Оновити</label>
              <select value={repricingTarget} onChange={e => setRepricingTarget(e.target.value as RepricingTarget)} style={selectStyle}>
                <option value="retail">Роздрібну</option>
                <option value="unit">Оптову</option>
                <option value="drop">Дроп</option>
                <option value="all">Всі три</option>
              </select>
            </div>
            <button onClick={() => setShowPreview(!showPreview)} style={btnSecondary}>
              {showPreview ? 'Сховати прев\'ю' : 'Прев\'ю змін'}
            </button>
            <button onClick={applyRepricing} disabled={saving || !repricingValue} style={btnPrimary}>
              {saving ? 'Зберігаємо...' : 'Застосувати'}
            </button>
          </div>

          {/* Preview table */}
          {showPreview && repricingPreview.length > 0 && (
            <div style={{ marginTop: 16, maxHeight: 300, overflowY: 'auto', borderRadius: 8, border: '1px solid #BFDBFE', background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F0F7FF', borderBottom: '1px solid #BFDBFE' }}>
                    <th style={thSmall}>Товар</th>
                    <th style={thSmall}>Оптова: до → після</th>
                    <th style={thSmall}>Роздрібна: до → після</th>
                    <th style={thSmall}>Дроп: до → після</th>
                  </tr>
                </thead>
                <tbody>
                  {repricingPreview.map(row => (
                    <tr key={row.sku} style={{ borderBottom: '1px solid #F0F7FF' }}>
                      <td style={{ padding: '5px 10px' }}>{row.brand} {row.name}{row.volume ? ` ${row.volume}` : ''}</td>
                      <td style={{ padding: '5px 10px' }}><PreviewChange before={row.before.unit} after={row.after.unit} /></td>
                      <td style={{ padding: '5px 10px' }}><PreviewChange before={row.before.retail} after={row.after.retail} /></td>
                      <td style={{ padding: '5px 10px' }}><PreviewChange before={row.before.drop} after={row.after.drop} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Price table */}
      {[...grouped.entries()].map(([catSlug, catRows]) => {
        const catName     = catRows[0]?.cat?.name ?? catSlug;
        const isCollapsed = collapsed.has(catSlug);
        const allSelected = catRows.length > 0 && catRows.every(r => selected.has(r.p.sku));
        const someSelected = catRows.some(r => selected.has(r.p.sku));

        return (
          <div key={catSlug} style={{ marginBottom: 24 }}>
            {/* Category header */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: isCollapsed ? 10 : '10px 10px 0 0', cursor: 'pointer' }}
              onClick={() => setCollapsed(prev => { const s = new Set(prev); s.has(catSlug) ? s.delete(catSlug) : s.add(catSlug); return s; })}
            >
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={() => toggleCategory(catSlug, catRows)}
                onClick={e => e.stopPropagation()}
              />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1E293B', flex: 1 }}>{catName}</span>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>{catRows.length} товарів</span>
              {isCollapsed ? <ChevronDown size={15} color="#94A3B8" /> : <ChevronUp size={15} color="#94A3B8" />}
            </div>

            {!isCollapsed && (
              <div style={{ border: '1px solid #E2E8F0', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: '#fff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      <th style={{ width: 36, padding: '8px 12px' }} />
                      <th style={th}>Товар</th>
                      <th style={{ ...th, width: 90 }}>Собівартість</th>
                      <th style={{ ...th, width: 90 }}>Оптова</th>
                      <th style={{ ...th, width: 90 }}>Роздрібна</th>
                      <th style={{ ...th, width: 85 }}>Дроп</th>
                      <th style={{ ...th, width: 90 }}>Ціна Prom</th>
                      <th style={{ ...th, width: 75 }}>Маржа %</th>
                      <th style={{ width: 60, padding: '8px 12px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {catRows.map(r => {
                      const isEditing = editSku === r.p.sku;
                      return (
                        <tr key={r.p.sku} style={{ borderBottom: '1px solid #F3F4F6', background: selected.has(r.p.sku) ? '#F0F7FF' : undefined }}>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <input type="checkbox" checked={selected.has(r.p.sku)} onChange={() => toggleRow(r.p.sku)} />
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>
                              {r.p.brand} {r.p.name}{r.p.volume ? ` ${r.p.volume}` : ''}
                            </div>
                            <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{r.p.sku}</div>
                          </td>

                          {isEditing ? (
                            <>
                              <td style={{ padding: '6px 8px' }}>
                                <input type="number" step="0.01" value={editState!.price_cost} onChange={e => setEditState(s => s && ({ ...s, price_cost: e.target.value }))} style={{ ...inputSmall, width: 74 }} />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input type="number" step="0.01" value={editState!.price_unit} onChange={e => setEditState(s => s && ({ ...s, price_unit: e.target.value }))} style={{ ...inputSmall, width: 74 }} />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input type="number" step="0.01" value={editState!.price_retail} onChange={e => setEditState(s => s && ({ ...s, price_retail: e.target.value }))} style={{ ...inputSmall, width: 74 }} />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input type="number" step="0.01" value={editState!.price_drop} onChange={e => setEditState(s => s && ({ ...s, price_drop: e.target.value }))} style={{ ...inputSmall, width: 70 }} />
                              </td>
                              <td style={{ padding: '6px 8px', fontSize: 12, color: '#9CA3AF' }}>авто</td>
                              <td style={{ padding: '6px 8px', fontSize: 12, color: '#9CA3AF' }}>—</td>
                              <td style={{ padding: '6px 8px' }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <button
                                    title={editState!.lock ? 'Зафіксовано (синк не перезапише)' : 'Не зафіксовано'}
                                    onClick={() => setEditState(s => s && ({ ...s, lock: !s.lock }))}
                                    style={{ width: 26, height: 26, borderRadius: 6, border: `1.5px solid ${editState!.lock ? '#F59E0B' : '#E5E7EB'}`, background: editState!.lock ? '#FFFBEB' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    {editState!.lock ? <Lock size={11} color="#F59E0B" /> : <Unlock size={11} color="#9CA3AF" />}
                                  </button>
                                  <button onClick={() => saveEdit(r.p.sku)} disabled={saving} style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid #16A34A', background: '#F0FDF4', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Check size={12} />
                                  </button>
                                  <button onClick={() => setEditSku(null)} style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <X size={12} />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '8px 14px', fontSize: 13, color: '#6B7280' }}>{fmt(r.cost)}</td>
                              <td style={{ padding: '8px 14px', fontSize: 13 }}>{fmt(r.unit)}</td>
                              <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500 }}>{fmt(r.retail)}</td>
                              <td style={{ padding: '8px 14px', fontSize: 13, color: '#6B7280' }}>{fmt(r.drop)}</td>
                              <td style={{ padding: '8px 14px', fontSize: 13, color: '#6B7280' }}>{r.promPrice != null ? `${r.promPrice} ₴` : '—'}</td>
                              <td style={{ padding: '8px 14px' }}>
                                {r.marginPct != null
                                  ? <span style={{ fontSize: 13, fontWeight: 700, color: marginColor(r.marginPct) }}>{r.marginPct.toFixed(1)}%</span>
                                  : <span style={{ color: '#D1D5DB' }}>—</span>}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {r.locked && (
                                    <span title="Ціна зафіксована закупівлею (синк не перезапише)">
                                      <Lock size={11} color="#F59E0B" />
                                    </span>
                                  )}
                                  <button onClick={() => startEdit(r)} style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid #E5E7EB', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Pencil size={11} />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Pricelist modal — rendered via portal to escape PageTransition transform context */}
      {mounted && showPricelist && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 480, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Прайс-лист для клієнта</h2>
              <button onClick={() => setShowPricelist(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Price type */}
              <div>
                <label style={modalLabel}>Тип цін</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['price_retail', 'Роздрібна'], ['price_unit', 'Оптова'], ['price_drop', 'Дроп']] as [PriceField, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setPlPriceType(val)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${plPriceType === val ? '#1D4ED8' : '#E5E7EB'}`, background: plPriceType === val ? '#EFF6FF' : '#fff', color: plPriceType === val ? '#1D4ED8' : '#374151', fontWeight: plPriceType === val ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <label style={modalLabel}>Категорії</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={plAllCats} onChange={e => setPlAllCats(e.target.checked)} />
                  Всі категорії
                </label>
                {!plAllCats && (
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px' }}>
                    {categories.filter(c => !c.parent_slug).map(cat => (
                      <label key={cat.slug} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={plCategories.has(cat.slug)}
                          onChange={e => setPlCategories(prev => { const s = new Set(prev); e.target.checked ? s.add(cat.slug) : s.delete(cat.slug); return s; })}
                        />
                        {cat.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={plIncludeOutOfStock} onChange={e => setPlIncludeOutOfStock(e.target.checked)} />
                  Включати відсутні товари
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={plShowBrand} onChange={e => setPlShowBrand(e.target.checked)} />
                  Показувати бренд
                </label>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={downloadPricelist} disabled={plGenerating} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
                  <FileSpreadsheet size={15} /> {plGenerating ? 'Генерація...' : 'Завантажити XLSX'}
                </button>
                <button onClick={printPricelist} style={{ ...btnSecondary, flex: 1, justifyContent: 'center' }}>
                  <Printer size={15} /> Друкувати
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PreviewChange({ before, after }: { before: number | null; after: number | null }) {
  if (before === after) return <span style={{ color: '#9CA3AF' }}>{fmt(before)}</span>;
  return (
    <span>
      <span style={{ color: '#9CA3AF', textDecoration: 'line-through' }}>{fmt(before)}</span>
      {' → '}
      <span style={{ color: after != null && before != null && after > before ? '#16A34A' : '#EA580C', fontWeight: 600 }}>{fmt(after)}</span>
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '8px 14px', textAlign: 'left', fontSize: 11,
  fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em',
};
const thSmall: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'left', fontSize: 10,
  fontWeight: 700, color: '#6B7280', textTransform: 'uppercase',
};
const smallLabel: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 };
const modalLabel: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 };
const inputSmall: React.CSSProperties = { height: 28, padding: '0 6px', border: '1.5px solid #E5E7EB', borderRadius: 6, fontSize: 12, outline: 'none' };
const selectStyle: React.CSSProperties = { height: 32, padding: '0 8px', border: '1.5px solid #E5E7EB', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff' };
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#1D4ED8', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
