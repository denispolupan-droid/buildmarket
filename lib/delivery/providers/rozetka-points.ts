import { ROZETKA_DELIVERY_TYPE } from '../../rozetka-delivery';
import { rozetkaDeliveryPhase, pickLeadingRozetkaInfo } from '../../rozetka-delivery-status';
import { getRozetkaOrderStatusInfo } from '../../rozetka-api';
import type { DeliveryProvider, ParcelPhase, ParcelUpdate, TrackedOrder } from '../types';

/**
 * Доставка в точки видачі Rozetka (замовлення маркетплейсу, номери «RMP-…»).
 * Рух посилки віддзеркалює САМ СТАТУС ЗАМОВЛЕННЯ в кабінеті (81 «Прийнято від
 * продавця» → 3 → 82 → 4 → 5 «Очікує в пункті» → 6 «Виконано»); назву статусу
 * Rozetka віддає сама. Штук на день одиниці — адресний запит на замовлення.
 *
 * Об'єднана посилка (один «RMP-…» на кілька замовлень): кабінет веде статус
 * лише по замовленню, з якого виписана накладна, у решти він заморожений на
 * «Обробляється менеджером». Тому текст і «прийнято» — за лідером посилки, а
 * «вручено» лідера означає «вручено» і сусідам (їхні РН проводяться тією ж ЕН).
 *
 * Статус у Rozetka звідси НЕ пушимо (його веде сама Rozetka); сповіщень
 * «поїхала/прибула» для цієї доставки історично не було — лишаємо як є.
 */
export type RzInfo = NonNullable<Awaited<ReturnType<typeof getRozetkaOrderStatusInfo>>>;

const toPhase = (p: ReturnType<typeof rozetkaDeliveryPhase>): ParcelPhase =>
  p === 'delivered' ? 'delivered' : p === 'returning' ? 'returning' : p === 'accepted' ? 'in_transit' : p === null ? 'unknown' : 'created';

/** Доля повернення вже вирішена менеджером («забрав» / «залишив») — питати Rozetka більше нема сенсу. */
export function rzSettled(o: Pick<TrackedOrder, 'status' | 'flags'>): boolean {
  const flags = Array.isArray(o.flags) ? (o.flags as string[]) : [];
  return o.status === 'cancelled' && (flags.includes('return_received') || flags.includes('return_abandoned'));
}

/**
 * Чиста частина: за інформацією кабінету по кожному замовленню збираємо оновлення
 * з урахуванням лідера посилки. own — статус самого замовлення (проводки й
 * «Доставлено» — за ним або за лідером, якщо лідер уже вручений).
 */
export function rozetkaPointsUpdates(orders: TrackedOrder[], infoByOrder: Map<string, RzInfo>): Map<string, ParcelUpdate> {
  const leadByTtn = new Map<string, RzInfo>();
  for (const o of orders) {
    const own = infoByOrder.get(o.id);
    if (!own) continue;
    const ttn = String(o.tracking_number);
    leadByTtn.set(ttn, pickLeadingRozetkaInfo([leadByTtn.get(ttn), own]) ?? own);
  }
  const out = new Map<string, ParcelUpdate>();
  for (const o of orders) {
    const own = infoByOrder.get(o.id) ?? null;
    const lead = leadByTtn.get(String(o.tracking_number)) ?? own;
    if (!lead) continue;
    const leadPhase = rozetkaDeliveryPhase(lead.status);
    const ownPhase = own ? rozetkaDeliveryPhase(own.status) : null;
    // Вручено: власний статус або лідер посилки (сусід у тій самій коробці)
    const phase: ParcelPhase = ownPhase === 'delivered' || leadPhase === 'delivered' ? 'delivered' : toPhase(ownPhase ?? leadPhase);
    out.set(o.id, {
      statusText: lead.title ?? `Статус ${lead.status}`,
      phase,
      carrierAccepted: leadPhase === 'accepted' || leadPhase === 'delivered' || leadPhase === 'returning',
      expenses: [],   // збір за видачу вже проведено при відгрузці (rz-delivery-fee:…)
    });
  }
  return out;
}

export const rozetkaPointsProvider: DeliveryProvider = {
  code: 'rozetka',
  label: 'Точки видачі Rozetka',
  handles: t => t === ROZETKA_DELIVERY_TYPE,
  notifiesParcelEvents: false,
  async track(orders) {
    const infoByOrder = new Map<string, RzInfo>();
    for (const o of orders) {
      if (rzSettled(o) || !o.rozetka_order_id) continue;
      try {
        const info = await getRozetkaOrderStatusInfo(Number(o.rozetka_order_id));
        if (info) infoByOrder.set(o.id, info);
      } catch (err) {
        console.error('[delivery/rozetka-points] order fetch failed:', o.rozetka_order_id, err);
      }
    }
    return rozetkaPointsUpdates(orders.filter(o => !rzSettled(o)), infoByOrder);
  },
};
