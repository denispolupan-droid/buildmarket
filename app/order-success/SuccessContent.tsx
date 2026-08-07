'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, ShoppingBag } from 'lucide-react';
import { useCart } from '../../lib/cart';

export default function SuccessContent() {
  const params      = useSearchParams();
  const orderNum    = params.get('num');
  const isPaid      = params.get('paid') === '1';
  const short       = orderNum ? `#${orderNum}` : '—';
  // За замовчуванням — публічний магазин. Було навпаки: усе, крім явного
  // ?from=shop, вело на /catalog, а це оптовий каталог під авторизацією — тож
  // роздрібний покупець після оплати карткою (redirectUrl Monobank взагалі без
  // параметра from) потрапляв не в магазин, а на сторінку входу.
  const continuePath = params.get('from') === 'catalog' ? '/catalog' : '/shop';
  const { clearCart } = useCart();

  useEffect(() => {
    if (isPaid) clearCart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid]);

  return (
    <div style={{
      background: '#F8FAFC', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 16px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0',
        padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center',
      }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: '#DCFCE7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <CheckCircle size={36} color="#16A34A" strokeWidth={1.5} />
        </div>

        <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
          {isPaid ? 'Оплату підтверджено!' : 'Замовлення прийнято!'}
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: 1.6 }}>
          {isPaid && !orderNum
            ? 'Ваш платіж успішно прийнято. Деталі замовлення та підтвердження надіслано на ваш email.'
            : isPaid
              ? 'Ваш платіж успішно прийнято. Замовлення передано в обробку — ми повідомимо вас про відправку.'
              : 'Дякуємо за замовлення. Наш менеджер зв\'яжеться з вами найближчим часом для підтвердження.'}
        </p>

        {orderNum && (
          <div style={{
            background: '#F8FAFC', borderRadius: '12px', padding: '16px 20px',
            marginBottom: '32px', border: '1px solid #E2E8F0',
          }}>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>Номер замовлення</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#1E3A5F', letterSpacing: '0.05em' }}>
              {short}
            </div>
          </div>
        )}

        <Link href={continuePath} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          height: '46px', padding: '0 28px', borderRadius: '10px',
          background: '#1E3A5F', color: '#fff',
          fontSize: '14px', fontWeight: 700, textDecoration: 'none',
        }}>
          <ShoppingBag size={16} />Продовжити покупки
        </Link>
      </div>
    </div>
  );
}
