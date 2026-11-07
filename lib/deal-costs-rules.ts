/**
 * Чисті правила розбивки проведених без замовлення витрат угоди по замовленнях
 * (таблиця order_deal_costs, міграція 158). Без БД — під тести; запис і читання —
 * lib/deal-costs.
 *
 * Леджер не змінюється: тут лише вирішується, яка частина ВЖЕ проведеної суми
 * припадає на яке замовлення. Головний інваріант — розбивка однієї виплати
 * ніколи не більша за проведену суму (решта лишається «без замовлення»).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export type FeeRow = { orderId: string; fee: number; gross: number; marketplaceOrderId: string; kind: 'payment' | 'refund' };
export type FeeAllocation = { orderId: string; amount: number; meta: { rows: { id: string; gross: number; fee: number }[] } };

/**
 * Точна комісія з реєстру RozetkaPay: Σ «Сума комісії з отримувача» по рядках
 * кожного замовлення. При поверненні RozetkaPay ПОВЕРТАЄ і комісію: у рядку
 * повернення нетто = −(сума − комісія) (реєстр 02.09.2026: платіж 8 680 / комісія
 * 130,20 і повернення −8 680 / −8 549,80; Σ комісій 428,19 − 2 × 130,20 = 167,79 =
 * проведеній винагороді). Тож комісія рядка повернення віднімається. Якщо платіж
 * був у попередньому переказі, у цьому переказі замовлення отримує від'ємну
 * частку — по замовленню в сумі виходить нуль.
 */
export function allocateRegisterFees(rows: FeeRow[]): FeeAllocation[] {
  const by = new Map<string, FeeAllocation>();
  for (const r of rows) {
    if (!(Math.abs(r.fee) > 0)) continue;
    const fee = r.kind === 'refund' ? -Math.abs(r.fee) : Math.abs(r.fee);
    const a = by.get(r.orderId) ?? { orderId: r.orderId, amount: 0, meta: { rows: [] } };
    a.amount = r2(a.amount + fee);
    a.meta.rows.push({ id: r.marketplaceOrderId, gross: r2(r.gross), fee: r2(fee) });
    by.set(r.orderId, a);
  }
  return [...by.values()].filter(a => Math.abs(a.amount) >= 0.005);
}

/**
 * Пропорційно вагам (сумам замовлень у виплаті) — для ранніх виплат без реєстру.
 * Копійки округлення віддаються найбільшій частці, тож Σ = total рівно.
 */
export function allocateProportional(total: number, parts: { orderId: string; weight: number }[]): FeeAllocation[] {
  const valid = parts.filter(p => p.weight > 0);
  const sumW = valid.reduce((s, p) => s + p.weight, 0);
  if (!(total > 0) || !(sumW > 0)) return [];
  const out = valid.map(p => ({ orderId: p.orderId, amount: r2(total * p.weight / sumW), meta: { rows: [{ id: '', gross: r2(p.weight), fee: 0 }] } }));
  const diff = r2(total - out.reduce((s, a) => s + a.amount, 0));
  if (Math.abs(diff) >= 0.01) {
    const biggest = out.reduce((m, a) => (a.amount > m.amount ? a : m), out[0]);
    biggest.amount = r2(biggest.amount + diff);
  }
  for (const a of out) a.meta.rows[0].fee = a.amount;
  return out.filter(a => a.amount > 0);
}

/**
 * Обмеження проведеною сумою. Розбивка з реєстру зазвичай дорівнює комісії у
 * виписці; якщо раптом більша — сума проведеної комісії ділиться пропорційно
 * реєстровим комісіям (розбивка не може «створити» витрату, якої немає в леджері).
 */
export function capToLedger(allocs: FeeAllocation[], ledgerAmount: number): { allocs: FeeAllocation[]; capped: boolean } {
  const sum = r2(allocs.reduce((s, a) => s + a.amount, 0));
  if (sum <= r2(ledgerAmount) + 0.005) return { allocs, capped: false };
  // Аварійний шлях (реєстр не зійшовся з випискою): ділимо проведену суму між
  // замовленнями з додатною часткою, від'ємні (повернення) відкидаємо
  const scaled = allocateProportional(ledgerAmount, allocs.filter(a => a.amount > 0).map(a => ({ orderId: a.orderId, weight: a.amount })));
  const metaBy = new Map(allocs.map(a => [a.orderId, a.meta]));
  return { allocs: scaled.map(a => ({ ...a, meta: metaBy.get(a.orderId) ?? a.meta })), capped: true };
}

/**
 * Середня фактична ставка RozetkaPay (Σ винагород / Σ брутто виплат) — для
 * прогнозу по ще не виплачених замовленнях. null — замало даних.
 */
export function rzPayRate(payouts: { fee: number; gross: number }[]): number | null {
  const gross = payouts.reduce((s, p) => s + (p.gross > 0 ? p.gross : 0), 0);
  const fee = payouts.reduce((s, p) => s + (p.fee > 0 ? p.fee : 0), 0);
  if (gross < 1000) return null;
  return Math.round(fee / gross * 100000) / 100000;
}
