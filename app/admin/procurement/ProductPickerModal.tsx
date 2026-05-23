'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Plus, Minus, ChevronRight, ChevronDown, Loader2, Package } from 'lucide-react';

type Category = { slug: string; name: string; parent_slug: string | null; sort_order: number };
type CatalogProduct = {
  sku: string; name: string; brand: string | null;
  category_slug: string | null;
  price_cost: number | null; price_unit: number | null; min_price: number | null;
};
type Selection = { sku: string; name: string; cost_price: number; qty: number };

type Props = {
  zIndex?: number;
  onClose: () => void;
  onAdd: (items: { sku: string; name: string; qty: number; cost_price: number }[]) => void;
};

export default function ProductPickerModal({ zIndex = 1300, onClose, onAdd }: Props) {
  const [categories,        setCategories]        = useState<Category[]>([]);
  const [products,          setProducts]          = useState<CatalogProduct[]>([]);
  const [loading,           setLoading]           = useState(false);
  const [selectedCategory,  setSelectedCategory]  = useState<string | null>(null);
  const [expandedRoots,     setExpandedRoots]     = useState<Set<string>>(new Set());
  const [searchQ,           setSearchQ]           = useState('');
  const [selections,        setSelections]        = useState<Map<string, Selection>>(new Map());

  // Load categories once on mount
  useEffect(() => {
    fetch('/api/admin/products/catalog')
      .then(r => r.json())
      .then(d => {
        setCategories(d.categories ?? []);
      });
  }, []);

  // Load products when category or search changes
  const loadProducts = useCallback(async (cat: string | null, q: string) => {
    if (!cat && q.length < 2) { setProducts([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cat && q.length < 2) params.set('category', cat);
      if (q.length >= 2)       params.set('q', q);
      const res  = await fetch(`/api/admin/products/catalog?${params}`);
      const data = await res.json();
      setProducts(data.products ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadProducts(selectedCategory, searchQ), 250);
    return () => clearTimeout(timer);
  }, [selectedCategory, searchQ, loadProducts]);

  // Build category tree
  const roots    = categories.filter(c => !c.parent_slug).sort((a, b) => a.sort_order - b.sort_order);
  const childMap = new Map<string, Category[]>();
  categories.filter(c => c.parent_slug).forEach(c => {
    if (!childMap.has(c.parent_slug!)) childMap.set(c.parent_slug!, []);
    childMap.get(c.parent_slug!)!.push(c);
  });

  function toggleSelection(p: CatalogProduct) {
    setSelections(prev => {
      const n = new Map(prev);
      if (n.has(p.sku)) {
        n.delete(p.sku);
      } else {
        n.set(p.sku, {
          sku:        p.sku,
          name:       [p.brand, p.name].filter(Boolean).join(' '),
          cost_price: p.price_cost ?? p.price_unit ?? 0,
          qty:        1,
        });
      }
      return n;
    });
  }

  function setQty(sku: string, qty: number) {
    setSelections(prev => {
      const n    = new Map(prev);
      const item = n.get(sku);
      if (item) n.set(sku, { ...item, qty: Math.max(1, qty) });
      return n;
    });
  }

  function handleAdd() {
    const items = [...selections.values()].map(s => ({
      sku:        s.sku,
      name:       s.name,
      qty:        s.qty,
      cost_price: s.cost_price,
    }));
    onAdd(items);
    onClose();
  }

  function selectCategory(slug: string) {
    setSelectedCategory(slug);
    setSearchQ('');
  }

  const selectedCount = selections.size;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '940px', maxWidth: '96vw', height: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', overflow: 'hidden' }}>

        {/* ─── Header ─── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <Package size={18} color="#1E3A5F" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', flex: 1 }}>
            Вибрати товари з каталогу
          </h3>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-soft)', border: '1.5px solid var(--border)', borderRadius: '8px', padding: '0 10px', width: '240px' }}>
            <Search size={13} color="var(--text-muted)" />
            <input
              value={searchQ}
              onChange={e => { setSearchQ(e.target.value); if (e.target.value.length >= 2) setSelectedCategory(null); }}
              placeholder="Пошук за назвою або артикулом…"
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: '13px', color: 'var(--text-primary)', width: '100%', padding: '7px 0' }}
            />
            {searchQ && (
              <button onClick={() => setSearchQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* ─── Body ─── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* Left: category tree */}
          <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '6px 0' }}>
            {roots.map(root => {
              const children  = (childMap.get(root.slug) ?? []).sort((a, b) => a.sort_order - b.sort_order);
              const isExpanded = expandedRoots.has(root.slug);
              const isActive   = selectedCategory === root.slug;
              return (
                <div key={root.slug}>
                  <button
                    onClick={() => {
                      if (children.length > 0) {
                        setExpandedRoots(prev => { const n = new Set(prev); n.has(root.slug) ? n.delete(root.slug) : n.add(root.slug); return n; });
                        if (!isExpanded) selectCategory(root.slug); // expand + select root
                      } else {
                        selectCategory(root.slug);
                      }
                    }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: isActive ? '#EFF4FF' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: isActive ? '#1E3A5F' : 'var(--text-primary)', borderLeft: isActive ? '3px solid #1E3A5F' : '3px solid transparent' }}>
                    {children.length > 0
                      ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                      : <span style={{ display: 'inline-block', width: '12px' }} />
                    }
                    <span style={{ flex: 1, lineHeight: 1.3 }}>{root.name}</span>
                  </button>
                  {isExpanded && children.map(child => {
                    const isChildActive = selectedCategory === child.slug;
                    return (
                      <button
                        key={child.slug}
                        onClick={() => selectCategory(child.slug)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '5px 12px 5px 28px', background: isChildActive ? '#EFF4FF' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '12px', fontWeight: isChildActive ? 600 : 400, color: isChildActive ? '#1E3A5F' : 'var(--text-secondary)', borderLeft: isChildActive ? '3px solid #4880B8' : '3px solid transparent' }}>
                        {child.name}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Right: product list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {(!selectedCategory && searchQ.length < 2) ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', gap: '8px' }}>
                <Package size={32} strokeWidth={1} />
                <span>← Оберіть категорію або введіть назву товару</span>
              </div>
            ) : loading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження…
              </div>
            ) : products.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Товарів не знайдено
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '32px 90px 1fr 80px 100px', padding: '7px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '8px', position: 'sticky', top: 0, zIndex: 1 }}>
                  <span />
                  <span>Артикул</span>
                  <span>Назва</span>
                  <span style={{ textAlign: 'right' }}>Ціна</span>
                  <span style={{ textAlign: 'center' }}>К-сть</span>
                </div>

                {products.map(p => {
                  const sel        = selections.get(p.sku);
                  const isSelected = !!sel;
                  const price      = p.price_cost ?? p.price_unit ?? p.min_price;
                  return (
                    <div
                      key={p.sku}
                      onClick={() => toggleSelection(p)}
                      style={{ display: 'grid', gridTemplateColumns: '32px 90px 1fr 80px 100px', padding: '8px 16px', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-light)', background: isSelected ? '#F0F7FF' : 'transparent', cursor: 'pointer', transition: 'background 0.1s' }}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(p)}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer', accentColor: '#1E3A5F', width: '15px', height: '15px' }}
                      />
                      {/* SKU */}
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.sku}
                      </span>
                      {/* Name */}
                      <div style={{ minWidth: 0 }}>
                        {p.brand && <span style={{ fontSize: '11px', fontWeight: 700, color: '#4880B8', marginRight: '5px' }}>{p.brand}</span>}
                        <span style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline' }}>{p.name}</span>
                      </div>
                      {/* Price */}
                      <span style={{ fontSize: '12px', fontWeight: 700, color: price ? '#1E3A5F' : 'var(--text-muted)', textAlign: 'right' }}>
                        {price ? `${Number(price).toFixed(2)} ₴` : '—'}
                      </span>
                      {/* Qty controls */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }} onClick={e => e.stopPropagation()}>
                        {isSelected ? (
                          <>
                            <button
                              onClick={() => setQty(p.sku, sel!.qty - 1)}
                              style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Minus size={10} />
                            </button>
                            <input
                              type="number"
                              value={sel!.qty}
                              min={1}
                              onChange={e => setQty(p.sku, parseInt(e.target.value) || 1)}
                              style={{ width: '38px', textAlign: 'center', border: '1.5px solid #4880B8', borderRadius: '5px', fontSize: '12px', fontWeight: 700, padding: '2px 0', color: '#1E3A5F', background: '#EFF4FF', outline: 'none' }}
                            />
                            <button
                              onClick={() => setQty(p.sku, sel!.qty + 1)}
                              style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Plus size={10} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => toggleSelection(p)}
                            style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <Plus size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg-soft)' }}>
          <div style={{ fontSize: '13px' }}>
            {selectedCount > 0 ? (
              <span style={{ color: '#15803D', fontWeight: 700 }}>
                ✓ Вибрано: {selectedCount} позиц{selectedCount === 1 ? 'ія' : selectedCount < 5 ? 'ії' : 'ій'}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>Оберіть товари для додавання</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Скасувати
            </button>
            <button
              onClick={handleAdd}
              disabled={selectedCount === 0}
              style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: selectedCount > 0 ? '#1E3A5F' : '#CBD5E1', color: '#fff', cursor: selectedCount > 0 ? 'pointer' : 'default', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Package size={14} />
              Додати в замовлення{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
