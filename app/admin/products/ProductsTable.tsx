'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Search, Edit, Package, AlertCircle, Wand2 } from 'lucide-react';
import type { ProductFull, Category } from '../../../types';
import AiFillModal from './AiFillModal';

type Props = {
  products: ProductFull[];
  categories: Category[];
};

const PAGE_SIZE = 100;

export default function ProductsTable({ products, categories }: Props) {
  const [search, setSearch]               = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand]     = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [visibleCount, setVisibleCount]   = useState(PAGE_SIZE);
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  const [toggling, setToggling]           = useState<Set<string>>(new Set());
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [showAiFill, setShowAiFill]       = useState(false);

  const toggleActive = useCallback(async (sku: string, current: boolean) => {
    if (toggling.has(sku)) return;
    const next = !current;
    setActiveOverrides(prev => ({ ...prev, [sku]: next }));
    setToggling(prev => new Set(prev).add(sku));
    try {
      await fetch(`/api/admin/products?sku=${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      });
    } catch {
      setActiveOverrides(prev => ({ ...prev, [sku]: current }));
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(sku); return s; });
    }
  }, [toggling]);

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { map[c.slug] = c.name; });
    return map;
  }, [categories]);

  const parentCats = useMemo(() => categories.filter(c => !c.parent_slug), [categories]);

  const brands = useMemo(() => {
    const set = new Set(products.map(p => p.brand).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'uk'));
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q)
      );
    }

    if (filterCategory) {
      const children = categories.filter(c => c.parent_slug === filterCategory).map(c => c.slug);
      const slugs = new Set([filterCategory, ...children]);
      list = list.filter(p => slugs.has(p.category_slug ?? ''));
    }

    if (filterBrand) {
      list = list.filter(p => p.brand === filterBrand);
    }

    if (filterStatus === 'active') {
      list = list.filter(p => p.is_active);
    } else if (filterStatus === 'inactive') {
      list = list.filter(p => !p.is_active);
    } else if (filterStatus === 'no_price') {
      list = list.filter(p => !p.stock?.price_retail || p.stock.price_retail === 0);
    } else if (filterStatus === 'out_of_stock') {
      list = list.filter(p => p.stock?.stock_status === 'out_of_stock' || (!p.stock?.stock_status && (p.stock?.stock_qty ?? 0) < 1));
    } else if (filterStatus === 'unfilled') {
      list = list.filter(p =>
        !p.description_full ||
        !p.keywords ||
        !p.characteristics?.length
      );
    } else if (filterStatus === 'few_chars') {
      list = list.filter(p => (p.characteristics?.length ?? 0) < 6);
    }

    return list;
  }, [products, categories, search, filterCategory, filterBrand, filterStatus]);

  const visibleProducts = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const resetVisible = () => setVisibleCount(PAGE_SIZE);

  // Selection helpers
  const allVisibleSelected = visibleProducts.length > 0 && visibleProducts.every(p => selected.has(p.sku));
  const someSelected = selected.size > 0;

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        visibleProducts.forEach(p => next.delete(p.sku));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        visibleProducts.forEach(p => next.add(p.sku));
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
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Пошук за назвою, SKU, брендом..."
            value={search}
            onChange={e => { setSearch(e.target.value); resetVisible(); }}
            style={{
              width: '100%', height: '44px', paddingLeft: '42px', paddingRight: '16px',
              borderRadius: '10px', border: '1px solid var(--border)', fontSize: '14px',
              outline: 'none',
            }}
          />
        </div>

        <select
          value={filterCategory}
          onChange={e => { setFilterCategory(e.target.value); resetVisible(); }}
          style={{
            flex: '1 1 0', minWidth: 0, height: '44px', padding: '0 16px', borderRadius: '10px',
            border: '1px solid var(--border)', fontSize: '14px',
            background: filterCategory ? 'var(--brand-blue-light)' : 'var(--bg-card)',
          }}
        >
          <option value="">Всі категорії</option>
          {parentCats.map(c => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>

        <select
          value={filterBrand}
          onChange={e => { setFilterBrand(e.target.value); resetVisible(); }}
          style={{
            flex: '1 1 0', minWidth: 0, height: '44px', padding: '0 16px', borderRadius: '10px',
            border: '1px solid var(--border)', fontSize: '14px',
            background: filterBrand ? 'var(--brand-blue-light)' : 'var(--bg-card)',
          }}
        >
          <option value="">Всі бренди</option>
          {brands.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); resetVisible(); }}
          style={{
            flex: '1 1 0', minWidth: 0, height: '44px', padding: '0 16px', borderRadius: '10px',
            border: '1px solid var(--border)', fontSize: '14px',
            background: filterStatus ? 'var(--brand-blue-light)' : 'var(--bg-card)',
          }}
        >
          <option value="">Всі статуси</option>
          <option value="active">Активні</option>
          <option value="inactive">Неактивні</option>
          <option value="no_price">Без ціни</option>
          <option value="out_of_stock">Немає в наявності</option>
          <option value="unfilled">Незаповнені (без опису/keywords/характеристик)</option>
          <option value="few_chars">Мало характеристик (менше 6)</option>
        </select>
      </div>

      {/* Counter + bulk action bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', minHeight: 32 }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Знайдено: {filtered.length} товарів
          {someSelected && (
            <span style={{ marginLeft: 8, color: '#3DBFB8', fontWeight: 600 }}>
              · вибрано {selected.size}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {filtered.length > visibleCount && !someSelected && (
            <button
              onClick={() => setSelected(new Set(filtered.map(p => p.sku)))}
              style={{
                height: 34, padding: '0 14px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              }}
            >
              Вибрати всі {filtered.length}
            </button>
          )}
          {someSelected && (
            <button
              onClick={() => setSelected(new Set())}
              style={{
                height: 34, padding: '0 14px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              }}
            >
              Зняти вибір
            </button>
          )}
          <button
            onClick={() => someSelected && setShowAiFill(true)}
            disabled={!someSelected}
            style={{
              height: 34, padding: '0 16px', borderRadius: 8, border: 'none',
              background: someSelected ? '#3DBFB8' : '#E2E8F0',
              color: someSelected ? '#fff' : '#94A3B8',
              fontSize: 13, fontWeight: 600,
              cursor: someSelected ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <Wand2 size={14} /> AI заповнення{someSelected ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 12px 12px 16px', width: 36 }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer', width: 15, height: 15 }}
                />
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>SKU</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Назва</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Бренд</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Категорія</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Опт</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Роздріб</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Дроп</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Залишок</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Статус</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}></th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map(p => {
              const hasIssue = !p.stock?.price_retail || p.stock?.stock_status === 'out_of_stock';
              const isActive = (s: string) => activeOverrides[s] !== undefined ? activeOverrides[s] : p.is_active;
              const active = isActive(p.sku);
              const isToggling = toggling.has(p.sku);
              const isSelected = selected.has(p.sku);
              const isFilled = p.description_full && p.keywords && p.characteristics?.length;
              return (
                <tr
                  key={p.sku}
                  style={{
                    borderBottom: '1px solid var(--border-light)',
                    opacity: active ? 1 : 0.55,
                    background: isSelected ? 'rgba(61,191,184,0.05)' : undefined,
                    cursor: 'default',
                  }}
                >
                  <td style={{ padding: '12px 12px 12px 16px', width: 36 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(p.sku)}
                      style={{ cursor: 'pointer', width: 15, height: 15 }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {p.sku}
                    {!isFilled && (
                      <span title="Незаповнена картка" style={{ marginLeft: 4, color: '#F59E0B', fontSize: 11 }}>●</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    {p.volume && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.volume}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{p.brand}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {categoryMap[p.category_slug ?? ''] ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {p.stock?.price_unit ? `${p.stock.price_unit} ₴` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {p.stock?.price_retail ? `${p.stock.price_retail} ₴` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {p.stock?.price_drop ? `${p.stock.price_drop} ₴` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: p.stock?.stock_status === 'out_of_stock' ? '#EF4444' : p.stock?.stock_status === 'in_stock' ? '#475569' : '#94A3B8' }}>
                    {(p.stock?.stock_qty ?? 0) > 0 ? p.stock!.stock_qty : p.stock?.stock_status === 'in_stock' ? 'є' : p.stock?.stock_status === 'out_of_stock' ? 'нема' : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      {hasIssue && <AlertCircle size={14} color="#F59E0B" />}
                      <button
                        onClick={e => { e.stopPropagation(); toggleActive(p.sku, active); }}
                        disabled={isToggling}
                        title={active ? 'Натисни щоб приховати' : 'Натисни щоб показати'}
                        style={{
                          position: 'relative', width: '36px', height: '20px', borderRadius: '10px',
                          border: 'none', cursor: isToggling ? 'wait' : 'pointer', padding: 0,
                          background: active ? '#22C55E' : '#CBD5E1',
                          transition: 'background 0.2s', opacity: isToggling ? 0.6 : 1,
                          flexShrink: 0,
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: '2px',
                          left: active ? '18px' : '2px',
                          width: '16px', height: '16px', borderRadius: '50%',
                          background: '#fff', transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <Link
                      href={`/admin/products/${p.sku}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '36px', height: '36px', borderRadius: '8px',
                        border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
                        textDecoration: 'none',
                      }}
                    >
                      <Edit size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length > visibleCount && (
          <div style={{ padding: '20px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Показано {visibleCount} з {filtered.length}
            </div>
            <button
              onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
              style={{
                height: '38px', padding: '0 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: '1.5px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', cursor: 'pointer',
              }}
            >
              Показати ще {Math.min(PAGE_SIZE, filtered.length - visibleCount)}
            </button>
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Package size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <div>Товарів не знайдено</div>
          </div>
        )}
      </div>

      {/* AI Fill Modal */}
      {showAiFill && (
        <AiFillModal
          skus={Array.from(selected)}
          products={products}
          onClose={() => setShowAiFill(false)}
          onDone={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
