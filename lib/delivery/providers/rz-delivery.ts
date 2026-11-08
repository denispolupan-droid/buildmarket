import { RZ_DELIVERY_TYPE, rzPhase, rzCarrierAccepted } from '../../rz-delivery';
import { rzTrackStatuses, type RzTrackStatus } from '../../rz-delivery-api';
import { groupByTracking } from '../../delivery-tracking';
import type { DeliveryProvider, ParcelPhase, ParcelUpdate, TrackedOrder } from '../types';

/**
 * «ROZETKA Доставка» власного договору (замовлення сайту): нормальний трекінг
 * пачкою по номерах ЕН (чанкінг усередині rzTrackStatuses). Замовлень Rozetka
 * тут немає — пушів у маркетплейс не буває.
 */
const PHASE: Record<ReturnType<typeof rzPhase>, ParcelPhase> = {
  created: 'created', accepted: 'in_transit', at_point: 'arrived', delivered: 'delivered',
  returning: 'returning', cancelled: 'returning', unknown: 'unknown',
};

/** Чиста частина: відповідь трекінгу → оновлення для одного замовлення. */
export function rzTrackUpdate(track: RzTrackStatus, o: Pick<TrackedOrder, 'tracking_number' | 'rz_payment_fee' | 'rz_delivery_cost' | 'rz_delivery_payer'>): ParcelUpdate {
  const code = track.last_status?.status;
  const ttn = String(o.tracking_number);
  const expenses = [];
  // Комісію за переказ післяплати Rozetka утримує з ПРОДАВЦЯ — наша витрата навіть
  // коли саму доставку оплатив покупець. Ключ по ЕН: об'єднана посилка — одна проводка.
  const fee = Number(o.rz_payment_fee) || 0;
  if (fee > 0) expenses.push({
    amount: fee, creditParty: 'rz:delivery', docType: 'delivery_cost',
    idempotencyKey: `rz-payment-fee:${ttn}`, description: `Комісія за переказ післяплати ROZETKA (ЕН ${ttn})`,
  });
  // Доставка за наш рахунок — умову міняють у кабінеті, тож перевіряємо явно
  const shipCost = Number(o.rz_delivery_cost) || 0;
  if (o.rz_delivery_payer === 'sender' && shipCost > 0) expenses.push({
    amount: shipCost, creditParty: 'rz:delivery', docType: 'delivery_cost',
    idempotencyKey: `rz-delivery:${ttn}`, description: `Доставка ROZETKA за наш рахунок (ЕН ${ttn})`,
  });
  return {
    statusText: track.last_status?.status_name ?? (code != null ? String(code) : null),
    phase: PHASE[rzPhase(code)],
    carrierAccepted: rzCarrierAccepted(code),
    expenses,
  };
}

export const rzDeliveryProvider: DeliveryProvider = {
  code: 'rzOwn',
  label: 'ROZETKA Доставка (власний договір)',
  handles: t => t === RZ_DELIVERY_TYPE,
  notifiesParcelEvents: true,
  async track(orders) {
    const out = new Map<string, ParcelUpdate>();
    if (!orders.length) return out;
    const byTtn = groupByTracking(orders);
    let tracks: RzTrackStatus[] = [];
    try {
      tracks = await rzTrackStatuses([...byTtn.keys()]);
    } catch (err) {
      console.error('[delivery/rz-delivery] statuses failed:', err);
      return out;
    }
    for (const track of tracks) {
      for (const o of byTtn.get(track.track_id) ?? []) out.set(o.id, rzTrackUpdate(track, o));
    }
    return out;
  },
};
