/**
 * Статуси замовлення для кабінету партнера — повний набір, як у журналі адмінки
 * (app/admin/AdminOrders.tsx STATUSES). Раніше кожна сторінка кабінету мала свою
 * мапу на 5 статусів, і «Очікуємо товар» / «Збирається» партнер бачив сирим кодом.
 */
export type CabinetStatusStyle = { label: string; color: string; bg: string };

export const CABINET_ORDER_STATUS: Record<string, CabinetStatusStyle> = {
  new:             { label: 'Нове',           color: '#1E3A5F', bg: '#EFF4FF' },
  pending_payment: { label: 'Очікує оплату',  color: '#64748B', bg: '#F1F5F9' },
  confirmed:       { label: 'Підтверджено',   color: '#15803D', bg: '#DCFCE7' },
  awaiting_stock:  { label: 'Очікуємо товар', color: '#7C3AED', bg: '#F5F3FF' },
  picking:         { label: 'Збирається',     color: '#0E7490', bg: '#ECFEFF' },
  shipped:         { label: 'Відправлено',    color: '#B45309', bg: '#FEF3C7' },
  delivered:       { label: 'Доставлено',     color: '#15803D', bg: '#DCFCE7' },
  cancelled:       { label: 'Скасовано',      color: '#DC2626', bg: '#FEE2E2' },
};

export function cabinetOrderStatus(status: string | null | undefined): CabinetStatusStyle {
  return CABINET_ORDER_STATUS[status ?? ''] ?? { label: 'В обробці', color: '#64748B', bg: '#F1F5F9' };
}

/** Підписи рухів балансу — одні на дашборд і сторінку «Баланс». */
export const PARTNER_TX_LABELS: Record<string, string> = {
  top_up:        'Поповнення',
  charge:        'Списання (замовлення)',
  cod_credit:    'Накладений платіж отримано',
  np_fee:        'Комісія НоваПей',
  return_refund: 'Повернення коштів',
  return_fee:    'Зворотна доставка',
  payout:        'Виплата',
  goods_offset:  'Товарний залік',
  adjustment:    'Коригування',
};
