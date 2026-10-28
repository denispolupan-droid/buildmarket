import { createServiceClient } from '../supabase';
import { getMarketplaceBalance } from '../accounting/money';
import { getRozetkaBalanceTotal, getRozetkaBalanceTxns, getRozetkaLogisticOps } from '../rozetka-api';
import { isRozetkaPickupOp, isRozetkaLogisticAdj, isRozetkaReturnDeliveryOp } from '../rozetka-delivery-tariff';
import { rozetkaFeeKind } from '../rozetka-fee-kind';

// Звірка з кабінетом Rozetka (винесено з роуту rozetka-reconcile 28.10.2026 без змін
// поведінки — щоб нею користувались і екран «Маркетплейси», і тижневий агент звірки).
// Побудкова звірка з кабінетом Rozetka: тягнемо живий леджер балансу продавця
// (/balances/search) і зіставляємо їхні списання комісій по замовленнях із нашими
// проводками marketplace_fee. Нічого не пишемо в БД — тільки порівняння; проведення
// різниці робиться вручну через існуючу «Операцію» (route /adjust).

// Типи операцій Rozetka, що РЕАЛЬНО списують гроші по замовленню (поле debit):
// 2 комісія за продаж, 7 коректування замовлення, 13 автокоректування,
// 15 коректування роялті по замовленню.
// УВАГА: 8 «правка кількості» — це ДОРЕЗЕРВ (сіра зона росте, гроші не списуються;
// комісія при доставці приходить уже за фінальним складом) — підтверджено звіркою
// 2026-07-28 по замовленню 900675333: включення op 8 сюди задвоювало «їхню» суму.
const CHARGE_OPS = new Set([2, 7, 13, 15]);
// Повернення комісії (поле credit): 14 повернення замовлення.
const REFUND_OPS = new Set([14]);
// Резерви «сірої зони» — грошей не рухають, у звірці комісій не беруть участі:
// 1 резерв, 3 зняття резерву, 8 правка кількості (дорезерв), 9 повернення резерву
// за скасований товар, 10 резерв доданого товару.
const OP_NAME: Record<number, string> = {
  1: 'Резерв суми', 2: 'Комісія за продаж', 3: 'Зняття резерву', 4: 'Поповнення роялті',
  5: 'Абонплата', 6: 'Коригування балансу', 7: 'Коректування замовлення', 8: 'Правка кількості',
  9: 'Повернення резерву', 10: 'Резерв доданого товару', 11: 'Коригування абонплати',
  12: 'Поповнення платформи', 13: 'Автокоректування', 14: 'Повернення замовлення',
  15: 'Коректування роялті', 16: 'Коригування балансу роялті', 17: 'Коректування закритого періоду',
  18: 'Покриття з виплат',
};

export type ReconcileRow = {
  rozetkaOrderId: number;
  orderNumber: number | null;
  orderStatus: string | null;
  date: string;
  theirAmount: number;
  ourAmount: number;
  delta: number;
  status: 'ok' | 'diff' | 'missing_ours' | 'missing_theirs' | 'pending_delivery' | 'reserved_theirs';
};

const num = (v: string | number | null | undefined) => Number(String(v ?? '0').replace(',', '.')) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const IN_CHUNK = 200;
const chunks = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Звірка з кабінетом Rozetka за період [from, to] (YYYY-MM-DD). У БД нічого не пише. */
export async function reconcileRozetka(from: string, to: string) {
  const [cabinet, txns, logisticOps] = await Promise.all([
    getRozetkaBalanceTotal(),
    getRozetkaBalanceTxns({ dateFrom: from, dateTo: to }),
    // Логістичний баланс окремий: збір за організацію видачі в точках Rozetka
    // у /balances/search не потрапляє взагалі. Помилка тут не має валити звірку.
    getRozetkaLogisticOps().catch(err => {
      console.error('[rozetka-reconcile] logistic ops failed:', err);
      return [];
    }),
  ]);

  // Їхні списання/повернення по кожному Rozetka-замовленню
  const theirByOrder = new Map<number, { amount: number; lastTs: string }>();
  for (const t of txns) {
    let signed = 0;
    if (CHARGE_OPS.has(t.operationType)) signed = num(t.debit);
    else if (REFUND_OPS.has(t.operationType)) signed = -num(t.credit);
    else continue;
    if (!t.orderId || !signed) continue;
    const cur = theirByOrder.get(t.orderId) ?? { amount: 0, lastTs: t.transaction_ts };
    cur.amount += signed;
    if (t.transaction_ts > cur.lastTs) cur.lastTs = t.transaction_ts;
    theirByOrder.set(t.orderId, cur);
  }

  // Замовлення, по яких Rozetka вже тримає резерв (сіра зона, ops 1/10) — якщо ми вже
  // провели комісію, а списання ще немає, це нормальний лаг Rozetka, а не розбіжність.
  const reservedRzIds = new Set(txns.filter(t => [1, 8, 10].includes(t.operationType) && t.orderId).map(t => t.orderId));

  // Інші операції кабінету (без привʼязки до замовлення / резерви) — для контексту
  const othersMap = new Map<number, { count: number; debit: number; credit: number }>();
  for (const t of txns) {
    if (CHARGE_OPS.has(t.operationType) && t.orderId) continue;
    if (REFUND_OPS.has(t.operationType) && t.orderId) continue;
    const cur = othersMap.get(t.operationType) ?? { count: 0, debit: 0, credit: 0 };
    cur.count++; cur.debit += num(t.debit); cur.credit += num(t.credit);
    othersMap.set(t.operationType, cur);
  }
  const others = [...othersMap.entries()]
    .map(([op, v]) => ({ op, name: OP_NAME[op] ?? `Операція ${op}`, count: v.count, debit: r2(v.debit), credit: r2(v.credit) }))
    .sort((a, b) => a.op - b.op);

  const db = createServiceClient();

  // Мапа Rozetka orderId → наше замовлення
  // .in() — порціями: ~400 uuid уже не влазять у URL, запит падає «fetch failed»,
  // а без перевірки помилки це виглядало як «у нас комісій немає» по всіх замовленнях.
  const rzIds = [...theirByOrder.keys()];
  const orders: { id: string; order_number: number; status: string; rozetka_order_id: number }[] = [];
  for (const part of chunks(rzIds, IN_CHUNK)) {
    const { data, error } = await db.from('orders')
      .select('id, order_number, status, rozetka_order_id')
      .in('rozetka_order_id', part)
      .limit(part.length);
    if (error) throw new Error(`Звірка Rozetka: замовлення не прочитались — ${error.message}`);
    orders.push(...(data ?? []));
  }
  const orderByRzId = new Map(orders.map(o => [Number(o.rozetka_order_id), o]));

  // Наші проводки комісій по цих замовленнях (marketplace_fee, знак: + списання / − повернення)
  const fees: { order_id: string | null; amount: number; doc_type: string | null; description: string | null; meta: unknown }[] = [];
  for (const part of chunks(orders.map(o => o.id), IN_CHUNK)) {
    const { data, error } = await db.from('money_entries')
      .select('order_id, amount, doc_type, description, meta')
      .eq('account_type', 'marketplace_fee')
      .eq('counterparty_id', 'rozetka')
      .in('order_id', part)
      .order('id')
      .limit(10000);
    if (error) throw new Error(`Звірка Rozetka: комісії не прочитались — ${error.message}`);
    fees.push(...(data ?? []));
  }
  // Построчна таблиця звіряє САМЕ КОМІСІЮ, тому Smart і збір за видачу сюди
  // домішувати не можна: у «наших» сумах вони давали фантомні розбіжності
  // рівно на 18/30 ₴ з кнопкою «Провести», яка створила б корекцію на порожньому
  // місці. Ці статті звіряються окремими рядками таблиці статей.
  const ourByOrderId = new Map<string, number>();
  for (const f of fees ?? []) {
    if (!f.order_id) continue;
    if (rozetkaFeeKind(f) !== 'commission') continue;
    ourByOrderId.set(f.order_id, (ourByOrderId.get(f.order_id) ?? 0) + Number(f.amount));
  }

  const rows: ReconcileRow[] = [];
  for (const [rzId, their] of theirByOrder) {
    const o = orderByRzId.get(rzId);
    const our = o ? (ourByOrderId.get(o.id) ?? 0) : 0;
    const delta = r2(their.amount - our);
    let status: ReconcileRow['status'];
    if (Math.abs(delta) < 0.01) status = 'ok';
    else if (!o) status = 'missing_ours';
    else if (our === 0 && ['shipped', 'picking', 'confirmed', 'new', 'awaiting_stock'].includes(o.status)) status = 'pending_delivery';
    else if (our === 0) status = 'missing_ours';
    else status = 'diff';
    rows.push({
      rozetkaOrderId: rzId,
      orderNumber: o?.order_number ?? null,
      orderStatus: o?.status ?? null,
      date: their.lastTs.slice(0, 10),
      theirAmount: r2(their.amount),
      ourAmount: r2(our),
      delta,
      status,
    });
  }

  // Наші комісії за період, яких НЕМАЄ у виписці Rozetka (навпаки)
  const { data: periodFees } = await db.from('money_entries')
    .select('order_id, amount, meta, doc_type, description')
    .eq('account_type', 'marketplace_fee')
    .eq('counterparty_id', 'rozetka')
    .gte('business_date', from)
    .lte('business_date', to)
    .not('order_id', 'is', null)
    .limit(10000);
  const periodByOrder = new Map<string, number>();
  // Smart і збір за видачу мають власні рядки в таблиці статей — у построчну
  // звірку комісії вони не входять, інакше дають фантомні «розбіжності».
  const smartFees = { count: 0, total: 0 };
  for (const f of periodFees ?? []) {
    const kind = rozetkaFeeKind(f);
    if (kind === 'smart') {
      smartFees.count++;
      smartFees.total = r2(smartFees.total + Number(f.amount));
      continue;
    }
    if (kind !== 'commission') continue;
    periodByOrder.set(f.order_id!, (periodByOrder.get(f.order_id!) ?? 0) + Number(f.amount));
  }
  const matchedOurIds = new Set((orders ?? []).map(o => o.id));
  const extraIds = [...periodByOrder.keys()].filter(id => !matchedOurIds.has(id));
  if (extraIds.length) {
    const { data: extraOrders } = await db.from('orders')
      .select('id, order_number, status, rozetka_order_id, channel_code')
      .in('id', extraIds)
      .eq('channel_code', 'rozetka')
      .limit(extraIds.length);
    for (const o of extraOrders ?? []) {
      const our = r2(periodByOrder.get(o.id) ?? 0);
      if (!our) continue;
      rows.push({
        rozetkaOrderId: Number(o.rozetka_order_id) || 0,
        orderNumber: o.order_number,
        orderStatus: o.status,
        date: '',
        theirAmount: 0,
        ourAmount: our,
        delta: r2(-our),
        status: reservedRzIds.has(Number(o.rozetka_order_id)) ? 'reserved_theirs' : 'missing_theirs',
      });
    }
  }

  rows.sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999'));
  const totals = {
    their: r2(rows.reduce((s, r) => s + r.theirAmount, 0)),
    ours:  r2(rows.reduce((s, r) => s + r.ourAmount, 0)),
  };

  /* ── Звірка ПО СТАТТЯХ ────────────────────────────────────────────────────
     Построчна звірка вище дивиться лише комісію по замовленнях. Але грошей з
     нас площадка бере більше: збір за організацію видачі (окремий логістичний
     баланс) і абонплата (без прив'язки до замовлення). Без них «зійшлося»
     означало б лише «зійшлася комісія».

     Усі суми ЧИСТІ — і нарахування, і сторно. Це не дрібниця: фільтр «лише
     додатні» ховає сторно і показує розбіжність там, де її вже виправили. */
  const inPeriod = (d: string) => d >= from && d <= to;

  // Типи збору за видачу — спільний список (lib/rozetka-delivery-tariff). Раніше
  // тут стояв літерал 34, і коли Rozetka перейшла на 106/107, стаття показувала
  // 150 ₴ проти наших 1 230 ₴ — фантомна різниця на 1 080 ₴ у бік, зворотний
  // реальному (звірка 31.08.2026).
  // Збір ПЛЮС коригування рахунку: Rozetka перераховує вже списане (06–07.08.2026
  // зняла за два відправлення Meest по 49 ₴, назавтра повернула обидва і списала
  // по 30). Без коригувань стаття завищувала їхню суму на 38 ₴.
  const theirPickup = r2(logisticOps
    .filter(o => inPeriod(String(o.transaction_ts).slice(0, 10)))
    // 44 «невитребуване» в обліку теж іде статтею доставки (rozetkaFeeKind → pickup),
    // тож і з боку Rozetka його треба рахувати тут — інакше вічні +49 ₴ на кожне.
    .reduce((s, o) => (isRozetkaPickupOp(o.operation_type) || isRozetkaLogisticAdj(o.operation_type) || isRozetkaReturnDeliveryOp(o.operation_type))
      ? s + Math.abs(num(o.debit)) - Math.abs(num(o.credit))
      : s, 0));
  const theirSubscription = r2(txns
    .filter(t => t.operationType === 5)
    .reduce((s, t) => s + num(t.debit), 0));

  const { data: allPeriodFees } = await db.from('money_entries')
    .select('amount, description, doc_type, meta')
    .eq('account_type', 'marketplace_fee')
    .eq('counterparty_id', 'rozetka')
    .gte('business_date', from)
    .lte('business_date', to)
    .limit(10000);
  // Комісію для статті беремо з построчної звірки (totals.ours) — щоб число в
  // таблиці статей і сума рядків нижче не розходились.
  let oursPickup = 0, oursSubscription = 0;
  for (const f of allPeriodFees ?? []) {
    const kind = rozetkaFeeKind(f);
    if (kind === 'subscription') oursSubscription += Number(f.amount);
    else if (kind === 'pickup')  oursPickup       += Number(f.amount);
  }

  const article = (key: string, label: string, their: number, ours: number, note?: string) =>
    ({ key, label, their: r2(their), ours: r2(ours), delta: r2(ours - their), note });

  const articles = [
    article('commission', 'Комісія за продаж', totals.their, totals.ours),
    article('pickup', 'Доставка в точки видачі', theirPickup, oursPickup,
      oursPickup > theirPickup
        ? 'Ми проводимо збір при відгрузці, Rozetka списує при прийманні перевізником — різниця зазвичай зникає за добу.'
        : undefined),
    article('subscription', 'Абонплата', theirSubscription, oursSubscription),
    // Rozetka списує Smart-збір, але НЕ показує його рядком: ні в /balances/search,
    // ні у вивантаженні історії транзакцій, ні в місячному акті, ні в довіднику з
    // 41 типу операцій. Що гроші все ж пішли, видно з залишку — див. balanceCheck
    // нижче: без цих 252 ₴ у кабінеті лежало б на 252 ₴ більше. Тому в колонку
    // «Rozetka» ставимо ту саму суму: розбіжності тут немає, є лише брак рядка.
    article('smart', 'Smart-збір', smartFees.total, smartFees.total,
      smartFees.total > 0
        ? 'Rozetka не показує ці списання рядком у виписці — але вони є: перевірка залишку нижче сходиться копійка в копійку саме з ними.'
        : undefined),
  ];
  const articlesTotal = article('total', 'РАЗОМ',
    articles.reduce((s, a) => s + a.their, 0),
    articles.reduce((s, a) => s + a.ours, 0));

  /* ── Перевірка ЗАЛИШКУ ────────────────────────────────────────────────────
     Головний контроль, і саме він ловить те, чого не видно построчно: частину
     зборів Rozetka знімає без рядка у виписці. Наш баланс площадки має
     дорівнювати «баланс кабінету + сіра зона»: сіра зона — це зарезервована під
     замовлення в роботі майбутня комісія, гроші ще наші, просто заморожені, а
     ми резерв окремо не моделюємо. */
  const ourBalance = await getMarketplaceBalance('rozetka');
  // Мінус логістичного балансу (збір за видачу, ще не покритий гарантійним
  // платежем) Rozetka вже враховує в cabinet.balance — окремо не додавати
  // (перевірено 29.10.2026: залишок у виписці 976,39 − сіра 1 459,67 − 35 = −518,28).
  const cabinetTotal = r2(cabinet.balance + cabinet.sumInGray);
  const balanceCheck = {
    ours: r2(ourBalance),
    cabinetBalance: r2(cabinet.balance),
    cabinetGray: r2(cabinet.sumInGray),
    cabinetTotal,
    delta: r2(ourBalance - cabinetTotal),
  };

  return {
    cabinet, from, to, rows, others, smartFees, articles, articlesTotal, balanceCheck,
    totals: { ...totals, delta: r2(totals.their - totals.ours) },
  };
}

export type RozetkaReconcile = Awaited<ReturnType<typeof reconcileRozetka>>;
