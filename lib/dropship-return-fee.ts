/**
 * Зворотна доставка відмовної дропшип-посилки — за рахунок партнера (рішення власника 14.09.2026).
 *
 * Коли одержувач не забирає посилку, НП створює зворотну накладну (CargoReturn) і
 * рахує відправнику (нам) доставку назад, а якщо доставку туди мав оплатити
 * одержувач — то й її. Трекінг вартості не віддає (безготівковий договір: 0 або
 * порожньо), тому суму рахуємо тарифом НП (InternetDocument.getDocumentPrice) за
 * маршрутом, вагою й оголошеною вартістю самої посилки.
 *
 * Утримуємо один раз на замовлення (external_ref return-fee:{orderId}, унікальний
 * індекс), у кабінеті — рядок «Зворотна доставка»; у леджері DR partner / CR logistics[np].
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { npCall, getNpApiKey } from './np-api';
import { recordTxn } from './accounting/money';
import { alertAdmin } from './alert';
import { dropshipReturnFee, returnFeeLegs } from './dropship-order';

type TrackingDoc = {
  Number?: string; PayerType?: string; CargoType?: string; SeatsAmount?: string | number;
  DocumentWeight?: number | string; VolumeWeight?: number | string; AnnouncedPrice?: number | string;
  RefCitySender?: string; RefCityRecipient?: string; ServiceType?: string;
};

export async function chargeDropshipReturnFee(
  db: SupabaseClient,
  order: { id: string; order_number: number; channel_code: string | null; partner_code?: string | null },
  doc: TrackingDoc,
  returnTtn: string,
  actor: string,
): Promise<void> {
  if (order.channel_code !== 'dropship' || !order.partner_code) return;
  const extRef = `return-fee:${order.id}`;
  const { data: done } = await db.from('partner_balance_transactions').select('id').eq('external_ref', extRef).maybeSingle();
  if (done) return;

  if (!doc.RefCitySender || !doc.RefCityRecipient) {
    alertAdmin(`Дропшип #${order.order_number}: відмова від посилки, але маршрут НП невідомий — утримайте зворотну доставку з партнера вручну`);
    return;
  }

  const weight = Math.max(Number(doc.DocumentWeight) || 0, Number(doc.VolumeWeight) || 0, 0.1);
  const apiKey = await getNpApiKey();
  const price = await npCall<{ Cost: number }>(apiKey, 'InternetDocument', 'getDocumentPrice', {
    // Назад: від міста одержувача до нашого
    CitySender:    doc.RefCityRecipient,
    CityRecipient: doc.RefCitySender,
    Weight:        String(weight),
    ServiceType:   'WarehouseWarehouse',
    Cost:          String(Math.max(1, Math.round(Number(doc.AnnouncedPrice) || 1))),
    CargoType:     doc.CargoType || 'Parcel',
    SeatsAmount:   String(Math.max(1, Number(doc.SeatsAmount) || 1)),
  });
  const tariff = Number(price.data?.[0]?.Cost);
  const fee = dropshipReturnFee(tariff, doc.PayerType);
  if (!price.success || fee <= 0) {
    alertAdmin(`Дропшип #${order.order_number}: не вдалося порахувати тариф зворотної доставки — утримайте з партнера вручну`, price.errors);
    return;
  }

  const legs = returnFeeLegs(doc.PayerType);
  const description = `Зворотна доставка відмовної посилки #${order.order_number} (ЕН ${returnTtn})`
    + (legs === 2 ? ` — доставка туди й назад, по ${tariff} ₴` : '');
  const { error } = await db.from('partner_balance_transactions').insert({
    customer_id: order.partner_code, tx_type: 'return_fee', amount: -fee, order_id: order.id,
    description, created_by: actor, external_ref: extRef,
  });
  if (error) {
    if (/unique|duplicate|23505/.test(error.message)) return;
    alertAdmin(`Дропшип #${order.order_number}: зворотна доставка ${fee} ₴ не утримана з партнера`, error.message);
    return;
  }

  try {
    await recordTxn({
      debitAccount: 'partner', debitParty: order.partner_code, creditAccount: 'logistics', creditParty: 'np',
      amount: fee, docType: 'partner_return_fee', orderId: order.id, description,
      idempotencyKey: `partner-return-fee:${order.id}`, createdBy: actor,
      meta: { return_ttn: returnTtn, tariff, legs },
    });
  } catch (err) {
    alertAdmin(`Дропшип #${order.order_number}: зворотна доставка утримана з балансу, але не проведена в облік`, err);
  }
  alertAdmin(`↩ Дропшип #${order.order_number}: відмова від посилки — з балансу партнера утримано ${fee} ₴ за зворотну доставку`);
}
