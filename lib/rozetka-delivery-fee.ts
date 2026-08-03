/**
 * lib/rozetka-delivery-fee.ts — серверна частина тарифу доставки в точки видачі
 * Rozetka. Дзеркало lib/rozetka-smart.ts: чисті функції лежать окремо, тут лише
 * читання чинного тарифу з app_settings.
 *
 * Тариф зафіксований умовами Rozetka (30 грн, 49 грн із Meest), тож окремого
 * екрана в адмінці немає — ключ існує, щоб змінити суму без деплою, якщо
 * Rozetka перегляне умови.
 */
import { createServiceClient } from './supabase';
import {
  parseRozetkaDeliveryTariff,
  ROZETKA_DELIVERY_TARIFF_KEY,
  type RozetkaDeliveryTariff,
} from './rozetka-delivery-tariff';

export * from './rozetka-delivery-tariff';

export async function getRozetkaDeliveryTariff(): Promise<RozetkaDeliveryTariff> {
  const db = createServiceClient();
  const { data } = await db.from('app_settings').select('value').eq('key', ROZETKA_DELIVERY_TARIFF_KEY).maybeSingle();
  return parseRozetkaDeliveryTariff(data?.value as string | undefined);
}
