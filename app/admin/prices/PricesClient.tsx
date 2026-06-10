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
  slug:                string;
  name:                string;
  parent_slug:         string | null;
  prom_commission_pct: number | null;
  prom_markup_pct:     number | null;
  description:         string | null;
}

interface Props {
  products:   Product[];
  stock:      Stock[];
  categories: Category[];
  promoMap:   Record<string, string | null>; // sku → revert_at (null = indefinite)
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

function calcPromPrice(retail: number, markup: number, commission: number) {
  return Math.ceil(retail * (1 + markup / 100) / (1 - commission / 100));
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
  const [plPriceType, setPlPriceType]               = useState<PriceField>('price_retail');
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

        return { p, cost, unit, retail, drop, locked, cat, promPrice, s };
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

  function generatePricelist() {
    const origin = window.location.origin;

    // Use all active products — NOT filtered by admin UI search/filters
    const allRows = products
      .filter(p => p.is_active)
      .map(p => {
        const s  = stockMap.get(p.sku);
        const ov = overrides.get(p.sku);
        const cat = p.category_slug ? catMap.get(p.category_slug) : null;
        return {
          p,
          cat,
          s,
          retail: n(ov?.price_retail ?? s?.price_retail),
          unit:   n(ov?.price_unit   ?? s?.price_unit),
          drop:   n(ov?.price_drop   ?? s?.price_drop),
        };
      });

    const printRows = allRows.filter(r => {
      if (!plIncludeOutOfStock && r.s?.stock_status !== 'in_stock') return false;
      if (!plAllCats && r.p.category_slug) {
        const directMatch = plCategories.has(r.p.category_slug);
        const parentMatch = r.cat?.parent_slug ? plCategories.has(r.cat.parent_slug) : false;
        if (!directMatch && !parentMatch) return false;
      }
      return true;
    });

    const grouped2 = new Map<string, typeof printRows>();
    for (const r of printRows) {
      const key = r.p.category_slug ?? '__none__';
      if (!grouped2.has(key)) grouped2.set(key, []);
      grouped2.get(key)!.push(r);
    }

    const descriptions = catDescriptions;
    const imgColW   = plShowImages ? '55px' : null;
    const brandColW = plShowBrand  ? '110px' : null;
    const volColW   = '110px';
    const priceColW = '95px';
    const dateStr   = new Date().toISOString().slice(0, 10);
    const dateLabel = new Date().toLocaleDateString('uk-UA');
    const xlsxParams = JSON.stringify({
      priceType:         plPriceType,
      categories:        plAllCats ? 'all' : [...plCategories].join(','),
      includeOutOfStock: String(plIncludeOutOfStock),
      showBrand:         String(plShowBrand),
    });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Прайс-лист</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; }
  .action-bar { display: flex; gap: 8px; padding: 10px 24px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; z-index: 100; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-p { background: #1D4ED8; color: #fff; border: none; }
  .btn-s { background: #fff; color: #374151; border: 1.5px solid #E5E7EB; }
  .content { max-width: 960px; margin: 24px auto; padding: 0 24px; }
  .pl-label { font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 6px; }
  .logo { height: 30px; display: block; margin-bottom: 3px; }
  .site-url { font-size: 11px; color: #1D4ED8; text-decoration: none; display: block; margin-bottom: 3px; }
  .meta { color: #9CA3AF; font-size: 11px; }
  .pl-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .pl-contacts { text-align: right; padding-top: 18px; }
  .pl-phone { font-size: 15px; font-weight: 700; color: #111; margin-bottom: 4px; letter-spacing: .01em; }
  .pl-email { font-size: 11px; color: #1D4ED8; text-decoration: none; display: block; }
  h2 { font-size: 13px; font-weight: 700; background: #f0f4f8; padding: 6px 10px; margin: 20px 0 4px; border-left: 3px solid #1D4ED8; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
  th { background: #f9fafb; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; padding: 5px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  td.name { white-space: normal; word-break: break-word; }
  td.vol, th.vol { text-align: center; }
  tr:last-child td { border-bottom: none; }
  .price { font-weight: 700; text-align: right; white-space: nowrap; }
  .img-cell { padding: 2px 6px; text-align: center; }
  .img-cell img { width: 44px; height: 44px; object-fit: contain; display: block; margin: auto; }
  .cat-desc { font-size: 11px; color: #555; font-style: italic; margin: 0 0 6px; padding: 0 2px; line-height: 1.5; }
  .overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200; align-items: center; justify-content: center; }
  .overlay.show { display: flex; }
  .email-box { background: #fff; border-radius: 14px; padding: 28px; width: 340px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
  .email-box h3 { margin: 0 0 16px; font-size: 15px; font-weight: 700; }
  .email-box input { width: 100%; padding: 8px 10px; border: 1.5px solid #E5E7EB; border-radius: 8px; font-size: 13px; margin-bottom: 14px; outline: none; }
  .erow { display: flex; gap: 8px; }
  @media print {
    .action-bar, .overlay { display: none !important; }
    .content { margin: 0; padding: 0; max-width: 100%; }
    @page {
      margin: 15mm;
      @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; }
      @bottom-left { content: ""; }
      @bottom-center { content: counter(page); font-size: 10px; color: #888; font-family: Arial, sans-serif; }
      @bottom-right { content: ""; }
    }
  }
</style></head><body>
<div class="action-bar">
  <button class="btn btn-p" onclick="window.print()">Друкувати</button>
  <button class="btn btn-s" id="pdfBtn" onclick="downloadPdf()">Скачати PDF</button>
  <button class="btn btn-s" onclick="downloadXlsx()">Скачати XLSX</button>
  <button class="btn btn-s" onclick="document.getElementById('eo').classList.add('show')">Відправити на email</button>
</div>
<div class="content">
  <div class="pl-header">
    <div>
      <div class="pl-label">Прайс-лист</div>
      <img class="logo" src="${origin}/fixline-logo.svg" alt="Fixline">
      <a class="site-url" href="https://fixline.com.ua" target="_blank">fixline.com.ua</a>
      <div class="meta">${dateLabel}</div>
    </div>
    <div class="pl-contacts">
      <div class="pl-phone">+380 99 199 77 88</div>
      <a class="pl-email" href="mailto:info@fixline.com.ua">info@fixline.com.ua</a>
    </div>
  </div>
${[...grouped2.entries()].map(([slug, catRows]) => {
  const catName = catRows[0]?.cat?.name ?? slug;
  const desc = plShowDescriptions ? (descriptions.get(slug) || '') : '';
  return `<h2>${catName}</h2>
${desc ? `<p class="cat-desc">${desc}</p>` : ''}
<table>
  <colgroup>
    ${imgColW   ? `<col style="width:${imgColW}">` : ''}
    <col>
    ${brandColW ? `<col style="width:${brandColW}">` : ''}
    <col style="width:${volColW}">
    <col style="width:${priceColW}">
  </colgroup>
  <thead><tr>
    ${imgColW ? '<th class="img-cell"></th>' : ''}
    <th>Назва</th>
    ${plShowBrand ? '<th>Бренд</th>' : ''}
    <th class="vol">Об\'єм / Вага</th>
    <th style="text-align:right">Ціна</th>
  </tr></thead>
  <tbody>
    ${catRows.map(r => {
      const price = r[plPriceType === 'price_retail' ? 'retail' : plPriceType === 'price_unit' ? 'unit' : 'drop'];
      const imgSrc = plShowImages && r.p.image ? `${origin}${r.p.image.startsWith('/') ? '' : '/'}${r.p.image}` : null;
      return `<tr>
        ${imgColW ? `<td class="img-cell">${imgSrc ? `<img src="${imgSrc}" alt="">` : ''}</td>` : ''}
        <td class="name">${r.p.name}</td>
        ${plShowBrand ? `<td>${r.p.brand ?? ''}</td>` : ''}
        <td class="vol">${r.p.volume ?? ''}</td>
        <td class="price">${price != null ? price.toLocaleString('uk-UA') + ' ₴' : '—'}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>`;
}).join('')}
</div>
<div class="overlay" id="eo">
  <div class="email-box">
    <h3>Відправити прайс-лист</h3>
    <input type="email" id="ei" placeholder="email@example.com">
    <div class="erow">
      <button class="btn btn-p" style="flex:1" onclick="sendEmail()">Відправити</button>
      <button class="btn btn-s" onclick="document.getElementById('eo').classList.remove('show')">Скасувати</button>
    </div>
    <p id="em" style="margin:10px 0 0;font-size:12px;color:#6B7280"></p>
  </div>
</div>
<script>
function downloadXlsx(){
  const p=${xlsxParams};
  fetch('/api/admin/prices/pricelist?'+new URLSearchParams(p))
    .then(r=>{if(!r.ok)throw new Error();return r.blob();})
    .then(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pricelist_${dateStr}.xlsx';a.click();})
    .catch(()=>alert('Помилка завантаження XLSX'));
}
function downloadPdf(){
  const btn=document.getElementById('pdfBtn');
  btn.textContent='Генерується...';btn.disabled=true;
  html2pdf().set({
    margin:[10,8,10,8],
    filename:'pricelist_${dateStr}.pdf',
    image:{type:'jpeg',quality:0.97},
    html2canvas:{scale:2,useCORS:true,logging:false},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
    pagebreak:{mode:'avoid-all'}
  }).from(document.querySelector('.content')).save()
    .finally(()=>{btn.textContent='Скачати PDF';btn.disabled=false;});
}
async function sendEmail(){
  const email=document.getElementById('ei').value.trim();
  if(!email||!email.includes('@')){document.getElementById('em').textContent='Введіть коректний email';return;}
  const btn=document.querySelector('#eo .btn-p');
  btn.disabled=true;
  document.getElementById('em').textContent='Надсилається...';
  try{
    const res=await fetch('${origin}/api/admin/prices/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,xlsxParams:${xlsxParams}})});
    if(res.ok){
      document.getElementById('em').textContent='Відправлено!';
      setTimeout(()=>document.getElementById('eo').classList.remove('show'),1200);
    }else{
      const err=await res.json().catch(()=>({}));
      document.getElementById('em').textContent='Помилка: '+(err.error||res.status);
      btn.disabled=false;
    }
  }catch(e){document.getElementById('em').textContent='Помилка: '+e.message;btn.disabled=false;}
}
</script>
</body></html>`;

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
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
          <button onClick={openPricelist} style={{ ...btnPrimary, background: '#fff', border: '1.5px solid #E5E7EB', color: '#374151' }}>
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
        <input
          type="text" placeholder="Пошук по назві, SKU, бренду..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }}
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
