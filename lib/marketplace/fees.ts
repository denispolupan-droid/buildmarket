import { getPromOrder } from '../prom-api';
import { computePromCommission } from '../prom-commission';
import { computeRozetkaCommission } from '../rozetka-commission';
import { computeSmartFee, getSmartTariff } from '../rozetka-smart';
import { computePromDeliveryFee, getPromDeliveryTariff, isPromCheapDelivery } from '../prom-delivery';
import { computeEpicentrCommission, getEpicentrFallbackPct } from '../epicentr-commission';
import { getEpicentrBillingInvoice } from '../epicentr-api';
import { createServiceClient, asJson } from '../supabase-service';
import { log } from '../log';
import { getPromCommissionSettings } from './prom';
import { getRozetkaFallbackPct } from './rozetka';
import type { MarketplaceCode, MappedItem } from './adapter';

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
