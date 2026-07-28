'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Check, X, Lock, Unlock, FileSpreadsheet, Printer, ChevronDown, ChevronUp, RotateCcw, Tag } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import PricesLog from './PricesLog';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  sku:             string;
  name:            string;
  brand:           string;
  volume:          string | null;
  category_slug:   string | null;
  is_active:       boolean;
  prom_markup_pct: number | null;
  image:           string | null;
}

interface Stock {
  sku:             string;
  price_cost:      number | null;
  price_unit:      number | null;
  price_retail:    number | null;
  price_drop:      number | null;
  price_promo:     number | null;
  price_wholesale: number | null;
  price_locked:    boolean;
  stock_status:    string;
  stock_qty:       number;
  updated_at:      string;
}

interface Category {
  slug:                   string;
  name:                   string;
  parent_slug:            string | null;
  prom_commission_pct:    number | null;
  prom_markup_pct:        number | null;
  rozetka_commission_pct: number | null;
  rozetka_markup_pct:     number | null;
  description:            string | null;
}

interface Props {
  products:   Product[];
  stock:      Stock[];
  categories: Category[];
  promoMap:   Record<string, string | null>; // sku → revert_at (null = indefinite)
}

type PriceField = 'price_unit' | 'price_retail' | 'price_drop' | 'price_cost';

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

function calcPromPrice(retail: number, markup: number, commission: number) {
  return Math.ceil(retail * (1 + markup / 100) / (1 - commission / 100));
}

function calcRzPrice(cost: number | null, retail: number | null, markup: number, commission: number): number | null {
  const base = (cost ?? 0) > 0 ? cost! : (retail ?? 0) > 0 ? retail! : 0;
  if (base === 0) return null;
  const withMarkup = base * (1 + markup / 100);
  const withComm = commission > 0 ? withMarkup / (1 - commission / 100) : withMarkup;
  return Math.ceil(withComm / 5) * 5;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PricesClient({ products, stock, categories, promoMap }: Props) {
  const stockMap = useMemo(() => new Map(stock.map(s => [s.sku, s])), [stock]);
  const catMap   = useMemo(() => new Map(categories.map(c => [c.slug, c])), [categories]);

  const [search, setSearch]             = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [filterStock, setFilterStock]   = useState<'all' | 'in_stock' | 'out'>('all');
  const [filterBrand, setFilterBrand]   = useState('');
  const [filterNoPrice, setFilterNoPrice]   = useState(false);
  const [filterLocked, setFilterLocked]     = useState(false);
  const [filterPromo, setFilterPromo]       = useState(false);
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
  const [repricingComment, setRepricingComment] = useState('');
  const [repricingRevertAt, setRepricingRevertAt] = useState('');
  const [repricingIsPromo, setRepricingIsPromo] = useState(false);
  const [showPreview, setShowPreview]         = useState(false);
  const [previewKey, setPreviewKey]           = useState(0);
  const [repricingEffectiveFrom, setRepricingEffectiveFrom] = useState('');
  const [previewRevenue, setPreviewRevenue]   = useState<{ count: number; delta: number } | null>(null);
  const [previewLoading, setPreviewLoading]   = useState(false);

  // Pricelist modal
  const [showPricelist, setShowPricelist]           = useState(false);
  const [plHeaderVariant, setPlHeaderVariant]       = useState<'fixline' | 'fop'>('fixline');
  const [plPriceType, setPlPriceType]               = useState<PriceField | 'price_prom'>('price_retail');
  const [plCategories, setPlCategories]             = useState<Set<string>>(new Set());
  const [plAllCats, setPlAllCats]                   = useState(true);
  const [plIncludeOutOfStock, setPlIncludeOutOfStock] = useState(false);
  const [plShowBrand, setPlShowBrand]               = useState(true);
  const [plShowImages, setPlShowImages]             = useState(false);
  const [plShowDescriptions, setPlShowDescriptions] = useState(false);
  const [descExpanded, setDescExpanded]             = useState(false);
  // slug → current description text (for editing in modal)
  const [catDescriptions, setCatDescriptions]       = useState<Map<string, string>>(new Map());
  // slug → saving state
  const [savingDesc, setSavingDesc]                 = useState<Set<string>>(new Set());
  const [plGenerating, setPlGenerating]             = useState(false);
  const [plAllBrands, setPlAllBrands]               = useState(true);
  const [plFilterBrands, setPlFilterBrands]         = useState<Set<string>>(new Set());
  const [plFilterSearch, setPlFilterSearch]         = useState('');
  const [mounted, setMounted]                       = useState(false);
  useEffect(() => setMounted(true), []);

  const [activeTab, setActiveTab] = useState<'prices' | 'log'>('prices');

  // ── Merged data ─────────────────────────────────────────────────────────────

  const allBrands = useMemo(() => [...new Set(products.map(p => p.brand).filter(Boolean))].sort(), [products]);

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

        const rzMarkup     = cat?.rozetka_markup_pct ?? 0;
        const rzCommission = cat?.rozetka_commission_pct ?? 0;
        const rzPrice      = calcRzPrice(cost, retail, rzMarkup, rzCommission);

        return { p, cost, unit, retail, drop, locked, cat, promPrice, rzPrice, s };
      })
      .filter(r => filterStock === 'all' ? true : filterStock === 'in_stock' ? r.s?.stock_status === 'in_stock' : r.s?.stock_status !== 'in_stock')
      .filter(r => !filterBrand || r.p.brand === filterBrand)
      .filter(r => !filterNoPrice || r.cost == null || r.retail == null)
      .filter(r => !filterLocked || r.locked)
      .filter(r => !filterPromo || r.s?.price_promo != null);
  }, [products, stock, categories, search, showInactive, filterStock, filterBrand, filterNoPrice, filterLocked, filterPromo, overrides, stockMap, catMap]);

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

  // parent slug → child categories
  const catChildren = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      if (c.parent_slug) {
        if (!map.has(c.parent_slug)) map.set(c.parent_slug, []);
        map.get(c.parent_slug)!.push(c);
      }
    }
    return map;
  }, [categories]);

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

  const allCatSlugs = useMemo(() => [...grouped.keys()], [grouped]);
  const allCollapsed = allCatSlugs.length > 0 && allCatSlugs.every(s => collapsed.has(s));
  function collapseAll() { setCollapsed(new Set(allCatSlugs)); }
  function expandAll()   { setCollapsed(new Set()); }

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

  const applyFormula = useCallback((cost: number | null, unit: number | null, retail: number | null, drop: number | null): { unit: number | null; retail: number | null; drop: number | null } => {
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
  }, [repricingType, repricingValue, repricingTarget]);

  const repricingPreview = useMemo(() => {
    if (!showPreview) return [];
    return selectedRows.map(r => {
      const result = applyFormula(r.cost, r.unit, r.retail, r.drop);
      return { sku: r.p.sku, name: r.p.name, brand: r.p.brand, volume: r.p.volume, before: { unit: r.unit, retail: r.retail, drop: r.drop }, after: result, hasPromo: r.s?.price_promo != null, promoRevertAt: promoMap[r.p.sku] ?? null };
    });
  }, [showPreview, previewKey, selectedRows, applyFormula]);

  function cancelRepricing() {
    setSelected(new Set());
    setShowPreview(false);
    setRepricingComment('');
    setRepricingRevertAt('');
    setRepricingIsPromo(false);
    setRepricingValue('');
    setRepricingEffectiveFrom('');
    setPreviewRevenue(null);
  }

  // Debounced revenue preview
  useEffect(() => {
    if (!repricingValue || isNaN(parseFloat(repricingValue)) || selected.size === 0) {
      setPreviewRevenue(null);
      return;
    }
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const skus = [...selected].join(',');
        const params = new URLSearchParams({ type: repricingType, value: repricingValue, target: repricingTarget, skus });
        const res = await fetch(`/api/admin/prices/preview?${params}`);
        if (res.ok) setPreviewRevenue(await res.json());
      } catch { /* ignore */ } finally {
        setPreviewLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [repricingType, repricingValue, repricingTarget, selected]);

  async function applyRepricing() {
    setSaving(true);
    try {
      const updates = selectedRows.map(r => {
        const result = applyFormula(r.cost, r.unit, r.retail, r.drop);
        return { sku: r.p.sku, ...result };
      });

      const today = new Date().toISOString().split('T')[0];
      const isFuture = repricingEffectiveFrom && repricingEffectiveFrom > today;

      if (!isFuture) {
        // Apply prices immediately
        const res = await fetch('/api/admin/prices/bulk', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: updates, is_promo: repricingIsPromo }),
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
      }

      const snapshot = selectedRows.map(r => {
        const after = applyFormula(r.cost, r.unit, r.retail, r.drop);
        return { sku: r.p.sku, name: r.p.name, before: { unit: r.unit, retail: r.retail, drop: r.drop }, after };
      });
      fetch('/api/admin/prices/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: repricingType, value: repricingValue, target: repricingTarget,
          is_promo: repricingIsPromo,
          comment: repricingComment || null,
          revert_at: repricingRevertAt || null,
          effective_from: repricingEffectiveFrom ? new Date(repricingEffectiveFrom).toISOString() : null,
          status: isFuture ? 'pending' : 'applied',
          count: updates.length,
          snapshot,
        }),
      }).catch(() => {});

      cancelRepricing();
      showToast(isFuture
        ? `Заплановано переоцінку ${updates.length} товарів з ${new Date(repricingEffectiveFrom).toLocaleDateString('uk-UA')}`
        : `Переоцінено ${updates.length} товарів`, 'success');
    } catch {
      showToast('Помилка переоцінки', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Category descriptions ────────────────────────────────────────────────────

  function openPricelist() {
    // seed catDescriptions from current categories data
    setCatDescriptions(new Map(categories.map(c => [c.slug, c.description ?? ''])));
    setShowPricelist(true);
  }

  async function saveDescription(slug: string) {
    setSavingDesc(prev => new Set(prev).add(slug));
    try {
      const res = await fetch(`/api/admin/categories/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: catDescriptions.get(slug) || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Опис збережено', 'success');
    } catch {
      showToast('Помилка збереження', 'error');
    } finally {
      setSavingDesc(prev => { const s = new Set(prev); s.delete(slug); return s; });
    }
  }

  // ── Pricelist export ─────────────────────────────────────────────────────────

  async function downloadPricelist() {
    setPlGenerating(true);
    try {
      const params = new URLSearchParams({
        priceType:         plPriceType,
        categories:        plAllCats ? 'all' : [...plCategories].join(','),
        includeOutOfStock: String(plIncludeOutOfStock),
        showBrand:         String(plShowBrand),
        headerVariant:     plHeaderVariant,
        ...(!plAllBrands   ? { brand: [...plFilterBrands].join(',') } : {}),
        ...(plFilterSearch ? { search: plFilterSearch } : {}),
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

  async function generatePricelist() {
    const origin = window.location.origin;

    let contacts: { name: string; company: string | null; email: string }[] = [];
    try {
      const cr = await fetch('/api/admin/customers/search?limit=80');
      if (cr.ok) {
        const all = await cr.json();
        contacts = (all as { name: string; company: string | null; email: string | null }[])
          .filter(c => c.email)
          .map(c => ({ name: c.name, company: c.company ?? null, email: c.email! }));
      }
    } catch { /* optional */ }

    const allRows = products
      .filter(p => p.is_active)
      .map(p => {
        const s  = stockMap.get(p.sku);
        const ov = overrides.get(p.sku);
        const cat = p.category_slug ? catMap.get(p.category_slug) : null;
        const retail = n(ov?.price_retail ?? s?.price_retail);
        const unit   = n(ov?.price_unit   ?? s?.price_unit);
        const drop   = n(ov?.price_drop   ?? s?.price_drop);
        const cost   = n(ov?.price_cost   ?? s?.price_cost);
        const promMarkup     = p.prom_markup_pct ?? cat?.prom_markup_pct ?? 0;
        const promCommission = cat?.prom_commission_pct ?? 0;
        const baseForProm    = retail ?? unit ?? 0;
        const prom_price     = baseForProm > 0 ? calcPromPrice(baseForProm, promMarkup, promCommission) : null;
        return {
          p, cat, s,
          retail,
          unit,
          drop,
          cost,
          promo:  n(s?.price_promo),
          prom_price,
        };
      });

    const printRows = allRows.filter(r => {
      if (!plIncludeOutOfStock && r.s?.stock_status !== 'in_stock') return false;
      if (!plAllCats && r.p.category_slug) {
        const directMatch = plCategories.has(r.p.category_slug);
        const parentMatch = r.cat?.parent_slug ? plCategories.has(r.cat.parent_slug) : false;
        if (!directMatch && !parentMatch) return false;
      }
      if (!plAllBrands && !plFilterBrands.has(r.p.brand ?? '')) return false;
      if (plFilterSearch) {
        const q = plFilterSearch.toLowerCase();
        if (!r.p.name.toLowerCase().includes(q) && !r.p.sku.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const grouped2 = new Map<string, typeof printRows>();
    for (const cat of categories) { grouped2.set(cat.slug, []); }
    for (const r of printRows) {
      const key = r.p.category_slug ?? '__none__';
      if (!grouped2.has(key)) grouped2.set(key, []);
      grouped2.get(key)!.push(r);
    }
    for (const [key, rows2] of grouped2) { if (rows2.length === 0) grouped2.delete(key); }

    const descriptions = catDescriptions;
    const dateStr   = new Date().toISOString().slice(0, 10);
    const dateLabel = new Date().toLocaleDateString('uk-UA');
    const xlsxParamsObj = {
      priceType:         plPriceType,
      categories:        plAllCats ? 'all' : [...plCategories].join(','),
      includeOutOfStock: String(plIncludeOutOfStock),
      showBrand:         String(plShowBrand),
      showDescriptions:  String(plShowDescriptions),
      showImages:        String(plShowImages),
      headerVariant:     plHeaderVariant,
      ...(!plAllBrands   ? { brand: [...plFilterBrands].join(',') } : {}),
      ...(plFilterSearch ? { search: plFilterSearch } : {}),
    };
    const xlsxParamsJSON = JSON.stringify(xlsxParamsObj).replace(/</g, '\\u003c');

    // Build category rows HTML
    // Cost prices come straight from purchase invoices and land at all sorts of
    // precisions (641.4, 1169.13, 705) — force a consistent 2-decimal look there.
    // Other price types keep their existing (integer-typical) formatting untouched.
    const fmtPrice = (v: number) => plPriceType === 'price_cost'
      ? v.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : v.toLocaleString('uk-UA');

    const catBlocks = [...grouped2.entries()].map(([slug, catRows]) => {
      const catName = catRows[0]?.cat?.name ?? slug;
      const desc    = plShowDescriptions ? (descriptions.get(slug) || '') : '';
      const tRows = catRows.map((r, i) => {
        const price = plPriceType === 'price_prom'   ? r.prom_price
                    : plPriceType === 'price_retail' ? r.retail
                    : plPriceType === 'price_unit'   ? r.unit
                    : plPriceType === 'price_cost'   ? r.cost
                    : r.drop;
        const promo = plPriceType === 'price_prom' ? null : r.promo;
        const imgSrc = plShowImages && r.p.image
          ? `${origin}${r.p.image.startsWith('/') ? '' : '/'}${r.p.image}` : null;
        return `<tr class="${i % 2 === 1 ? 'shade' : ''}">
          ${plShowImages ? `<td class="td-img">${imgSrc ? `<img src="${imgSrc}" alt="">` : '<span class="ph"></span>'}</td>` : ''}
          <td class="td-name"><div class="nm">${r.p.name}</div><div class="sku">${r.p.sku}</div></td>
          ${plShowBrand ? `<td class="td-brand">${r.p.brand ?? ''}</td>` : ''}
          <td class="td-vol">${r.p.volume ?? ''}</td>
          <td class="td-price">${
            promo != null && price != null
              ? `<span class="price-old">${fmtPrice(price)} ₴</span><span class="price-new">${fmtPrice(promo)} ₴</span>`
              : price != null ? `<span class="price-reg">${fmtPrice(price)} ₴</span>` : '—'
          }</td>
        </tr>`;
      }).join('');
      return `<div class="cat">${catName}</div>
${desc ? `<div class="cat-desc">${desc}</div>` : ''}
<table>
  <thead><tr>
    ${plShowImages ? '<th class="th" style="width:50px"></th>' : ''}
    <th class="th" style="text-align:left">НАЗВА</th>
    ${plShowBrand ? '<th class="th" style="width:90px">БРЕНД</th>' : ''}
    <th class="th" style="width:90px;text-align:center">ОБ\'ЄМ</th>
    <th class="th" style="width:80px;text-align:right">ЦІНА</th>
  </tr></thead>
  <tbody>${tRows}</tbody>
</table>`;
    }).join('');

    // < екранує '<' → рядок клієнта з '</script>' не може розірвати <script> (stored XSS).
    const contactsJSON = JSON.stringify(contacts).replace(/</g, '\\u003c');

    const FOP_NAME  = 'ФОП Полупан Д.О.';
    const FOP_PHONE = '+380 66 82 82 290';
    const phoneSvg  = '<svg width="11" height="11" viewBox="0 0 16 16" fill="#fff"><path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.6 17.6 0 0 0 4.168 6.608 17.6 17.6 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328z"/></svg>';

    const headerHtml = plHeaderVariant === 'fop'
      ? `<div class="hd hd-fop">
      <div class="hd-fop-name">${FOP_NAME}</div>
      <div class="hd-mid" style="flex:1">
        <div class="hd-mid-title">ПРАЙС-ЛИСТ</div>
        <div class="hd-mid-date">${dateLabel}</div>
      </div>
      <div class="hd-fop-phone">${phoneSvg}${FOP_PHONE}</div>
    </div>`
      : `<div class="hd">
  <div class="hd-logo"><img src="${origin}/fixline-logo-white.svg" alt="FixLine"></div>
  <div class="hd-div"></div>
  <div class="hd-mid">
    <div class="hd-mid-title">ПРАЙС-ЛИСТ</div>
    <div class="hd-mid-date">${dateLabel}</div>
  </div>
  <div class="hd-div"></div>
  <div class="hd-contacts">
    <div class="hd-contact"><svg width="10" height="10" viewBox="0 0 16 16" fill="rgba(255,255,255,.9)"><path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.6 17.6 0 0 0 4.168 6.608 17.6 17.6 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328z"/></svg>+380 99 199 77 88</div>
    <div class="hd-contact"><svg width="10" height="10" viewBox="0 0 16 16" fill="rgba(255,255,255,.9)"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1zm13 2.383-4.708 2.825L15 11.105zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741M1 11.105l4.708-2.897L1 5.383z"/></svg>info@fixline.com.ua</div>
    <div class="hd-contact"><svg width="10" height="10" viewBox="0 0 16 16" fill="rgba(255,255,255,.9)"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472M3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933M8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933M10.855 4a7.966 7.966 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4z"/></svg>fixline.com.ua</div>
  </div>
</div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Прайс-лист</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;font-size:12px;color:#111;background:#f1f5f9;}
.bar{display:flex;gap:8px;padding:10px 20px;background:#fff;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:100;align-items:center;}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;}
.btn-p{background:#1D4ED8;color:#fff;border:none;}
.btn-s{background:#fff;color:#374151;border:1.5px solid #E5E7EB;}
.btn:disabled{opacity:.5;cursor:default;}
.wrap{max-width:960px;margin:0 auto;padding:16px 20px 40px;}
.hd{background:#1E3A5F;display:flex;align-items:center;height:74px;padding:0 12px;border-radius:6px 6px 0 0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.hd-logo{display:flex;align-items:center;padding-right:14px;}
.hd-logo img{height:38px;}
.hd-div{width:1.5px;background:#4880B8;opacity:.5;align-self:stretch;margin:18px 0;}
.hd-mid{flex:1;text-align:center;padding:0 16px;}
.hd-mid-title{font-size:15px;font-weight:700;color:#fff;letter-spacing:.05em;}
.hd-mid-date{font-size:9px;color:rgba(255,255,255,.55);margin-top:4px;}
.hd-contacts{padding-left:14px;display:flex;flex-direction:column;gap:5px;min-width:180px;}
.hd-contact{display:flex;align-items:center;gap:6px;font-size:9px;color:rgba(255,255,255,.9);}
.hd-contact svg{flex-shrink:0;}
.hd-fop{padding:0 20px;}
.hd-fop-name{font-size:13px;font-weight:700;color:#fff;white-space:nowrap;}
.hd-fop-phone{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap;}
.hd-fop-phone svg{flex-shrink:0;}
.cat{background:#1D4E8B;color:#fff;font-size:12px;font-weight:700;padding:6px 12px 6px 16px;border-left:4px solid #4880B8;margin-top:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cat-desc{font-size:10px;color:#6B7280;font-style:italic;padding:4px 4px 2px;line-height:1.5;}
table{width:100%;border-collapse:collapse;background:#fff;}
.th{background:#DBEAFE;font-size:9px;font-weight:700;color:#1E3A5F;text-transform:uppercase;letter-spacing:.04em;padding:5px 8px;border-bottom:1px solid #CBD5E1;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
td{padding:5px 8px;border-bottom:1px solid #F1F5F9;vertical-align:middle;}
tr.shade{background:#F9FAFB;}
.td-name{max-width:0;}
.nm{font-size:11px;color:#111;white-space:normal;word-break:break-word;}
.sku{font-size:9px;color:#9CA3AF;margin-top:2px;}
.td-img{width:50px;text-align:center;padding:3px 5px;}
.td-img img{width:42px;height:42px;object-fit:contain;border-radius:3px;}
.td-img .ph{width:38px;height:38px;background:#F1F5F9;border-radius:3px;display:inline-block;}
.td-brand{font-size:10px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.td-vol{font-size:11px;color:#374151;text-align:center;white-space:nowrap;}
.td-price{text-align:right;white-space:nowrap;min-width:70px;}
.price-reg{font-size:12px;font-weight:700;color:#1E3A5F;}
.price-old{font-size:10px;color:#94A3B8;text-decoration:line-through;display:block;}
.price-new{font-size:12px;font-weight:700;color:#DC2626;display:block;}
.ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;align-items:center;justify-content:center;}
.ov.show{display:flex;}
.eb{background:#fff;border-radius:14px;padding:24px;width:380px;box-shadow:0 20px 60px rgba(0,0,0,.2);}
.eb h3{margin:0 0 14px;font-size:15px;font-weight:700;}
.eb input{width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;}
.erow{display:flex;gap:8px;margin-top:14px;}
.erow .btn{flex:1;justify-content:center;}
@media print{
  .bar,.ov{display:none!important;}
  body{background:#fff;}
  .wrap{padding:0;}
  .hd{border-radius:0;}
  @page{margin:12mm;}
}
</style></head><body>
<div class="bar">
  <button class="btn btn-p" onclick="window.print()">Друкувати</button>
  <button class="btn btn-s" id="pdfBtn" onclick="downloadPdf()">Скачати PDF</button>
  <button class="btn btn-s" onclick="downloadXlsx()">Скачати XLSX</button>
  <button class="btn btn-s" onclick="document.getElementById('eo').classList.add('show')">Відправити на email</button>
</div>
<div class="wrap">
${headerHtml}
${catBlocks}
</div>
<div class="ov" id="eo">
  <div class="eb">
    <h3>Відправити прайс-лист</h3>
    <div id="cw" style="display:${contacts.length > 0 ? 'block' : 'none'}">
      <input type="text" id="cs" placeholder="Пошук контакту..." oninput="filterC(this.value)" autocomplete="off" style="margin-bottom:8px">
      <div id="cl" style="max-height:140px;overflow-y:auto;border:1.5px solid #E5E7EB;border-radius:8px;margin-bottom:10px;"></div>
    </div>
    <input type="email" id="ei" placeholder="email@example.com">
    <div class="erow">
      <button class="btn btn-p" id="sendBtn" onclick="sendEmail()">Відправити</button>
      <button class="btn btn-s" onclick="closeModal()">Скасувати</button>
    </div>
    <p id="em" style="margin:8px 0 0;font-size:12px;color:#6B7280"></p>
  </div>
</div>
<script>
const CONTACTS=${contactsJSON};
let fc=CONTACTS.slice();
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function renderC(list){fc=list;const cl=document.getElementById('cl');if(!cl)return;cl.innerHTML=list.map((c,i)=>'<div style="padding:7px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:12px" onclick="selC('+i+')"><b>'+esc(c.company||c.name)+'</b><br><span style="color:#6B7280;font-size:11px">'+esc(c.email)+'</span></div>').join('');}
function filterC(q){const lq=q.toLowerCase();renderC(lq?CONTACTS.filter(c=>(c.name+' '+(c.company||'')+' '+c.email).toLowerCase().includes(lq)):CONTACTS);}
function selC(i){const c=fc[i];if(c)document.getElementById('ei').value=c.email;}
function closeModal(){document.getElementById('eo').classList.remove('show');document.getElementById('ei').value='';document.getElementById('em').textContent='';const cs=document.getElementById('cs');if(cs){cs.value='';renderC(CONTACTS);}document.getElementById('sendBtn').disabled=false;}
if(CONTACTS.length>0)renderC(CONTACTS);
function downloadXlsx(){
  fetch('/api/admin/prices/pricelist?'+new URLSearchParams(${xlsxParamsJSON}))
    .then(r=>{if(!r.ok)throw new Error();return r.blob();})
    .then(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pricelist_${dateStr}.xlsx';a.click();URL.revokeObjectURL(a.href);})
    .catch(()=>alert('Помилка'));
}
function downloadPdf(){
  const btn=document.getElementById('pdfBtn');
  btn.textContent='Генерується...';btn.disabled=true;
  fetch('/api/admin/prices/pricelist?'+new URLSearchParams({...${xlsxParamsJSON},format:'pdf'}))
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.blob();})
    .then(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pricelist_${dateStr}.pdf';a.click();URL.revokeObjectURL(a.href);})
    .catch(e=>alert('Помилка: '+e.message))
    .finally(()=>{btn.textContent='Скачати PDF';btn.disabled=false;});
}
async function sendEmail(){
  const email=document.getElementById('ei').value.trim();
  if(!email||!email.includes('@')){document.getElementById('em').textContent='Введіть коректний email';return;}
  const btn=document.getElementById('sendBtn');btn.disabled=true;
  document.getElementById('em').textContent='Надсилається...';
  try{
    const res=await fetch('/api/admin/prices/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,xlsxParams:${xlsxParamsJSON}})});
    if(res.ok){document.getElementById('em').textContent='Відправлено!';setTimeout(()=>closeModal(),1500);}
    else{const err=await res.json().catch(()=>({}));document.getElementById('em').textContent='Помилка: '+(err.error||res.status);btn.disabled=false;}
  }catch(e){document.getElementById('em').textContent='Помилка: '+e.message;btn.disabled=false;}
}
</script></body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const totalSelected = selected.size;

  return (
    <div style={{ padding: '28px 32px 80px', maxWidth: 1300 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
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
          {/* Аналіз цін і модель націнок — окремі сторінки без пункту в меню:
              заходять туди рідко, і обидві по суті про ціни */}
          <a href="/admin/pricing" style={{ ...btnSecondary, textDecoration: 'none' }}>
            Аналіз цін
          </a>
          <a href="/admin/pricing-model" style={{ ...btnSecondary, textDecoration: 'none' }}>
            Модель націнок
          </a>
          <button onClick={openPricelist} style={btnPrimary}>
            <FileSpreadsheet size={15} /> Прайс-лист
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1.5px solid var(--border)' }}>
        {(['prices', 'log'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none', background: 'none',
              color: activeTab === tab ? '#1D4ED8' : '#6B7280',
              borderBottom: activeTab === tab ? '2px solid #1D4ED8' : '2px solid transparent',
              marginBottom: -1.5,
            }}
          >
            {tab === 'prices' ? 'Ціни' : 'Журнал переоцінок'}
          </button>
        ))}
      </div>

      {activeTab === 'log' && <PricesLog />}

      {activeTab === 'prices' && <>
      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="Пошук по назві, SKU, бренду..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 200px', height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }}
        />
        <button onClick={selectAll} style={btnSecondary}>Вибрати всі</button>
        <button onClick={allCollapsed ? expandAll : collapseAll} style={btnSecondary}>
          {allCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {allCollapsed ? 'Розгорнути всі' : 'Згорнути всі'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Наявність */}
        <select value={filterStock} onChange={e => setFilterStock(e.target.value as typeof filterStock)} style={{ ...selectStyle, height: 34 }}>
          <option value="all">Всі товари</option>
          <option value="in_stock">В наявності</option>
          <option value="out">Немає в наявності</option>
        </select>
        {/* Бренд */}
        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ ...selectStyle, height: 34, minWidth: 140 }}>
          <option value="">Всі бренди</option>
          {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {/* Без ціни */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: filterNoPrice ? '#DC2626' : '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap', padding: '6px 12px', border: `1.5px solid ${filterNoPrice ? '#FCA5A5' : '#E5E7EB'}`, borderRadius: 8, background: filterNoPrice ? '#FEF2F2' : '#fff' }}>
          <input type="checkbox" checked={filterNoPrice} onChange={e => setFilterNoPrice(e.target.checked)} />
          Без ціни
        </label>
        {/* Зафіксовані */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: filterLocked ? '#D97706' : '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap', padding: '6px 12px', border: `1.5px solid ${filterLocked ? '#FCD34D' : '#E5E7EB'}`, borderRadius: 8, background: filterLocked ? '#FFFBEB' : '#fff' }}>
          <input type="checkbox" checked={filterLocked} onChange={e => setFilterLocked(e.target.checked)} />
          <Lock size={12} /> Зафіксовані
        </label>
        {/* Неактивні */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: showInactive ? '#6B21A8' : '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap', padding: '6px 12px', border: `1.5px solid ${showInactive ? '#D8B4FE' : '#E5E7EB'}`, borderRadius: 8, background: showInactive ? '#FAF5FF' : '#fff' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Неактивні
        </label>
        {/* Акція */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: filterPromo ? '#C2410C' : '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap', padding: '6px 12px', border: `1.5px solid ${filterPromo ? '#FDBA74' : '#E5E7EB'}`, borderRadius: 8, background: filterPromo ? '#FFF7ED' : '#fff' }}>
          <input type="checkbox" checked={filterPromo} onChange={e => setFilterPromo(e.target.checked)} />
          <Tag size={12} /> Акція
        </label>
        {/* Reset */}
        {(filterStock !== 'all' || filterBrand || filterNoPrice || filterLocked || filterPromo || showInactive) && (
          <button onClick={() => { setFilterStock('all'); setFilterBrand(''); setFilterNoPrice(false); setFilterLocked(false); setFilterPromo(false); setShowInactive(false); }} style={{ ...btnSecondary, color: '#fff', background: '#EF4444', borderColor: '#EF4444', fontSize: 12, fontWeight: 700 }}>
            <X size={13} /> Скинути
          </button>
        )}
      </div>

      {/* Repricing panel */}
      {totalSelected > 0 && (
        <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1D4ED8' }}>Переоцінка — {totalSelected} товарів</span>
            <button onClick={cancelRepricing} style={{ ...btnSecondary, fontSize: 12, color: '#6B7280' }}>
              <X size={13} /> Скасувати
            </button>
          </div>
          {/* Conflict warning: selected SKUs already have active promo */}
          {(() => {
            const promoSkus = selectedRows.filter(r => r.s?.price_promo != null);
            if (promoSkus.length === 0) return null;

            // No conflict if our effective_from is after all promo end dates
            const effectiveDate = repricingEffectiveFrom || null;
            const conflicting = promoSkus.filter(r => {
              const revertAt = promoMap[r.p.sku] ?? null;
              if (!revertAt) return true; // indefinite promo — always conflicts
              if (!effectiveDate) return true; // immediate repricing — conflicts with active promo
              return effectiveDate <= revertAt; // overlap: our start is before (or same day as) promo end
            });

            if (conflicting.length === 0) return null; // all promos end before we start

            if (repricingIsPromo) {
              return (
                <div style={{ marginBottom: 10, padding: '7px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7, fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag size={12} />
                  <span><b>{conflicting.length} товар(ів)</b> вже мають акційну ціну — вона буде перезаписана (підсвічено жовтим у таблиці).</span>
                </div>
              );
            }
            return (
              <div style={{ marginBottom: 10, padding: '7px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, fontSize: 12, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={12} />
                <span><b>{conflicting.length} товар(ів)</b> мають активну акцію — <code style={{ fontSize: 11 }}>price_promo</code> залишиться без змін. Якщо потрібно її зняти — спочатку скасуйте акцію, або поставте галочку «Акція».</span>
              </div>
            );
          })()}

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
            {/* Comment */}
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={smallLabel}>Причина переоцінки</label>
              <input
                type="text"
                value={repricingComment}
                onChange={e => setRepricingComment(e.target.value)}
                placeholder="напр. сезонна акція, зміна курсу..."
                style={{ ...inputSmall, width: '100%', height: 32 }}
              />
            </div>
            {/* Акція */}
            <div>
              <label style={smallLabel}>Тип</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '5px 10px', border: `1.5px solid ${repricingIsPromo ? '#F97316' : '#E5E7EB'}`, borderRadius: 7, background: repricingIsPromo ? '#FFF7ED' : '#fff', color: repricingIsPromo ? '#C2410C' : '#6B7280', whiteSpace: 'nowrap', height: 32, boxSizing: 'border-box' }}>
                <input type="checkbox" checked={repricingIsPromo} onChange={e => setRepricingIsPromo(e.target.checked)} />
                <Tag size={12} /> Акція
              </label>
            </div>
            {/* Date range: effective_from → revert_at */}
            <div>
              <label style={smallLabel}>Дата початку</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="date"
                  value={repricingEffectiveFrom}
                  onChange={e => setRepricingEffectiveFrom(e.target.value)}
                  style={{ ...inputSmall, height: 32, paddingRight: 6 }}
                />
                {repricingEffectiveFrom && (
                  <button onClick={() => setRepricingEffectiveFrom('')} style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label style={smallLabel}>Повернути ціни після</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="date"
                  value={repricingRevertAt}
                  min={repricingEffectiveFrom || undefined}
                  onChange={e => setRepricingRevertAt(e.target.value)}
                  style={{ ...inputSmall, height: 32, paddingRight: 6 }}
                />
                {repricingRevertAt && (
                  <button onClick={() => setRepricingRevertAt('')} style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Revenue preview widget */}
          {repricingValue && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              {previewLoading ? (
                <span style={{ color: '#9CA3AF' }}>Розрахунок...</span>
              ) : previewRevenue ? (
                <>
                  <span style={{ color: '#6B7280' }}>Вплив на виручку:</span>
                  <span style={{ fontWeight: 700, color: previewRevenue.delta >= 0 ? '#15803D' : '#DC2626' }}>
                    {previewRevenue.delta >= 0 ? '+' : ''}{previewRevenue.delta.toLocaleString('uk-UA')} ₴
                  </span>
                  <span style={{ color: '#9CA3AF' }}>({previewRevenue.count} поз. × залишок на складі)</span>
                </>
              ) : null}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button onClick={() => setShowPreview(!showPreview)} style={btnSecondary}>
              {showPreview ? 'Сховати прев\'ю' : 'Прев\'ю змін'}
            </button>
            <button onClick={applyRepricing} disabled={saving || !repricingValue} style={btnPrimary}>
              {saving ? 'Зберігаємо...' : repricingEffectiveFrom && repricingEffectiveFrom > new Date().toISOString().split('T')[0] ? 'Запланувати' : 'Застосувати'}
            </button>
            {repricingEffectiveFrom && repricingEffectiveFrom > new Date().toISOString().split('T')[0] && (
              <span style={{ fontSize: 12, color: '#0369A1', display: 'flex', alignItems: 'center', gap: 4 }}>
                Ціни будуть застосовані {new Date(repricingEffectiveFrom).toLocaleDateString('uk-UA')}
              </span>
            )}
            {repricingRevertAt && !(repricingEffectiveFrom && repricingEffectiveFrom > new Date().toISOString().split('T')[0]) && (
              <span style={{ fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <RotateCcw size={12} /> Авто-відкат {new Date(repricingRevertAt).toLocaleDateString('uk-UA')}
              </span>
            )}
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
                    <tr key={row.sku} style={{ borderBottom: '1px solid #F0F7FF', background: row.hasPromo ? '#FFFBEB' : undefined }}>
                      <td style={{ padding: '5px 10px' }}>
                        <span>{row.brand} {row.name}{row.volume && !row.name.includes(row.volume) ? ` ${row.volume}` : ''}</span>
                        {row.hasPromo && (() => {
                          const label = row.promoRevertAt
                            ? `до ${new Date(row.promoRevertAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}`
                            : 'акція';
                          return (
                            <span style={{ marginLeft: 5, display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 600, color: '#C2410C', background: '#FFF7ED', border: '1px solid #FDBA74', padding: '1px 5px', borderRadius: 3, verticalAlign: 'middle' }}>
                              <Tag size={9} /> {label}
                            </span>
                          );
                        })()}
                      </td>
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
                      <th style={{ ...th, width: 110 }}>Роздрібна</th>
                      <th style={{ ...th, width: 85, whiteSpace: 'nowrap' }}>Дроп</th>
                      <th style={{ ...th, width: 90, whiteSpace: 'nowrap' }}>Ціна Prom</th>
                      <th style={{ ...th, width: 90, whiteSpace: 'nowrap' }}>Ціна Rozetka</th>
                      <th style={{ width: 60, padding: '8px 12px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {catRows.map(r => {
                      const isEditing = editSku === r.p.sku;
                      return (
                        <tr key={r.p.sku} style={{ borderBottom: '1px solid #F3F4F6', background: selected.has(r.p.sku) && r.s?.price_promo != null ? '#FFFBEB' : selected.has(r.p.sku) ? '#F0F7FF' : undefined }}>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <input type="checkbox" checked={selected.has(r.p.sku)} onChange={() => toggleRow(r.p.sku)} />
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#111', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span>{r.p.brand} {r.p.name}{r.p.volume && !r.p.name.includes(r.p.volume) ? ` ${r.p.volume}` : ''}</span>
                              {r.s?.price_promo != null && (() => {
                                const revertAt = promoMap[r.p.sku] ?? null;
                                const label = revertAt
                                  ? `до ${new Date(revertAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}`
                                  : 'акція';
                                return (
                                  <span title={`Акційна ціна: ${r.s!.price_promo.toLocaleString('uk-UA')} ₴${revertAt ? ` · діє до ${new Date(revertAt).toLocaleDateString('uk-UA')}` : ''}`} style={{ fontSize: 10, fontWeight: 700, color: '#C2410C', background: '#FFF7ED', border: '1px solid #FDBA74', padding: '1px 5px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                    <Tag size={9} /> {label}
                                  </span>
                                );
                              })()}
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
                              <td style={{ padding: '6px 8px', fontSize: 12, color: '#9CA3AF' }}>авто</td>
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
                              <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500 }}>
                                {r.s?.price_promo != null ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                                    <span style={{ color: '#9CA3AF', textDecoration: 'line-through', fontWeight: 400 }}>{fmt(r.retail)}</span>
                                    <span style={{ color: '#C2410C', fontWeight: 700 }}>{r.s.price_promo} ₴</span>
                                  </span>
                                ) : fmt(r.retail)}
                              </td>
                              <td style={{ padding: '8px 14px', fontSize: 13, color: '#6B7280' }}>{fmt(r.drop)}</td>
                              <td style={{ padding: '8px 14px', fontSize: 13, color: '#6B7280' }}>{r.promPrice != null ? `${r.promPrice} ₴` : '—'}</td>
                              <td style={{ padding: '8px 14px', fontSize: 13, color: '#0EA5E9', fontWeight: r.rzPrice ? 500 : 400 }}>{r.rzPrice != null ? `${r.rzPrice} ₴` : '—'}</td>
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 480, margin: '0 12px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Прайс-лист для клієнта</h2>
              <button onClick={() => setShowPricelist(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Header variant */}
              <div>
                <label style={modalLabel}>Шапка прайс-листа</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['fixline', 'FixLine'], ['fop', 'ФОП Полупан Д.О.']] as [typeof plHeaderVariant, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setPlHeaderVariant(val)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${plHeaderVariant === val ? '#1D4ED8' : '#E5E7EB'}`, background: plHeaderVariant === val ? '#EFF6FF' : '#fff', color: plHeaderVariant === val ? '#1D4ED8' : '#374151', fontWeight: plHeaderVariant === val ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price type */}
              <div>
                <label style={modalLabel}>Тип цін</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  {([['price_retail', 'Роздрібна'], ['price_unit', 'Оптова'], ['price_drop', 'Дроп'], ['price_cost', 'Закупівельна']] as [PriceField, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setPlPriceType(val)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${plPriceType === val ? '#1D4ED8' : '#E5E7EB'}`, background: plPriceType === val ? '#EFF6FF' : '#fff', color: plPriceType === val ? '#1D4ED8' : '#374151', fontWeight: plPriceType === val ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>Маркетплейси:</span>
                  <button onClick={() => setPlPriceType('price_prom')}
                    style={{ padding: '6px 16px', borderRadius: 8, border: `1.5px solid ${plPriceType === 'price_prom' ? '#7C3AED' : '#E5E7EB'}`, background: plPriceType === 'price_prom' ? '#F5F3FF' : '#fff', color: plPriceType === 'price_prom' ? '#7C3AED' : '#374151', fontWeight: plPriceType === 'price_prom' ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
                    Prom.ua
                  </button>
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
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px' }}>
                    {categories.filter(c => !c.parent_slug).map(parent => {
                      const children = catChildren.get(parent.slug) ?? [];
                      const allSlugs = children.length > 0
                        ? [parent.slug, ...children.map(c => c.slug)]
                        : [parent.slug];
                      const checkedCount = allSlugs.filter(s => plCategories.has(s)).length;
                      const allChecked  = checkedCount === allSlugs.length;
                      const someChecked = checkedCount > 0 && !allChecked;
                      return (
                        <div key={parent.slug}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              ref={el => { if (el) el.indeterminate = someChecked; }}
                              checked={allChecked}
                              onChange={e => setPlCategories(prev => {
                                const s = new Set(prev);
                                if (e.target.checked) allSlugs.forEach(sl => s.add(sl));
                                else allSlugs.forEach(sl => s.delete(sl));
                                return s;
                              })}
                            />
                            {parent.name}
                          </label>
                          {children.map(child => (
                            <label key={child.slug} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 2px 20px', fontSize: 12, color: '#4B5563', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={plCategories.has(child.slug)}
                                onChange={e => setPlCategories(prev => {
                                  const s = new Set(prev);
                                  e.target.checked ? s.add(child.slug) : s.delete(child.slug);
                                  return s;
                                })}
                              />
                              {child.name}
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Filters */}
              <div>
                <label style={modalLabel}>Фільтри товарів</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={smallLabel}>Бренд</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={plAllBrands} onChange={e => setPlAllBrands(e.target.checked)} />
                      Всі бренди
                    </label>
                    {!plAllBrands && (
                      <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px' }}>
                        {allBrands.map(b => (
                          <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={plFilterBrands.has(b)}
                              onChange={e => setPlFilterBrands(prev => {
                                const s = new Set(prev);
                                e.target.checked ? s.add(b) : s.delete(b);
                                return s;
                              })}
                            />
                            {b}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={smallLabel}>Пошук по назві / SKU</label>
                    <input
                      type="text"
                      value={plFilterSearch}
                      onChange={e => setPlFilterSearch(e.target.value)}
                      placeholder="Частина назви або SKU..."
                      style={{ ...inputSmall, width: '100%', height: 34, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={plShowImages} onChange={e => setPlShowImages(e.target.checked)} />
                  Показувати зображення
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={plShowDescriptions} onChange={e => setPlShowDescriptions(e.target.checked)} />
                  Показувати описи категорій
                </label>
              </div>

              {/* Category descriptions editor */}
              {plShowDescriptions && (
                <div>
                  <button
                    onClick={() => setDescExpanded(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginBottom: descExpanded ? 10 : 0 }}
                  >
                    {descExpanded ? <ChevronUp size={14} color="#6B7280" /> : <ChevronDown size={14} color="#6B7280" />}
                    <span style={{ ...modalLabel, margin: 0 }}>Описи категорій</span>
                  </button>
                  {descExpanded && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {categories.filter(c => !c.parent_slug).map(parent => {
                      const children = catChildren.get(parent.slug) ?? [];
                      const catsToDescribe = children.length > 0 ? [parent, ...children] : [parent];
                      return (
                        <div key={parent.slug} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {catsToDescribe.map((cat, idx) => (
                            <div key={cat.slug}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 3, paddingLeft: idx > 0 ? 12 : 0 }}>
                                {idx > 0 ? '↳ ' : ''}{cat.name}
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', paddingLeft: idx > 0 ? 12 : 0 }}>
                                <textarea
                                  rows={2}
                                  value={catDescriptions.get(cat.slug) ?? ''}
                                  onChange={e => setCatDescriptions(prev => { const m = new Map(prev); m.set(cat.slug, e.target.value); return m; })}
                                  placeholder="Короткий опис для прайс-листа..."
                                  style={{ flex: 1, fontSize: 12, padding: '5px 8px', border: '1.5px solid #E5E7EB', borderRadius: 6, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
                                />
                                <button
                                  onClick={() => saveDescription(cat.slug)}
                                  disabled={savingDesc.has(cat.slug)}
                                  title="Зберегти опис"
                                  style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #D1FAE5', background: '#ECFDF5', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}
                                >
                                  <Check size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={generatePricelist} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
                  <FileSpreadsheet size={15} /> Сгенерувати
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      </>}
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
