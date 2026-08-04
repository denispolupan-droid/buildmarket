import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { parsePromStatement, summarizePromStatement, type PromStatementRow } from '../../../../../../lib/prom-statement';

// Звірка з Prom. На відміну від Rozetka, «їхній» бік автоматично не дістати:
// /balance/list, /payments/list, /finance/list дають 404 — у Prom API є лише
// замовлення. Тому виписку продавець копіює з кабінету, а ми її розбираємо.
//
// Нічого не пишемо в БД — тільки порівняння.

const r2 = (v: number) => Math.round(v * 100) / 100;

type Row = {
  promOrderId: number;
  orderNumber: number | null;
  orderStatus: string | null;
  date: string;
  theirAmount: number;
  ourAmount: number;
  delta: number;
  status: 'ok' | 'diff' | 'missing_ours' | 'missing_theirs' | 'pending_delivery';
};

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { text } = await req.json() as { text?: unknown };
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Вставте історію транзакцій із кабінету Prom' }, { status: 400 });
  }

  const parsed = parsePromStatement(text);
  if (!parsed.length) {
    return NextResponse.json({ error: 'Не вдалося розібрати жодного рядка. Скопіюйте таблицю разом із колонками «Дата · Сума · Примітка · Тип».' }, { status: 400 });
  }

  const dates = parsed.map(r => r.date).sort();
  const from = dates[0], to = dates[dates.length - 1];

  // ── Їхній бік, по замовленнях ──────────────────────────────────────────────
  const theirByOrder = new Map<number, { commission: number; delivery: number; date: string }>();
  const add = (r: PromStatementRow, field: 'commission' | 'delivery') => {
    if (!r.promOrderId) return;
    const cur = theirByOrder.get(r.promOrderId) ?? { commission: 0, delivery: 0, date: r.date };
    cur[field] = r2(cur[field] + -r.amount);      // списання від'ємне → витрата додатна
    if (r.date > cur.date) cur.date = r.date;
    theirByOrder.set(r.promOrderId, cur);
  };
  for (const r of parsed) {
    if (r.kind === 'commission' || r.kind === 'commission_refund') add(r, 'commission');
    else if (r.kind === 'np_delivery') add(r, 'delivery');
  }

  const db = createServiceClient();
  const promIds = [...theirByOrder.keys()];
  const { data: orders } = promIds.length
    ? await db.from('orders')
        .select('id, order_number, status, prom_order_id')
        .in('prom_order_id', promIds)
        .limit(promIds.length)
    : { data: [] as never[] };
  const orderByPromId = new Map((orders ?? []).map(o => [Number(o.prom_order_id), o]));

  // ── Наш бік ───────────────────────────────────────────────────────────────
  // Чисті суми: і нарахування, і сторно. Фільтр «лише додатні» ховає сторно і
  // показує розбіжність там, де її вже виправили.
  const { data: fees } = await db.from('money_entries')
    .select('order_id, amount, description, doc_type')
    .eq('account_type', 'marketplace_fee')
    .eq('counterparty_id', 'prom')
    .gte('business_date', from)
    .lte('business_date', to)
    .limit(10000);

  const isDelivery = (d: string) => /дешева доставка|доставк/i.test(d);
  const ourByOrderId = new Map<string, { commission: number; delivery: number }>();
  let oursCommissionTotal = 0, oursDeliveryTotal = 0;
  for (const f of fees ?? []) {
    const a = Number(f.amount);
    const d = String(f.description ?? '');
    const bucket = isDelivery(d) ? 'delivery' : 'commission';
    if (bucket === 'delivery') oursDeliveryTotal += a; else oursCommissionTotal += a;
    if (!f.order_id) continue;
    const cur = ourByOrderId.get(f.order_id) ?? { commission: 0, delivery: 0 };
    cur[bucket] = r2(cur[bucket] + a);
    ourByOrderId.set(f.order_id, cur);
  }

  const rows: Row[] = [];
  const seenOurIds = new Set<string>();
  for (const [promId, their] of theirByOrder) {
    const o = orderByPromId.get(promId);
    if (o) seenOurIds.add(o.id);
    const our = o ? (ourByOrderId.get(o.id) ?? { commission: 0, delivery: 0 }) : { commission: 0, delivery: 0 };
    const theirTotal = r2(their.commission + their.delivery);
    const ourTotal = r2(our.commission + our.delivery);
    const delta = r2(ourTotal - theirTotal);
    let status: Row['status'];
    if (Math.abs(delta) < 0.01) status = 'ok';
    else if (!o) status = 'missing_ours';
    else if (ourTotal === 0 && ['shipped', 'picking', 'confirmed', 'new', 'awaiting_stock'].includes(o.status)) status = 'pending_delivery';
    else if (ourTotal === 0) status = 'missing_ours';
    else status = 'diff';
    rows.push({
      promOrderId: promId,
      orderNumber: o?.order_number ?? null,
      orderStatus: o?.status ?? null,
      date: their.date,
      theirAmount: theirTotal,
      ourAmount: ourTotal,
      delta,
      status,
    });
  }

  // Наші списання за період, яких у виписці немає взагалі
  const extraIds = [...ourByOrderId.keys()].filter(id => !seenOurIds.has(id));
  if (extraIds.length) {
    const { data: extra } = await db.from('orders')
      .select('id, order_number, status, prom_order_id, channel_code')
      .in('id', extraIds).eq('channel_code', 'prom').limit(extraIds.length);
    for (const o of extra ?? []) {
      const our = ourByOrderId.get(o.id)!;
      const ourTotal = r2(our.commission + our.delivery);
      if (!ourTotal) continue;
      rows.push({
        promOrderId: Number(o.prom_order_id) || 0,
        orderNumber: o.order_number, orderStatus: o.status, date: '',
        theirAmount: 0, ourAmount: ourTotal, delta: ourTotal, status: 'missing_theirs',
      });
    }
  }
  rows.sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999'));

  // ── По статтях ────────────────────────────────────────────────────────────
  const sum = summarizePromStatement(parsed);
  const article = (key: string, label: string, their: number, ours: number, note?: string) =>
    ({ key, label, their: r2(their), ours: r2(ours), delta: r2(ours - their), note });
  // Prom знімає комісію ProSale уже при створенні замовлення, а ми проводимо її
  // при доставці — тож по замовленнях «у дорозі» різниця нормальна й тимчасова.
  const pending = rows.filter(r => r.status === 'pending_delivery');
  const pendingSum = r2(pending.reduce((s, r) => s + r.theirAmount, 0));
  const articles = [
    article('commission', 'Комісія (доступ до ProSale)', sum.commission, oursCommissionTotal,
      pending.length
        ? `З них ${pendingSum} ₴ — по ${pending.length} замовл. у дорозі: Prom списує комісію при створенні замовлення, ми проводимо при доставці.`
        : undefined),
    article('np_delivery', '«Дешева доставка» НП', sum.npDelivery, oursDeliveryTotal),
  ];
  const articlesTotal = article('total', 'РАЗОМ',
    articles.reduce((s, a) => s + a.their, 0),
    articles.reduce((s, a) => s + a.ours, 0));

  return NextResponse.json({
    from, to,
    parsedRows: parsed.length,
    // Поповнення й пакети до витрат по замовленнях не належать — показуємо окремо,
    // щоб не виглядало, ніби ми їх «загубили».
    outside: { topup: sum.topup, packages: sum.packages, other: sum.other },
    articles, articlesTotal, rows,
    totals: {
      their: articlesTotal.their,
      ours: articlesTotal.ours,
      delta: articlesTotal.delta,
    },
  });
}
