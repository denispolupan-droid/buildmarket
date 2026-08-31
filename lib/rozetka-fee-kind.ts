/**
 * lib/rozetka-fee-kind.ts — що це за витрата площадки.
 *
 * Усі статті Rozetka лежать на одному рахунку marketplace_fee, і розрізняються
 * лише описом та meta. Модуль чистий і спільний навмисно: звірка в адмінці й
 * синк фактичних зборів МУСЯТЬ ділити позиції однаково. Коли кожен рахував
 * по-своєму, збір за видачу і Smart потрапляли в «комісію» й давали розбіжність
 * рівно на 18/30 ₴ там, де її не було.
 */
export type RozetkaFeeKind = 'commission' | 'smart' | 'pickup' | 'subscription';

export function rozetkaFeeKind(f: {
  doc_type?: string | null;
  description?: string | null;
  meta?: unknown;
}): RozetkaFeeKind {
  const d = String(f.description ?? '');
  if (f.doc_type === 'subscription_fee' || /абонплат/i.test(d)) return 'subscription';
  if (/організація видачі/i.test(d)) return 'pickup';
  if ((f.meta as Record<string, unknown> | null)?.smart || /Smart/i.test(d)) return 'smart';
  return 'commission';
}

/**
 * Типи операцій ОСНОВНОГО балансу (/balances/search), які реально рухають гроші
 * по замовленню. Звірено живою випискою 2026-07/08.
 *
 * Списання: 2 комісія за продаж, 7 коректування замовлення, 13 автокоректування,
 * 15 коректування роялті. Повернення: 14 повернення замовлення.
 *
 * УВАГА: 1 «резерв», 8 «правка кількості», 10 «резерв доданого товару» — це сіра
 * зона: гроші заморожені, але ще не списані. Включення 8 у списання задвоювало
 * «їхню» суму (перевірено на замовленні 900675333, звірка 28.07.2026).
 */
export const RZ_CHARGE_OPS = [2, 7, 13, 15] as const;
export const RZ_REFUND_OPS = [14] as const;

/** Комісія по замовленню за випискою: списання мінус повернення. */
export function rozetkaActualCommission(
  txns: { operationType: number; orderId: number | null; debit: string | number | null; credit: string | number | null }[],
): Map<number, number> {
  const num = (v: unknown) => Number(String(v ?? '0').replace(',', '.')) || 0;
  const out = new Map<number, number>();
  for (const t of txns) {
    if (!t.orderId) continue;
    let signed = 0;
    if ((RZ_CHARGE_OPS as readonly number[]).includes(t.operationType)) signed = num(t.debit);
    else if ((RZ_REFUND_OPS as readonly number[]).includes(t.operationType)) signed = -num(t.credit);
    else continue;
    if (!signed) continue;
    out.set(t.orderId, Math.round(((out.get(t.orderId) ?? 0) + signed) * 100) / 100);
  }
  return out;
}
