import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Сторінку не знайдено',
  robots: { index: false, follow: false },
  // Кореневий layout задає canonical на головну, і 404 успадковувала його —
  // сторінка помилки оголошувала себе копією головної. Явний null прибирає тег:
  // при коректному 404 канонічної адреси в неї просто немає.
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <div style={{
      minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-page)',
    }}>
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '72px', fontWeight: 800, color: 'var(--border)', lineHeight: 1 }}>404</div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 8px' }}>
          Сторінку не знайдено
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
          Можливо, товар було видалено або URL введено некоректно
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/catalog" style={{
            height: '44px', padding: '0 24px', borderRadius: '10px',
            background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center',
          }}>
            До каталогу
          </Link>
          <Link href="/" style={{
            height: '44px', padding: '0 24px', borderRadius: '10px',
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center',
          }}>
            На головну
          </Link>
        </div>
      </div>
    </div>
  );
}
