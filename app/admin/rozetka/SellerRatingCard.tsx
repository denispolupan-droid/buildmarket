import { Star, PhoneCall, Truck, ThumbsUp } from 'lucide-react';
import type { RozetkaSellerRating } from '../../../lib/rozetka-api';

// Плашка «Рейтинг продавця» на сторінці Rozetka — живі дані /markets/seller-rating.
// Server-компонент: рендериться разом зі сторінкою, без клієнтського фетчу.

function fmtMinutes(min: number): string {
  if (!min || min <= 0) return '—';
  if (min < 60) return `${Math.round(min)} хв`;
  if (min < 1440) return `${(min / 60).toFixed(1)} год`;
  return `${(min / 1440).toFixed(1)} дн`;
}

function StarsRow({ value }: { value: number }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ color: value >= i - 0.25 ? '#F59E0B' : '#E2E8F0', fontSize: 15 }}>★</span>
      ))}
    </span>
  );
}

export default function SellerRatingCard({ rating }: { rating: RozetkaSellerRating | null }) {
  if (!rating) return null;

  const cats: Array<[string, { '30_days': number; all: number }]> = [
    ['Менеджер', rating.manager_avg_stars],
    ['Зручність', rating.convenience_avg_stars],
    ['Доставка', rating.delivery_avg_stars],
  ];

  return (
    <div style={{ padding: '0 32px 48px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid var(--border)', padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <Star size={16} color="#F59E0B" />
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Рейтинг продавця</span>
          <StarsRow value={rating.stars} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {rating.mark_all_cnt > 0 ? `${rating.stars.toFixed(1)} · ${rating.mark_all_cnt} оцінок` : 'оцінок ще немає'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {cats.map(([label, v]) => (
            <div key={label} style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {v['30_days'] > 0 ? `${v['30_days'].toFixed(1)} ★` : '—'}
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>
                  30 дн{v.all > 0 ? ` · весь час ${v.all.toFixed(1)}` : ''}
                </span>
              </div>
            </div>
          ))}
          <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
              <PhoneCall size={11} /> Швидкість дзвінка
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtMinutes(rating.avg_diff_order_call)}</div>
          </div>
          <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
              <Truck size={11} /> До відправки
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtMinutes(rating.avg_diff_delivery_time)}</div>
          </div>
          <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
              <ThumbsUp size={11} /> Лишають відгук
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {rating.user_feedback_perc > 0 ? `${rating.user_feedback_perc}%` : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
