import { parseNpDateTime } from '../../np-datetime';
import { getNpApiKey } from '../../np-api';
import { isNpTracked } from '../../carriers';
import { groupByTracking } from '../../delivery-tracking';
import { pickReturnTtn, buildReturnTracking, type NpTrackingDoc } from '../../np-return-tracking';
import { chargeDropshipReturnFee } from '../../dropship-return-fee';
import { setRozetkaOrderStatus } from '../../rozetka-api';
import { createServiceClient } from '../../supabase-service';
import type { DeliveryProvider, ParcelPhase, ParcelUpdate, TrackedOrder, TrackContext } from '../types';

/**
 * Нова Пошта: пакетний трекінг getStatusDocuments (до 100 номерів за запит),
 * вартість/платник доставки, час вручення, зворотна накладна при відмові
 * (+ утримання зворотної доставки з дропшип-партнера) і підказка Rozetka
 * «передано перевізнику» (статус 3) для замовлень маркетплейсу з ЕН НП.
 * Невідомі delivery_type історично вважаються НП (isNpTracked).
 */
// Коди НП: 9/10/11 — вручено; 1 — «накладну створено, не передано»; 7 — «прибув у відділення»
const DELIVERED_CODES = new Set(['9', '10', '11']);
const NOT_HANDED_OVER_CODE = '1';
const ARRIVED_CODE = '7';
const CHUNK = 100;

export type NpDoc = NpTrackingDoc & {
  Status?: string; StatusCode?: string | number; DocumentCost?: string | number;
  PayerType?: string; RecipientDateTime?: string; ActualDeliveryDate?: string;
};

export function npPhase(code: string): ParcelPhase {
  if (DELIVERED_CODES.has(code)) return 'delivered';
  if (code === ARRIVED_CODE) return 'arrived';
  if (code === NOT_HANDED_OVER_CODE) return 'created';
  return 'in_transit';
}

/** Чиста частина: документ трекінгу НП → оновлення для одного замовлення з цією ЕН. */
export function npDocUpdate(doc: NpDoc, o: Pick<TrackedOrder, 'tracking_number' | 'channel_code' | 'rozetka_order_id'>): ParcelUpdate {
  const code = String(doc.StatusCode ?? '');
  const ttn = String(o.tracking_number);
  const npCost = parseFloat(String(doc.DocumentCost ?? '')) || null;
  const npPayer = doc.PayerType ? String(doc.PayerType) : null;
  // Час ВРУЧЕННЯ, а не «коли крон побачив»: RecipientDateTime — коли одержувач
  // забрав; ActualDeliveryDate — коли посилка приїхала у відділення.
  const deliveredAt = parseNpDateTime(doc.RecipientDateTime) ?? parseNpDateTime(doc.ActualDeliveryDate);
  const phase = npPhase(code);
  const update: ParcelUpdate = {
    statusText: doc.Status ? String(doc.Status) : null,
    phase,
    carrierAccepted: code !== '' && code !== NOT_HANDED_OVER_CODE,
    deliveredAt,
    patch: {
      ...(npCost != null ? { np_delivery_cost: npCost } : {}),
      ...(npPayer ? { np_delivery_payer: npPayer } : {}),
    },
    // Доставка за наш рахунок (PayerType=Sender) — витрата продавця при врученні
    expenses: npCost != null && npPayer === 'Sender' && npCost > 0 ? [{
      amount: npCost, creditParty: 'np:delivery', docType: 'delivery_cost',
      idempotencyKey: `np-delivery:${ttn}`, description: `Доставка НП за наш рахунок (ТТН ${ttn})`,
    }] : [],
  };
  // Rozetka вважає «передано перевізнику» статусом 3 — підказуємо кабінету, коли
  // НП справді прийняла посилку (не при врученні — там свій шлях).
  if (o.channel_code === 'rozetka' && o.rozetka_order_id && phase !== 'delivered') {
    const rzId = Number(o.rozetka_order_id);
    update.onAccepted = () => setRozetkaOrderStatus(rzId, 3, { ttn }).catch(err =>
      console.error('[delivery/nova-poshta] rozetka status 3 push failed:', err));
  }
  return update;
}

async function npTrack(ttns: string[]): Promise<NpDoc[]> {
  const res = await fetch('https://api.novaposhta.ua/v2.0/json/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: await getNpApiKey(),
      modelName: 'TrackingDocument',
      calledMethod: 'getStatusDocuments',
      methodProperties: { Documents: ttns.map(n => ({ DocumentNumber: n })) },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json() as { success?: boolean; data?: NpDoc[] };
  return data.success ? (data.data ?? []) : [];
}

export const novaPoshtaProvider: DeliveryProvider = {
  code: 'np',
  label: 'Нова Пошта',
  handles: t => isNpTracked(t),
  notifiesParcelEvents: true,
  async track(orders: TrackedOrder[], ctx: TrackContext) {
    const out = new Map<string, ParcelUpdate>();
    if (!orders.length) return out;
    const db = createServiceClient();
    // Одна ТТН може лежати на КІЛЬКОХ замовленнях (дві покупки однією посилкою) —
    // документ розкладаємо на всі, інакше другий висів би у «Відвантажено» назавжди.
    const ordersByTtn = groupByTracking(orders);
    const ttns = [...ordersByTtn.keys()];
    // Зворотна накладна → замовлення; трекаємо окремим пакетом після основного
    const returnTtnOrders = new Map<string, string[]>();

    for (let i = 0; i < ttns.length; i += CHUNK) {
      const docs = await npTrack(ttns.slice(i, i + CHUNK));
      for (const doc of docs) {
        const docOrders = ordersByTtn.get(String(doc.Number)) ?? [];
        if (!docOrders.length) continue;
        for (const o of docOrders) out.set(o.id, npDocUpdate(doc, o));

        // Посилка, яку не забрали, їде назад НЕ цією накладною: НП створює нову «на
        // підставі», а стара застигає у «Відмова від отримання».
        const returnTtn = pickReturnTtn(doc);
        if (returnTtn) {
          returnTtnOrders.set(returnTtn, [...(returnTtnOrders.get(returnTtn) ?? []), ...docOrders.map(o => o.id)]);
          // Дропшип: зворотну доставку оплачує партнер (раз на замовлення, ідемпотентно)
          for (const o of docOrders) {
            if (o.channel_code !== 'dropship') continue;
            try { await chargeDropshipReturnFee(db, o, doc, returnTtn, ctx.actor); }
            catch (err) { console.error('[delivery/nova-poshta] dropship return fee failed:', o.id, err); }
          }
        }
      }
    }

    // Де зараз посилка, що їде назад (+ дата, до якої зберігання безкоштовне)
    const returnTtns = [...returnTtnOrders.keys()];
    for (let i = 0; i < returnTtns.length; i += CHUNK) {
      try {
        const now = new Date().toISOString();
        for (const doc of await npTrack(returnTtns.slice(i, i + CHUNK))) {
          const ids = returnTtnOrders.get(String(doc.Number)) ?? [];
          const tracking = buildReturnTracking(doc, now);
          if (!tracking) continue;
          for (const id of ids) {
            const u = out.get(id);
            if (u) u.patch = { ...(u.patch ?? {}), np_return_tracking: tracking, np_return_ttn: tracking.ttn };
          }
        }
      } catch (err) {
        console.error('[delivery/nova-poshta] return tracking failed:', err);
      }
    }
    return out;
  },
};
