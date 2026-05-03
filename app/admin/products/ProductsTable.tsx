'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Edit, Package, AlertCircle } from 'lucide-react';
import type { ProductFull, Category } from '../../../types';

type Props = {
  products: ProductFull[];
  categories: Category[];
};

export default function ProductsTable({ products, categories }: Props) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { map[c.slug] = c.name; });
    return map;
  }, [categories]);

  const parentCats = useMemo(() => categories.filter(c => !c.parent_slug), [categories]);

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

    if (filterStatus === 'active') {
      list = list.filter(p => p.is_active);
    } else if (filterStatus === 'inactive') {
      list = list.filter(p => !p.is_active);
    } else if (filterStatus === 'no_price') {
      list = list.filter(p => !p.stock?.price_retail || p.stock.price_retail === 0);
    } else if (filterStatus === 'out_of_stock') {
      list = list.filter(p => (p.stock?.stock_qty ?? 0) < 1);
    }

    return list;
  }, [products, categories, search, filterCategory, filterStatus]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            placeholder="Пошук за назвою, SKU, брендом..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', height: '44px', paddingLeft: '42px', paddingRight: '16px',
              borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '14px',
              outline: 'none',
            }}
          />
        </div>

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          style={{
            height: '44px', padding: '0 16px', borderRadius: '10px',
            border: '1px solid #E2E8F0', fontSize: '14px', minWidth: '180px',
            background: filterCategory ? '#EFF6FF' : '#fff',
          }}
        >
          <option value="">Всі категорії</option>
          {parentCats.map(c => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{
            height: '44px', padding: '0 16px', borderRadius: '10px',
            border: '1px solid #E2E8F0', fontSize: '14px', minWidth: '160px',
            background: filterStatus ? '#EFF6FF' : '#fff',
          }}
        >
          <option value="">Всі статуси</option>
          <option value="active">Активні</option>
          <option value="inactive">Неактивні</option>
          <option value="no_price">Без ціни</option>
          <option value="out_of_stock">Немає в наявності</option>
        </select>
      </div>

      <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '12px' }}>
        Знайдено: {filtered.length} товарів
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>SKU</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Назва</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Бренд</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Категорія</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Опт</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Роздріб</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Залишок</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Статус</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#475569' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map(p => {
              const hasIssue = !p.stock?.price_retail || (p.stock?.stock_qty ?? 0) < 1;
              return (
                <tr key={p.sku} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#64748B' }}>
                    {p.sku}
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                    <div style={{ fontWeight: 500, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    {p.volume && <div style={{ fontSize: '12px', color: '#94A3B8' }}>{p.volume}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{p.brand}</td>
                  <td style={{ padding: '12px 16px', color: '#475569', fontSize: '13px' }}>
                    {categoryMap[p.category_slug ?? ''] ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#0F172A' }}>
                    {p.stock?.price_unit ? `${p.stock.price_unit} ₴` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#0F172A' }}>
                    {p.stock?.price_retail ? `${p.stock.price_retail} ₴` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: (p.stock?.stock_qty ?? 0) < 1 ? '#EF4444' : '#475569' }}>
                    {p.stock?.stock_qty ?? 0}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {hasIssue ? (
                      <AlertCircle size={16} color="#F59E0B" />
                    ) : p.is_active ? (
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E' }} />
                    ) : (
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#CBD5E1' }} />
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <Link
                      href={`/admin/products/${p.sku}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '36px', height: '36px', borderRadius: '8px',
                        border: '1px solid #E2E8F0', background: '#fff', color: '#475569',
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

        {filtered.length > 100 && (
          <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '13px', borderTop: '1px solid #E2E8F0' }}>
            Показано 100 з {filtered.length}. Використовуйте пошук для знаходження потрібного товару.
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
            <Package size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <div>Товарів не знайдено</div>
          </div>
        )}
      </div>
    </div>
  );
}
