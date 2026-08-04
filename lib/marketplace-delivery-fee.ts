/**
 * lib/marketplace-delivery-fee.ts — ОЦІНКА збору маркетплейсу за доставку для
 * економіки замовлення в адмінці. Чистий модуль без серверних імпортів.
 *
 * Це не новий розрахунок, а дзеркало того, що бухгалтерія проведе фактично:
 *   · Rozetka Smart          → lib/rozetka-smart-tariff (ship route + completion)
 *   · точка видачі Rozetka   → lib/rozetka-delivery-tariff (ship route)
 *   · «Дешева доставка» Prom → lib/prom-delivery-fee (completion)
 * Формули беремо з тих самих модулів — жодних локальних копій, інакше екран
 * показував би одне, а з балансу списувалось інше.
 *
 * Показуємо ЛИШЕ до проведення РН: у факті ці збори вже сидять усередині
 * fact.commission (див. fulfillment route), і другий рядок задвоїв би витрату.
 *
 * Smart і збір за видачу взаємовиключні: у Smart-замовленні Rozetka бере
 * компенсацію Smart ЗАМІСТЬ збору за організацію видачі — саме тому
 * resolveRozetkaDeliveryFee для Smart віддає нуль.
 */
import { computeSmartFee, type SmartBracket } from './rozetka-smart-tariff';
import { resolveRozetkaDeliveryFee, type RozetkaDeliveryTariff } from './rozetka-delivery-tariff';
import { computePromDeliveryFee, isPromCheapDelivery, type PromDeliveryBracket } from './prom-delivery-fee';
import { ROZETKA_DELIVERY_TYPE } from './rozetka-delivery';

export type MarketplaceFeeTariffs = {
  smart?: SmartBracket[];
  rozetkaDelivery?: RozetkaDeliveryTariff;
  promDelivery?: PromDeliveryBracket[];
};

export type MarketplaceDeliveryFee = {
  amount: number;
  label: string;
  /** Пояснення для тултипа: звідки взялася сума. */
  hint: string;
};

export type FeeOrderShape = {
  channel_code?: string | null;
  delivery_type?: string | null;
  total_price?: number | null;
  rozetka_data?: Record<string, unknown> | null;
  prom_data?: Record<string, unknown> | null;
};

export function estimateMarketplaceDeliveryFee(
  order: FeeOrderShape,
  tariffs: MarketplaceFeeTariffs = {},
): MarketplaceDeliveryFee | null {
  const total = Number(order.total_price) || 0;

  if (order.channel_code === 'rozetka') {
    const rz = order.rozetka_data ?? {};
    const isSmart = Boolean(rz.is_smart);

    if (isSmart) {
      const amount = computeSmartFee(total, tariffs.smart);
      return amount > 0 ? {
        amount,
        label: 'Rozetka Smart — доставка',
        hint: `Компенсація доставки Smart за сумою замовлення (${total.toFixed(0)} ₴). Списується з балансу при передачі перевізникові.`,
      } : null;
    }

    if (order.delivery_type === ROZETKA_DELIVERY_TYPE) {
      // Фактичну суму Rozetka повідомляє в накладній — вона авторитетніша за тариф.
      const actual = Number(rz._rz_delivery_price);
      const amount = resolveRozetkaDeliveryFee(
        { isSmart: false, actualPrice: Number.isFinite(actual) ? actual : null },
        tariffs.rozetkaDelivery,
      );
      return amount > 0 ? {
        amount,
        label: 'Доставка в точку видачі',
        hint: Number.isFinite(actual) && actual > 0
          ? `Фактична сума з накладної Rozetka. Списується з логістичного балансу.`
          : `За тарифом організації видачі — накладної ще немає, тож сума попередня.`,
      } : null;
    }
    return null;
  }

  if (order.channel_code === 'prom' && isPromCheapDelivery(order.prom_data)) {
    const amount = computePromDeliveryFee(total, tariffs.promDelivery);
    return amount > 0 ? {
      amount,
      label: 'Дешева доставка Prom',
      hint: `Компенсація організації доставки НП за сумою замовлення (${total.toFixed(0)} ₴). Prom списує її після вручення посилки; невикуп — не списує.`,
    } : null;
  }

  return null;
}
