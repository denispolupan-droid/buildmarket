'use client';

import type { CSSProperties } from 'react';

/**
 * «Ви увійшли як оптовий клієнт» — коли оптовик додає товар у роздрібному
 * інтерфейсі. Роздрібна ціна в кошику для нього була б неправильною, тож
 * замість додавання ведемо на ЦЕЙ САМИЙ товар в оптовому каталозі.
 *
 * Спільний компонент: та сама модалка потрібна в магазині, на сторінці товару
 * і в превʼю категорій на головній — три копії розʼїхалися б.
 */
type Props = {
  /** Артикул товару, на якому зупинили оптовика */
  sku: string;
  lang: 'uk' | 'ru';
  onClose: () => void;
};

export default function WholesaleNoticeModal({ sku, lang, onClose }: Props) {
  const t = (uk: string, ru: string) => (lang === 'ru' ? ru : uk);
  const prefix = lang === 'ru' ? '/ru' : '';

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={dialog}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏢</div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '10px' }}>
          {t('Ви увійшли як оптовий клієнт', 'Вы вошли как оптовый клиент')}
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>
          {t('У магазині вказані роздрібні ціни. Для замовлення за вашими цінами перейдіть до оптового каталогу.',
             'В магазине указаны розничные цены. Для заказа по вашим ценам перейдите в оптовый каталог.')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* ?q=SKU — каталог відфільтрує рівно цей товар, а не голий список */}
          <a href={`${prefix}/catalog?q=${encodeURIComponent(sku)}`} style={primaryBtn}>
            {t('Відкрити цей товар в оптовому каталозі →', 'Открыть этот товар в оптовом каталоге →')}
          </a>
          <button onClick={onClose} style={ghostBtn}>
            {t('Залишитись і переглянути магазин', 'Остаться и просматривать магазин')}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.5)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: '24px',
};

const dialog: CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '16px',
  padding: '36px 32px', maxWidth: '420px', width: '100%',
  textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};

const primaryBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: '44px', borderRadius: '10px', background: '#1E3A5F', color: '#fff',
  fontSize: '14px', fontWeight: 700, textDecoration: 'none',
};

const ghostBtn: CSSProperties = {
  height: '40px', borderRadius: '10px', border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-secondary)',
  fontSize: '13px', cursor: 'pointer',
};
