'use client';

import { CreditCard } from 'lucide-react';
import type { OrderItem, Order } from './types';

/**
 * Оплата дропшип-замовлення: партнер заплатив закупку з балансу в кабінеті, наложку
 * клієнта (якщо є) ми збираємо для партнера й зараховуємо йому після вручення.
 */
export function DropshipPaymentInfo({ order }: { order: Order }) {
  const cost = order.items.reduce((s, i) => s + Number((i as OrderItem & { cost_price?: number }).cost_price ?? 0) * Number(i.qty), 0);
  const paid = Number(order.amount_paid ?? 0) || cost;
  const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isCod = order.payment_type === 'cod';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
        <CreditCard size={12} /> ✓ Оплачено з балансу партнера {fmt(paid)} ₴
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        {isCod
          ? <>Наложка клієнта <b style={{ color: 'var(--text-secondary)' }}>{fmt(Number(order.total_price))} ₴</b> — у ТТН; після вручення зараховується на баланс партнера мінус 0,5 % НоваПей.</>
          : <>Клієнт розрахувався з партнером — ТТН без накладеного платежу.</>}
        {' '}Платник доставки — одержувач.
      </div>
    </div>
  );
}
