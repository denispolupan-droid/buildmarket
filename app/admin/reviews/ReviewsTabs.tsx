'use client';

import { useState } from 'react';
import { Star, Store } from 'lucide-react';
import ReviewsModerationClient, { type Review } from './ReviewsModerationClient';
import RozetkaReviewsClient from './RozetkaReviewsClient';

// Обʼєднаний розділ «Відгуки»: вкладка «Сайт» — модерація відгуків нашого
// магазину, вкладка «Rozetka» — живі відгуки з кабінету (той самий стиль
// вкладок, що в «Чатах»).

export default function ReviewsTabs({ reviews, initialTab }: { reviews: Review[]; initialTab: 'site' | 'rozetka' }) {
  const [tab, setTab] = useState<'site' | 'rozetka'>(initialTab);
  const pendingCount = reviews.filter(r => !r.is_approved).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '24px 24px 0' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Відгуки</h1>
        <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
          {([
            ['site', 'Сайт', Star, pendingCount, '#1E3A5F', '#EBF1F8'],
            ['rozetka', 'Rozetka', Store, 0, '#6366F1', '#EEF2FF'],
          ] as const).map(([key, label, Icon, badge, accent, tint]) => {
            const active = tab === key;
            return (
              <button key={key} onClick={() => setTab(key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px', height: '40px', padding: '0 18px',
                  borderRadius: '10px 10px 0 0',
                  border: '1px solid var(--border)',
                  borderTop: `3px solid ${active ? accent : 'var(--border)'}`,
                  borderBottom: active ? '1px solid var(--bg-card)' : '1px solid var(--border)',
                  marginBottom: '-1px', position: 'relative', zIndex: active ? 2 : 1,
                  background: active ? 'var(--bg-card)' : tint,
                  color: active ? accent : 'var(--text-secondary)',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                }}>
                <Icon size={14} color={accent} /> {label}
                {badge > 0 && (
                  <span style={{ background: '#EF4444', color: '#fff', fontSize: '10px', fontWeight: 700, borderRadius: '9px', padding: '1px 6px' }}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{
        flex: 1, minHeight: 0, margin: '0 24px 24px', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '0 12px 12px 12px', overflow: 'hidden',
      }}>
        {tab === 'rozetka'
          ? <RozetkaReviewsClient />
          : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <ReviewsModerationClient reviews={reviews} embedded />
            </div>
          )}
      </div>
    </div>
  );
}
