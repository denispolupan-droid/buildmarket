'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, X, Trash2, ExternalLink } from 'lucide-react';

type Review = {
  id: string;
  product_sku: string;
  author_name: string;
  rating: number;
  review_text: string | null;
  is_approved: boolean;
  created_at: string;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: rating >= i ? '#F59E0B' : '#D1D5DB', fontSize: '14px' }}>★</span>
      ))}
    </span>
  );
}

export default function ReviewsModerationClient({ reviews: initial }: { reviews: Review[] }) {
  const [reviews, setReviews] = useState<Review[]>(initial);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('pending');
  const [loading, setLoading] = useState<string | null>(null);

  const filtered = reviews.filter(r =>
    filter === 'all' ? true :
    filter === 'pending' ? !r.is_approved :
    r.is_approved
  );

  const pendingCount = reviews.filter(r => !r.is_approved).length;

  async function approve(id: string, value: boolean) {
    setLoading(id);
    try {
      await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_approved: value }),
      });
      setReviews(prev => prev.map(r => r.id === id ? { ...r, is_approved: value } : r));
    } finally {
      setLoading(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Видалити відгук?')) return;
    setLoading(id);
    try {
      await fetch(`/api/admin/reviews?id=${id}`, { method: 'DELETE' });
      setReviews(prev => prev.filter(r => r.id !== id));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-soft)', padding: '32px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Відгуки
            </h1>
            {pendingCount > 0 && (
              <p style={{ fontSize: '13px', color: '#DC2626', margin: 0, fontWeight: 600 }}>
                {pendingCount} очікують модерації
              </p>
            )}
          </div>
          <Link href="/admin" style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            ← Адмінка
          </Link>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {(['pending', 'approved', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                height: '34px', padding: '0 16px', borderRadius: '8px', border: '1px solid var(--border)',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                background: filter === f ? '#0F172A' : '#fff',
                color: filter === f ? '#fff' : '#64748B',
              }}
            >
              {f === 'pending' ? `На модерації (${pendingCount})` : f === 'approved' ? 'Схвалені' : 'Всі'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
            {filter === 'pending' ? 'Нових відгуків немає' : 'Відгуків не знайдено'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map(r => (
              <div key={r.id} style={{
                background: 'var(--bg-card)', border: `1px solid ${r.is_approved ? '#E2E8F0' : '#FED7AA'}`,
                borderRadius: '12px', padding: '16px 20px',
                borderLeft: `4px solid ${r.is_approved ? '#22C55E' : '#F97316'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.author_name}</span>
                      <Stars rating={r.rating} />
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {new Date(r.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Товар:</span>
                      <Link href={`/product/${r.product_sku}`} target="_blank" style={{ fontSize: '12px', color: '#4880B8', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        {r.product_sku} <ExternalLink size={11} />
                      </Link>
                    </div>
                    {r.review_text && (
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                        {r.review_text}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {!r.is_approved ? (
                      <button
                        onClick={() => approve(r.id, true)}
                        disabled={loading === r.id}
                        title="Схвалити"
                        style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Check size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => approve(r.id, false)}
                        disabled={loading === r.id}
                        title="Зняти зі схвалення"
                        style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF9C3', border: '1px solid #FDE68A', color: '#CA8A04', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => remove(r.id)}
                      disabled={loading === r.id}
                      title="Видалити"
                      style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
