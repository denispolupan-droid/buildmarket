/**
 * Сторож невиплаченої наложки НоваПей.
 *
 * Що було не так: крон порівнював ДВА ВІКНА РІЗНОЇ ДОВЖИНИ — «скільки наложок
 * вручено за 4 дні» проти «скільки виплат у виписці за 2 дні». Поки остання
 * НП-наложка старша за два дні, але молодша за чотири, умова «вручення є,
 * виплат нема» виконувалась щогодини: 15–17.10.2026 прилетіло 13 однакових
 * листів, хоча гроші за обома замовленнями прийшли день у день (#26101067 →
 * 4 676,50 ₴ 14.10, #26101081 → 312,43 ₴ 17.10). Паузи у виписці нормальні:
 * у ті дні НП-наложок просто не вручали, вручення йшли Rozetka Доставкою,
 * а її гроші приходять через RozetkaPay.
 *
 * Як правильно: питати не «чи були виплати взагалі», а «чи є вручена наложка,
 * гроші за якою ще не дійшли». Відповідь уже лежить у леджері: при врученні
 * сума падає на рахунок клієнта з контрагентом `np:cod`, а виплата за реєстром
 * її гасить. Ненульовий залишок після пільгового строку = гроші застрягли.
 * Той самий запит одразу називає замовлення — з ним можна йти у кабінет НП,
 * на відміну від «перевір виписку».
 */

export type NpCodOrder = {
  orderNumber: number;
  deliveredAt: string;   // ISO
  total: number;
  balance: number;       // залишок на np:cod, ₴: >0 — гроші ще не прийшли
};

/** НоваПей платить день у день або наступного дня; доба запасу — щоб не смикати на нормальну затримку. */
export const COD_GRACE_DAYS = 2;

/** Копійчані хвости від округлення комісії не вважаємо боргом. */
const EPSILON = 0.01;

export function unsettledNpCod(orders: NpCodOrder[], now: Date, graceDays = COD_GRACE_DAYS): NpCodOrder[] {
  const cutoff = now.getTime() - graceDays * 86400_000;
  return orders
    .filter(o => o.balance > EPSILON && new Date(o.deliveredAt).getTime() <= cutoff)
    .sort((a, b) => new Date(a.deliveredAt).getTime() - new Date(b.deliveredAt).getTime());
}

/**
 * Читає вручені НП-наложки за останні `days` і рахує залишок np:cod по кожній.
 * Вікно обмежене навмисно: сторож дивиться свіже, а стару заборгованість
 * розбирають руками на екрані «Гроші → НоваПей».
 */
export async function loadNpCodOrders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  days = 30,
): Promise<NpCodOrder[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, delivered_at, total_price')
    .eq('status', 'delivered')
    .eq('payment_type', 'cod')
    .in('delivery_type', ['nova', 'nova_poshta'])
    .gte('delivered_at', since)
    .order('id')
    .limit(500);
  const rows = (orders ?? []) as { id: string; order_number: number; delivered_at: string; total_price: number }[];
  if (!rows.length) return [];

  const { data: legs } = await db
    .from('money_entries')
    .select('order_id, amount')
    .eq('account_type', 'customer')
    .eq('counterparty_id', 'np:cod')
    .in('order_id', rows.map(r => r.id))
    .order('id')
    .limit(5000);

  const balance = new Map<string, number>();
  for (const l of (legs ?? []) as { order_id: string; amount: number }[]) {
    balance.set(l.order_id, (balance.get(l.order_id) ?? 0) + Number(l.amount));
  }
  return rows.map(r => ({
    orderNumber: r.order_number,
    deliveredAt: r.delivered_at,
    total: Number(r.total_price),
    balance: Math.round((balance.get(r.id) ?? 0) * 100) / 100,
  }));
}

export function formatUnsettledAlert(list: NpCodOrder[], now: Date): { title: string; body: string } {
  const total = list.reduce((s, o) => s + o.balance, 0);
  const days = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / 86400_000);
  const lines = list.map(o => `#${o.orderNumber} — ${o.balance.toFixed(2)} ₴, вручено ${days(o.deliveredAt)} дн. тому`);
  return {
    title: `НоваПей: наложка без виплати — ${list.length} шт. на ${total.toFixed(2)} ₴`,
    body: `${lines.join('\n')}\n\nГроші за цими ЕН не дійшли на рахунок. Перевір реєстри в кабінеті НоваПей; якщо виплата була, вона не розпізналась — дивись «Гроші → НоваПей».`,
  };
}
