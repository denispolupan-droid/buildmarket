'use client';

import { useState } from 'react';
import { Copy, ExternalLink, CheckCircle, Save, RefreshCw } from 'lucide-react';

interface Category {
  id: number;
  slug: string;
  name: string;
  parent_slug: string | null;
  rozetka_category_id: string | null;
}

interface Props {
  feedUrl: string;
  hasApiKey: boolean;
  categories: Category[];
  totalProducts: number;
  productsWithPrice: number;
}

export default function RozetkaClient({ feedUrl, hasApiKey, categories, totalProducts, productsWithPrice }: Props) {
  const [copied, setCopied]       = useState(false);
  const [catIds, setCatIds]       = useState<Record<string, string>>(
    Object.fromEntries(categories.map(c => [c.slug, c.rozetka_category_id ?? '']))
  );
  const [saving, setSaving]       = useState<string | null>(null);
  const [saved,  setSaved]        = useState<Record<string, boolean>>({});
  const [checking, setChecking]   = useState(false);
  const [feedOk,   setFeedOk]     = useState<boolean | null>(null);

  function copyFeed() {
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function saveCat(slug: string) {
    setSaving(slug);
    try {
      await fetch('/api/admin/rozetka/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, rozetka_category_id: catIds[slug] || null }),
      });
      setSaved(p => ({ ...p, [slug]: true }));
      setTimeout(() => setSaved(p => ({ ...p, [slug]: false })), 2000);
    } finally {
      setSaving(null);
    }
  }

  async function checkFeed() {
    setChecking(true);
    setFeedOk(null);
    try {
      const res = await fetch(feedUrl);
      setFeedOk(res.ok && res.headers.get('content-type')?.includes('xml') === true);
    } catch {
      setFeedOk(false);
    } finally {
      setChecking(false);
    }
  }

  const filledCount = categories.filter(c => catIds[c.slug]).length;
  const roots = categories.filter(c => !c.parent_slug);
  const byParent = (slug: string) => categories.filter(c => c.parent_slug === slug);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: '0 0 24px' }}>Rozetka</h1>

      {/* ── Status cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'API токен',          value: hasApiKey ? 'Налаштовано' : 'Відсутній', ok: hasApiKey },
          { label: 'Товарів активних',   value: totalProducts, ok: totalProducts > 0 },
          { label: 'З ціною у фіді',     value: productsWithPrice, ok: productsWithPrice > 0 },
          { label: 'Категорій прив\'язано', value: `${filledCount} / ${categories.length}`, ok: filledCount > 0 },
        ].map(({ label, value, ok }) => (
          <div key={label} style={{
            background: '#fff', borderRadius: 10, padding: '14px 16px',
            border: `1.5px solid ${ok ? '#D1FAE5' : '#FEE2E2'}`,
          }}>
            <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: ok ? '#059669' : '#DC2626' }}>{String(value)}</div>
          </div>
        ))}
      </div>

      {/* ── Feed URL ── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>YML-фід для Rozetka</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={checkFeed} disabled={checking} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 7,
              fontSize: 12, color: '#475569', cursor: 'pointer',
            }}>
              <RefreshCw size={12} style={checking ? { animation: 'spin 1s linear infinite' } : {}} />
              Перевірити
            </button>
            <a href={feedUrl} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 7,
              fontSize: 12, color: '#475569', textDecoration: 'none',
            }}>
              <ExternalLink size={12} /> Відкрити
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            flex: 1, fontFamily: 'monospace', fontSize: 13, padding: '10px 14px',
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
            color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {feedUrl}
          </div>
          <button onClick={copyFeed} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
            background: copied ? '#ECFDF5' : '#0EA5E9', color: copied ? '#059669' : '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Скопійовано' : 'Копіювати'}
          </button>
        </div>

        {feedOk !== null && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12,
            background: feedOk ? '#ECFDF5' : '#FEF2F2',
            color: feedOk ? '#059669' : '#DC2626',
          }}>
            {feedOk ? '✓ Фід доступний і повертає валідний XML' : '✗ Фід недоступний або повертає помилку'}
          </div>
        )}

        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FFF7ED', borderRadius: 8, border: '1px solid #FED7AA', fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
          Вкажи цю URL в кабінеті Rozetka: <b>Управління товарами → Завантаження прайс-листа → XML/YML</b>.<br/>
          Після активації кабінету Rozetka зроблять перший імпорт автоматично.
        </div>
      </div>

      {/* ── Category mapping ── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Прив&apos;язка категорій</h2>
          <span style={{ fontSize: 12, color: '#64748B' }}>{filledCount} / {categories.length} заповнено</span>
        </div>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 16px', lineHeight: 1.6 }}>
          <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 4 }}>rz_id</code> — ідентифікатор категорії на сайті Rozetka (наприклад <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 4 }}>32635505</code>).<br/>
          Знайти ID: кабінет Rozetka → <b>Управління товарами → Довідники → Категорії</b> (Excel-файл з ID).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {roots.map(root => (
            <div key={root.slug}>
              {/* Root category */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 200px 80px',
                gap: 8, alignItems: 'center', padding: '6px 8px',
                background: '#F8FAFC', borderRadius: 6, marginBottom: 2,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{root.name}</div>
                <input
                  value={catIds[root.slug] ?? ''}
                  onChange={e => setCatIds(p => ({ ...p, [root.slug]: e.target.value }))}
                  placeholder="rz_id"
                  style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0',
                    fontSize: 13, width: '100%', boxSizing: 'border-box',
                    background: catIds[root.slug] ? '#ECFDF5' : '#fff',
                  }}
                />
                <button
                  onClick={() => saveCat(root.slug)}
                  disabled={saving === root.slug}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    padding: '5px 10px', borderRadius: 6, fontSize: 12,
                    background: saved[root.slug] ? '#ECFDF5' : '#0EA5E9',
                    color: saved[root.slug] ? '#059669' : '#fff',
                    border: 'none', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  {saved[root.slug] ? <CheckCircle size={12} /> : <Save size={12} />}
                  {saved[root.slug] ? 'OK' : 'Зберегти'}
                </button>
              </div>

              {/* Subcategories */}
              {byParent(root.slug).map(child => (
                <div key={child.slug} style={{
                  display: 'grid', gridTemplateColumns: '1fr 200px 80px',
                  gap: 8, alignItems: 'center', padding: '5px 8px 5px 24px',
                  borderBottom: '1px solid #F1F5F9',
                }}>
                  <div style={{ fontSize: 13, color: '#475569' }}>{child.name}</div>
                  <input
                    value={catIds[child.slug] ?? ''}
                    onChange={e => setCatIds(p => ({ ...p, [child.slug]: e.target.value }))}
                    placeholder="rz_id"
                    style={{
                      padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0',
                      fontSize: 13, width: '100%', boxSizing: 'border-box',
                      background: catIds[child.slug] ? '#ECFDF5' : '#fff',
                    }}
                  />
                  <button
                    onClick={() => saveCat(child.slug)}
                    disabled={saving === child.slug}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 6, fontSize: 12,
                      background: saved[child.slug] ? '#ECFDF5' : '#F1F5F9',
                      color: saved[child.slug] ? '#059669' : '#475569',
                      border: '1px solid #E2E8F0', cursor: 'pointer',
                    }}
                  >
                    {saved[child.slug] ? <CheckCircle size={12} /> : <Save size={12} />}
                    {saved[child.slug] ? 'OK' : 'Зберегти'}
                  </button>
                </div>
              ))}

              {/* Level-3 categories (grandchildren) */}
              {byParent(root.slug).flatMap(child =>
                byParent(child.slug).map(grand => (
                  <div key={grand.slug} style={{
                    display: 'grid', gridTemplateColumns: '1fr 200px 80px',
                    gap: 8, alignItems: 'center', padding: '5px 8px 5px 44px',
                    borderBottom: '1px solid #F1F5F9',
                  }}>
                    <div style={{ fontSize: 12, color: '#64748B' }}>{grand.name}</div>
                    <input
                      value={catIds[grand.slug] ?? ''}
                      onChange={e => setCatIds(p => ({ ...p, [grand.slug]: e.target.value }))}
                      placeholder="rz_id"
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: '1px solid #E2E8F0',
                        fontSize: 12, width: '100%', boxSizing: 'border-box',
                        background: catIds[grand.slug] ? '#ECFDF5' : '#fff',
                      }}
                    />
                    <button
                      onClick={() => saveCat(grand.slug)}
                      disabled={saving === grand.slug}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        padding: '4px 8px', borderRadius: 6, fontSize: 11,
                        background: saved[grand.slug] ? '#ECFDF5' : '#F1F5F9',
                        color: saved[grand.slug] ? '#059669' : '#475569',
                        border: '1px solid #E2E8F0', cursor: 'pointer',
                      }}
                    >
                      {saved[grand.slug] ? <CheckCircle size={11} /> : <Save size={11} />}
                      {saved[grand.slug] ? 'OK' : 'Зберегти'}
                    </button>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
