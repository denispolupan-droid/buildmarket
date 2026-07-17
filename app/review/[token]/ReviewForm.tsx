'use client';

import { useState } from 'react';

type Item = { sku: string; name: string; alreadyReviewed: boolean };

export default function ReviewForm({ token, authorDefault, items }: {
  token: string;
  authorDefault: string;
  items: Item[];
}) {
  const [author, setAuthor] = useState(authorDefault);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Set<string>>(new Set(items.filter(i => i.alreadyReviewed).map(i => i.sku)));
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function submit(sku: string) {
    if (!ratings[sku]) { setError('Поставте оцінку (зірочки)'); return; }
    if (!author.trim()) { setError("Вкажіть ім'я"); return; }
    setError('');
    setSending(sku);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          author_name: author.trim(),
          rating: ratings[sku],
          review_text: texts[sku]?.trim() || null,
          review_token: token,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка');
      setSubmitted(prev => new Set(prev).add(sku));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(null);
    }
  }

  const allDone = items.every(i => submitted.has(i.sku));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
          Ваше ім&apos;я
        </label>
        <input
          value={author}
          onChange={e => setAuthor(e.target.value)}
          maxLength={80}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--bg-card)', color: 'var(--text-primary)' }}
        />
      </div>

      {items.map(item => (
        <div key={item.sku} style={{ padding: '16px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 10px' }}>{item.name}</p>
          {submitted.has(item.sku) ? (
            <p style={{ fontSize: 13, color: '#10B981', margin: 0 }}>✓ Дякуємо! Відгук з&apos;явиться після модерації.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setRatings(prev => ({ ...prev, [item.sku]: star }))}
                    aria-label={`Оцінка ${star}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, lineHeight: 1, padding: 0, color: (ratings[item.sku] ?? 0) >= star ? '#F59E0B' : '#CBD5E1' }}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                placeholder="Кілька слів про товар (необов'язково)"
                value={texts[item.sku] ?? ''}
                onChange={e => setTexts(prev => ({ ...prev, [item.sku]: e.target.value }))}
                maxLength={2000}
                rows={3}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, resize: 'vertical', background: 'var(--bg-page)', color: 'var(--text-primary)', marginBottom: 10 }}
              />
              <button
                onClick={() => submit(item.sku)}
                disabled={sending === item.sku}
                style={{ padding: '10px 24px', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: sending === item.sku ? 0.6 : 1 }}
              >
                {sending === item.sku ? 'Надсилаємо…' : 'Надіслати відгук'}
              </button>
            </>
          )}
        </div>
      ))}

      {error && <p style={{ color: '#EF4444', fontSize: 13, margin: 0 }}>{error}</p>}
      {allDone && (
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Усі відгуки надіслано — дякуємо! <a href="/shop" style={{ color: 'var(--brand-main)' }}>Повернутися до магазину</a>
        </p>
      )}
    </div>
  );
}
