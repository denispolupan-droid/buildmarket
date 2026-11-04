import { getPromOrder } from '../prom-api';
import { computePromCommission } from '../prom-commission';
import { computeRozetkaCommission } from '../rozetka-commission';
import { computeSmartFee, getSmartTariff } from '../rozetka-smart';
import { computePromDeliveryFee, getPromDeliveryTariff, isPromCheapDelivery } from '../prom-delivery';
import { getRozetkaDeliveryTariff } from '../rozetka-delivery-fee';
import { resolveRozetkaDeliveryFee } from '../rozetka-delivery-tariff';
import { ROZETKA_DELIVERY_TYPE } from '../rozetka-delivery';
import { computeEpicentrCommission, getEpicentrFallbackPct } from '../epicentr-commission';
import { getEpicentrBillingInvoice } from '../epicentr-api';
import { createServiceClient, asJson } from '../supabase-service';
import { log } from '../log';
import { getPromCommissionSettings } from './prom';
import { getRozetkaFallbackPct } from './rozetka';
import type { MarketplaceCode, MappedItem } from './adapter';
import { chunkByDistinctSku } from './fees-rules';

/**
 * ChannelFeeProvider (аудит 31.10, п. 17): усе, що облік має знати про збори
 * площадок, — тут. lib/accounting/completion.ts раніше імпортував сім модулів
 * каналів напряму (двостороння зв'язність ядро ↔ канали); тепер — лише цей файл.
 * Логіка перенесена дослівно з applyCompletionEffects.
 */
type Db = ReturnType<typeof createServiceClient>;

export type OrderForFees = {
  id: string;
  order_number: number | null;
  channel_code: string | null;
  total_price: number | null;
  prom_order_id: number | null;
  epicentr_order_id: string | null;
  prom_data: unknown;
  rozetka_data: unknown;
};

export function isMarketplace(code: string | null | undefined): code is MarketplaceCode {
  return code === 'prom' || code === 'rozetka' || code === 'epicentr';
}

/**
 * Освіжити знімок payload Prom перед проводками: редагування замовлення міняє
 * cpa_commission, «дешева доставка» може зніматись. На збої мережі — тихий
 * фолбек на знімок. Повертає актуальний prom_data.
 */
export async function refreshPromSnapshot(db: Db, order: OrderForFees): Promise<Record<string, unknown> | null> {
  let promData = (order.prom_data ?? null) as Record<string, unknown> | null;
  if (order.channel_code !== 'prom' || !order.prom_order_id) return promData;
  try {
    const fresh = await getPromOrder(Number(order.prom_order_id));
    if (fresh) {
      promData = { ...(promData ?? {}), ...(fresh as unknown as Record<string, unknown>) };
      await db.from('orders').update({ prom_data: asJson(promData) }).eq('id', order.id);
    }
  } catch (err) {
    log.warn('mp.fees.prom_refresh_failed', { promOrderId: order.prom_order_id, err });
  }
  return promData;
}

/**
 * Комісія площадки за позиції ОДНІЄЇ посилки (РН). Факт із площадки (cpa Prom,
 * білінг Епіцентру) — лише коли РН покриває все замовлення; мультипосилка й
 * відсутність факту — оцінка за ставками категорій.
 */
export async function computeChannelCommission(
  db: Db, mp: MarketplaceCode, order: OrderForFees, items: MappedItem[], docRevenue: number, promData: Record<string, unknown> | null,
): Promise<number> {
  const wholeOrder = Math.abs(docRevenue - (Number(order.total_price) || 0)) < 0.01;
  if (mp === 'prom') {
    // Джерело правди — ФАКТИЧНА комісія Prom із payload (cpa_commission): саме її
    // Prom списує з балансу. Розрахунок по категоріях недорахував 2026-07-29
    // (№26071051): план перемкнули між створенням і доставкою.
    const cpaRaw = (promData?.cpa_commission as { amount?: unknown } | null)?.amount;
    const cpa = Number(String(cpaRaw ?? '').replace(/\s/g, '').replace(',', '.'));
    if (cpa > 0 && wholeOrder) return cpa;
    return (await computePromCommission(items, await getPromCommissionSettings(db))).total_commission;
  }
  if (mp === 'epicentr') {
    // Факт — з білінгу Епіцентру (/v1/billing/orders/{id}/invoice).
    let fact = 0;
    if (wholeOrder && order.epicentr_order_id) {
      try {
        const inv = await getEpicentrBillingInvoice(String(order.epicentr_order_id));
        fact = Number(String(inv?.orderCommissionTotal ?? '').replace(',', '.')) || 0;
      } catch (err) {
        log.warn('mp.fees.epicentr_invoice_failed', { epicentrOrderId: order.epicentr_order_id, err });
      }
    }
    if (fact > 0) return fact;
    return (await computeEpicentrCommission(items, { fallbackPct: await getEpicentrFallbackPct(db) })).total_commission;
  }
  return (await computeRozetkaCommission(items, { fallbackPct: await getRozetkaFallbackPct(db) })).total_commission;
}

/**
 * Оцінювач комісії за ставками категорій (без факту з площадки): налаштування
 * читаються раз, далі функцію можна кликати на кожен документ.
 */
export async function makeChannelEstimator(db: Db, mp: MarketplaceCode): Promise<(items: MappedItem[]) => Promise<number>> {
  if (mp === 'prom') { const s = await getPromCommissionSettings(db); return async items => (await computePromCommission(items, s)).total_commission; }
  if (mp === 'epicentr') { const fallbackPct = await getEpicentrFallbackPct(db); return async items => (await computeEpicentrCommission(items, { fallbackPct })).total_commission; }
  const fallbackPct = await getRozetkaFallbackPct(db);
  return async items => (await computeRozetkaCommission(items, { fallbackPct })).total_commission;
}

/** Лише оцінка за ставками категорій (без факту з площадки) — legacy-донарахування. */
export async function estimateChannelCommission(db: Db, mp: MarketplaceCode, items: MappedItem[]): Promise<number> {
  return (await makeChannelEstimator(db, mp))(items);
}

/**
 * Оцінка комісії ПО КОЖНІЙ позиції (ставки/пороги категорій) для будь-якої
 * кількості замовлень одним батчем: результат — масив тієї ж довжини й у тому
 * самому порядку, що й items. Пачки — за кількістю різних SKU (URL PostgREST).
 * Прогноз прибутку на «Огляді»/«Аналітиці» (lib/accounting/estimate) бере
 * комісію лише звідси, щоб не розходитись із тим, що проведе completion.
 */
export async function estimateChannelCommissionPerItem(
  db: Db, mp: MarketplaceCode, items: { sku: string; qty: number; price: number }[],
): Promise<number[]> {
  if (items.length === 0) return [];
  const s = mp === 'prom' ? await getPromCommissionSettings(db) : null;
  const fallbackPct = mp === 'epicentr' ? await getEpicentrFallbackPct(db) : mp === 'rozetka' ? await getRozetkaFallbackPct(db) : 0;
  const out: number[] = [];
  for (const part of chunkByDistinctSku(items)) {
    const res = mp === 'prom' ? await computePromCommission(part, s!)
      : mp === 'epicentr' ? await computeEpicentrCommission(part, { fallbackPct })
      : await computeRozetkaCommission(part, { fallbackPct });
    if (res.items.length !== part.length) throw new Error(`fees: ${mp} повернув ${res.items.length} позицій на ${part.length}`);
    for (const it of res.items) out.push(it.commission_amt);
  }
  return out;
}

/**
 * Збори РІВНЯ ЗАМОВЛЕННЯ, відомі наперед (для прогнозу прибутку, lib/accounting/estimate):
 * Rozetka Smart (за сумою замовлення), організація видачі Rozetka Доставки (не-Smart),
 * «Дешева доставка» Prom (за акцією в payload). Тарифи читаються раз на виклик.
 * Той самий розрахунок, що проводять ship-route і completion; факт площадки може
 * відрізнятись на гривні (його доводить rozetka-fees-sync) — для прогнозу достатньо.
 */
export type OrderForLevelFees = {
  id: string;
  channel_code: string | null;
  total_price: number | null;
  delivery_type: string | null;
  is_smart: unknown;          // rozetka_data->is_smart
  ps_promotion: unknown;      // prom_data->ps_promotion
  rz_delivery_price: unknown; // rozetka_data->_rz_delivery_price (факт з накладної, якщо є)
};

export async function estimateOrderLevelFees(db: Db, orders: OrderForLevelFees[]): Promise<Map<string, number>> {
  void db; // тарифи читаються власними service-клієнтами; db — для симетрії з рештою оцінювачів
  const out = new Map<string, number>();
  const hasRz = orders.some(o => o.channel_code === 'rozetka');
  const hasProm = orders.some(o => o.channel_code === 'prom');
  const [smart, rzDelivery, promDelivery] = await Promise.all([
    hasRz ? getSmartTariff() : null,
    hasRz ? getRozetkaDeliveryTariff() : null,
    hasProm ? getPromDeliveryTariff() : null,
  ]);
  for (const o of orders) {
    const total = Number(o.total_price) || 0;
    let fee = 0;
    if (o.channel_code === 'rozetka' && smart && rzDelivery) {
      const isSmart = Boolean(o.is_smart);
      if (isSmart) fee += computeSmartFee(total, smart);
      if (o.delivery_type === ROZETKA_DELIVERY_TYPE) {
        fee += resolveRozetkaDeliveryFee({ isSmart, actualPrice: Number(o.rz_delivery_price) }, rzDelivery);
      }
    } else if (o.channel_code === 'prom' && promDelivery) {
      if (isPromCheapDelivery({ ps_promotion: o.ps_promotion })) fee += computePromDeliveryFee(total, promDelivery);
    }
    if (fee > 0) out.set(o.id, Math.round(fee * 100) / 100);
  }
  return out;
}

/** Rozetka Smart — фіксований збір за порогами суми ЗАМОВЛЕННЯ; 0, якщо не Smart. */
export async function rozetkaSmartFee(order: OrderForFees): Promise<number> {
  const isSmart = order.channel_code === 'rozetka'
    && Boolean((order.rozetka_data as Record<string, unknown> | null)?.is_smart);
  if (!isSmart) return 0;
  return computeSmartFee(Number(order.total_price) || 0, await getSmartTariff());
}

/** «Дешева доставка» Prom — компенсація організації доставки НП; 0, якщо не діє. */
export async function promCheapDeliveryFee(order: OrderForFees, promData: Record<string, unknown> | null): Promise<number> {
  if (order.channel_code !== 'prom' || !isPromCheapDelivery(promData)) return 0;
  // Тариф — з адмінки (app_settings), НЕ константа: правки цін діють одразу
  return computePromDeliveryFee(Number(order.total_price) || 0, await getPromDeliveryTariff());
}
