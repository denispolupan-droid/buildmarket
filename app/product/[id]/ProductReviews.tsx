'use client';

import { useState, useEffect, useCallback } from 'react';

type Review = {
  id: string;
  author_name: string;
  rating: number;
  review_text: string | null;
  created_at: string;
};

function Stars({ rating, size = 16, interactive = false, onRate }: {
  rating: number; size?: number; interactive?: boolean; onRate?: (r: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <span style={{ display: 'inline-flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          onClick={() => interactive && onRate?.(i)}
          onMouseEnter={() => interactive && setHover(i)}
          onMouseLeave={() => interactive && setHover(0)}
          style={{
            fontSize: `${size}px`, lineHeight: 1,
            cursor: interactive ? 'pointer' : 'default',
            color: (hover || rating) >= i ? '#F59E0B' : '#D1D5DB',
            transition: 'color 0.1s',
          }}
        >★</span>
      ))}
    </span>
  );
}

export default function ProductReviews({ sku, productName }: { sku: string; productName: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews?sku=${sku}`);
      if (res.ok) setReviews(await res.json());
    } finally {
      setLoading(false);
    }
  }, [sku]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Вкажіть ваше ім\'я'); return; }
    if (!rating) { setError('Виберіть оцінку'); return; }

    setSending(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, author_name: name, rating, review_text: text }),
      });
      if (res.ok) {
        setSubmitted(true);
        setShowForm(false);
        setName(''); setRating(0); setText('');
      } else {
        const d = await res.json();
        setError(d.error ?? 'Помилка');
      }
    } finally {
      setSending(false);
    }
  }

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div style={{ marginTop: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Відгуки
          </h2>
          {reviews.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Stars rating={Math.round(avg)} size={15} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {avg.toFixed(1)}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                ({reviews.length})
              </span>
            </div>
          )}
        </div>
        {!submitted && (
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              height: '36px', padding: '0 16px', borderRadius: '8px',
              background: showForm ? 'var(--bg-soft)' : '#4880B8',
              color: showForm ? 'var(--text-secondary)' : '#fff',
              border: '1px solid var(--border)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showForm ? 'Скасувати' : '+ Залишити відгук'}
          </button>
        )}
      </div>

      {submitted && (
        <div style={{ padding: '16px 20px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', marginBottom: '20px', fontSize: '14px', color: '#16A34A' }}>
          Дякуємо за відгук! Він з'явиться після перевірки.
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>
            Ваш відгук про «{productName}»
          </p>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Оцінка *
            </label>
            <Stars rating={rating} size={28} interactive onRate={setRating} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Ваше ім'я *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Іван"
              maxLength={80}
              style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: 'var(--bg-soft)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Коментар (необов'язково)
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Розкажіть про ваш досвід використання..."
              maxLength={2000}
              rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', background: 'var(--bg-soft)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <p style={{ fontSize: '13px', color: '#DC2626', margin: '0 0 12px' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={sending}
            style={{ height: '40px', padding: '0 24px', borderRadius: '8px', background: '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700, border: 'none', cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1 }}
          >
            {sending ? 'Надсилаємо...' : 'Надіслати відгук'}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Завантаження...</p>
      ) : reviews.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          Відгуків ще немає. Будьте першим!
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reviews.map(r => (
            <div key={r.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#4880B8', flexShrink: 0 }}>
                  {r.author_name[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.author_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Stars rating={r.rating} size={13} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(r.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
              {r.review_text && (
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                  {r.review_text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
