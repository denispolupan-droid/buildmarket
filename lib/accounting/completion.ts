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
import { recordMarketplaceCommission } from './money';
import { computePromCommission } from '../prom-commission';
import { computeRozetkaCommission } from '../rozetka-commission';
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
    .select('order_number, channel_code')
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
  if (await allOrderSalesPosted(orderId)) await settleOrderCOD(orderId, createdBy);
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
