/**
 * lib/accounting/completion.ts
 *
 * Варіант 3 (поштучний облік): усі проводки — у момент ДОСТАВКИ посилки, а не
 * відгрузки. Модель «РН = посилка»: при відгрузці створюється РН-чернетка
 * (createSaleDraft), а коли доставили саме її посилку — проводимо цю РН тут.
 *
 * applyCompletionEffects(docId):
 *   1) продаж (виручка/COGS/склад + дропшип-борг) через postSaleDoc — знімає резерв;
 *   2) комісія маркетплейсу по позиціях САМЕ цієї посилки (ключ ідемпотентності per-doc).
 *
 * Все ідемпотентно: postSaleDoc виходить, якщо РН вже проведена; комісія — за
 * ключем commission:{mp}:{docId}. COD дропшип-партнеру навмисно НЕ тут — він
 * order-level (робиться при повному завершенні замовлення, окремим кроком).
 */
import { createServiceClient } from '../supabase';
import { postSaleDoc } from './dropship';
import { recordMarketplaceCommission, recordMarketplaceServiceFee, recordCustomerPayment } from './money';
import { SALE_DEBTOR } from './documents';
import { computePromCommission } from '../prom-commission';
import { computeRozetkaCommission } from '../rozetka-commission';
import { computeSmartFee, getSmartTariff } from '../rozetka-smart';
import { alertAdmin } from '../alert';

export async function applyCompletionEffects(docId: string, createdBy = 'system'): Promise<void> {
  const db = createServiceClient();

  const { data: doc } = await db
    .from('acc_documents')
    .select('id, order_id, status, doc_date')
    .eq('id', docId)
    .single();
  if (!doc || !doc.order_id) return;

  const bizDate = doc.doc_date ? String(doc.doc_date).slice(0, 10) : undefined;

  // 1) Продаж — виручка/COGS/склад (+ дропшип-борг), знімає резерв по цих позиціях.
  await postSaleDoc(docId, { confirmed_by: createdBy, business_date: bizDate });

  // 2) Комісія маркетплейсу — рахуємо по позиціях САМЕ цієї посилки.
  const { data: order } = await db
    .from('orders')
    .select('order_number, channel_code, total_price, rozetka_data')
    .eq('id', doc.order_id)
    .single();
  const mp = order?.channel_code;
  if (mp !== 'prom' && mp !== 'rozetka') return;

  const { data: lines } = await db
    .from('acc_document_lines')
    .select('sku, qty, price')
    .eq('document_id', docId);
  const items = (lines ?? []).map(l => ({ sku: l.sku, qty: Number(l.qty), price: Number(l.price) }));
  if (items.length === 0) return;
  const docRevenue = items.reduce((s, i) => s + i.qty * i.price, 0);

  try {
    let totalCommission = 0;
    if (mp === 'prom') {
      const [{ data: planRow }, { data: fbRow }] = await Promise.all([
        db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
        db.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle(),
      ]);
      const plan = (planRow?.value ?? 'single') as 'single' | 'econom';
      const fallbackPct = parseFloat(fbRow?.value ?? '3');
      totalCommission = (await computePromCommission(items, { plan, fallbackPct })).total_commission;
    } else {
      const { data: fbRow } = await db
        .from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle();
      const fallbackPct = parseFloat(fbRow?.value ?? '15');
      totalCommission = (await computeRozetkaCommission(items, { fallbackPct })).total_commission;
    }

    if (totalCommission > 0) {
      const avgPct = docRevenue > 0 ? Math.round((totalCommission / docRevenue) * 10000) / 100 : 0;
      await recordMarketplaceCommission({
        orderId:       doc.order_id,
        docId,
        amount:        totalCommission,
        marketplace:   mp,
        commissionPct: avgPct,
        businessDate:  bizDate,
        createdBy,
      });
    }
  } catch (err) {
    alertAdmin(`Комісія ${mp} не записалась (РН ${docId}, замовлення #${order?.order_number})`, err);
  }

  // 3) Компенсація Rozetka Smart — фіксований збір за порогами СУМИ ЗАМОВЛЕННЯ (не посилки),
  // разово на замовлення (order-level ключ). Основне проведення — при ВІДГРУЗЦІ (ship route),
  // бо Rozetka списує збір при передачі перевізникові; тут — страховка для замовлень,
  // відвантажених до цього механізму (той самий idempotency-ключ → задвоєння немає).
  const isSmart = mp === 'rozetka'
    && Boolean((order?.rozetka_data as Record<string, unknown> | null)?.is_smart);
  if (isSmart) {
    const orderTotal = Number(order?.total_price) || 0;
    const smartFee = computeSmartFee(orderTotal, await getSmartTariff());
    try {
      await recordMarketplaceServiceFee({
        orderId:        doc.order_id,
        amount:         smartFee,
        marketplace:    'rozetka',
        description:    `Rozetka Smart — компенсація доставки (замовлення #${order?.order_number})`,
        idempotencyKey: `smart-fee:rozetka:${doc.order_id}`,
        businessDate:   bizDate,
        createdBy,
        meta:           { smart: true, order_total: orderTotal },
      });
    } catch (err) {
      alertAdmin(`Smart-збір Rozetka не записався (замовлення #${order?.order_number})`, err);
    }
  }
}

/**
 * COD дропшип-партнеру — нараховується коли замовлення ПОВНІСТЮ доставлене (order-level,
 * ідемпотентно за order_id усередині credit_cod_to_partner, міграція 057). Викликається
 * лише після того, як усі РН замовлення проведені.
 */
export async function settleOrderCOD(orderId: string, createdBy = 'system'): Promise<void> {
  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('id, order_number, channel_code, partner_code, payment_type, total_price')
    .eq('id', orderId)
    .single();
  if (!order) return;
  if (order.channel_code !== 'dropship' || !order.partner_code || order.payment_type !== 'cod') return;
  try {
    const { data: customer } = await db.from('customers').select('id').eq('id', order.partner_code).single();
    if (customer) {
      const { error } = await db.rpc('credit_cod_to_partner', {
        p_customer_id: customer.id,
        p_cod_amount:  order.total_price,
        p_order_id:    order.id,
        p_np_fee_pct:  2,
      });
      if (error) throw error;
    }
  } catch (err) {
    alertAdmin(`COD партнеру не нарахувався (замовлення #${order.order_number})`, err);
  }
}

/**
 * Свій (не дропшип) накладений платіж: при доставці COD-замовлення НоваПей збирає гроші
 * з клієнта і тримає їх у себе («Контроль оплати»). Визнаємо їх на рахунку novapay:
 * DR novapay / CR customer[np:cod] — тобто закриваємо борг np:cod і бачимо гроші як
 * зібрані НоваПей. Виплата НоваПей → банк (з комісією НП) — окремо (Фаза 2).
 * Ідемпотентно за ключем cod-collect:{orderId}. Дропшип-COD сюди не входить (credit_cod_to_partner).
 */
export async function settleOwnCod(orderId: string, createdBy = 'system'): Promise<void> {
  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('order_number, channel_code, payment_type, total_price')
    .eq('id', orderId)
    .single();
  if (!order) return;
  if (order.payment_type !== 'cod' || order.channel_code === 'dropship') return;
  const amount = Number(order.total_price);
  if (!(amount > 0)) return;
  try {
    await recordCustomerPayment({
      customerId:     SALE_DEBTOR.npCod,      // борг на np:cod, який гасимо
      amount,
      paymentMethod:  'novapay',
      orderId,
      idempotencyKey: `cod-collect:${orderId}`,
      description:    `COD зібрано НоваПей (замовлення #${order.order_number})`,
      createdBy,
    });
  } catch (err) {
    alertAdmin(`COD не визнано на novapay (замовлення #${order.order_number})`, err);
  }
}

/**
 * Транзитний хелпер: замовлення, відвантажені СТАРИМ потоком (проведена РН вже є,
 * чернетки немає), при доставці після переходу на Варіант 3 не отримають комісію
 * через новий per-doc шлях. Тут донараховуємо комісію order-level (як старий
 * applyDeliveredEffects) — ЛИШЕ якщо комісії по замовленню ще не було. Для нових
 * (per-doc) замовлень пропускаємо (комісія вже є) → без задвоєння.
 */
export async function settleLegacyCommission(orderId: string, createdBy = 'system'): Promise<void> {
  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('order_number, channel_code, total_price, items')
    .eq('id', orderId)
    .single();
  if (!order) return;
  const mp = order.channel_code;
  if (mp !== 'prom' && mp !== 'rozetka') return;

  // Вже є комісія по цьому замовленню (новий per-doc шлях або вже донараховано)? — стоп.
  const { count: commCount } = await db
    .from('money_entries')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('account_type', 'marketplace_fee');
  if ((commCount ?? 0) > 0) return;

  // Є проведена РН? (інакше продаж ще не зафіксовано). Сторно (reversal_of != null)
  // не рахуємо — інакше скасоване замовлення виглядало б як зафіксований продаж.
  const { count: confCount } = await db
    .from('acc_documents')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed')
    .is('reversal_of', null);
  if ((confCount ?? 0) === 0) return;

  const items = ((order.items ?? []) as { sku: string; qty: number; price: number }[])
    .map(i => ({ sku: i.sku, qty: Number(i.qty), price: Number(i.price) }));
  if (!items.length) return;

  try {
    let commission = 0;
    if (mp === 'prom') {
      const [{ data: planRow }, { data: fbRow }] = await Promise.all([
        db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
        db.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle(),
      ]);
      commission = (await computePromCommission(items, {
        plan: (planRow?.value ?? 'single') as 'single' | 'econom',
        fallbackPct: parseFloat(fbRow?.value ?? '3'),
      })).total_commission;
    } else {
      const { data: fbRow } = await db.from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle();
      commission = (await computeRozetkaCommission(items, { fallbackPct: parseFloat(fbRow?.value ?? '15') })).total_commission;
    }
    if (commission > 0) {
      const avgPct = Number(order.total_price) > 0 ? Math.round((commission / Number(order.total_price)) * 10000) / 100 : 0;
      await recordMarketplaceCommission({ orderId, amount: commission, marketplace: mp, commissionPct: avgPct, createdBy });
    }
  } catch (err) {
    alertAdmin(`Legacy-комісія ${mp} не записалась (замовлення #${order.order_number})`, err);
  }
}

/**
 * Провести ВСІ чернетки-РН замовлення (повна доставка / ручне «Виконано» / самовивіз),
 * потім (якщо все проведено) — COD партнеру. Повертає кількість проведених накладних.
 */
export async function completeOrderDelivery(orderId: string, createdBy = 'system'): Promise<number> {
  const db = createServiceClient();
  const { data: docs } = await db
    .from('acc_documents')
    .select('id')
    .eq('order_id', orderId)
    .eq('doc_type', 'sale')
    .eq('status', 'draft');
  let posted = 0;
  for (const d of docs ?? []) {
    await applyCompletionEffects(d.id, createdBy);
    posted++;
  }
  // Legacy-замовлення (старий потік, без чернеток): донараховуємо комісію order-level.
  await settleLegacyCommission(orderId, createdBy);
  if (await allOrderSalesPosted(orderId)) {
    await settleOrderCOD(orderId, createdBy);   // дропшип-COD партнеру
    await settleOwnCod(orderId, createdBy);      // свій COD → novapay
  }
  return posted;
}

/**
 * Провести РН конкретної посилки за її ТТН (крон доставки НП). Якщо після цього всі
 * РН замовлення проведені — нараховуємо COD партнеру. Повертає order_id або null.
 */
export async function completeShipmentByTtn(trackingNumber: string, createdBy = 'system'): Promise<string | null> {
  const db = createServiceClient();
  const { data: doc } = await db
    .from('acc_documents')
    .select('id, order_id')
    .eq('doc_type', 'sale')
    .eq('status', 'draft')
    .eq('tracking_number', trackingNumber)
    .maybeSingle();
  if (!doc) return null;
  await applyCompletionEffects(doc.id, createdBy);
  if (doc.order_id && await allOrderSalesPosted(doc.order_id)) {
    await settleOrderCOD(doc.order_id, createdBy);
    await settleOwnCod(doc.order_id, createdBy);   // свій COD → novapay
  }
  return doc.order_id;
}

/** Чи всі sale-чернетки замовлення проведені (для переходу замовлення в delivered). */
export async function allOrderSalesPosted(orderId: string): Promise<boolean> {
  const db = createServiceClient();
  const { count } = await db
    .from('acc_documents')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('doc_type', 'sale')
    .eq('status', 'draft');
  return (count ?? 0) === 0;
}
