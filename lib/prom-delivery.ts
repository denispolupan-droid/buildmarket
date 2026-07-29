/**
 * lib/prom-delivery.ts — серверна частина тарифу «дешевої доставки» Prom
 * (дзеркало lib/rozetka-smart.ts). Чисті функції — у lib/prom-delivery-fee.ts.
 */
import { createServiceClient } from './supabase';
import { parsePromDeliveryTariff, PROM_DELIVERY_TARIFF_KEY, type PromDeliveryBracket } from './prom-delivery-fee';

export * from './prom-delivery-fee';

/** Чинний тариф із app_settings (дефолт, якщо не задано/зіпсовано). */
export async function getPromDeliveryTariff(): Promise<PromDeliveryBracket[]> {
  const db = createServiceClient();
  const { data } = await db.from('app_settings').select('value').eq('key', PROM_DELIVERY_TARIFF_KEY).maybeSingle();
  return parsePromDeliveryTariff(data?.value as string | undefined);
}
