/**
 * lib/rozetka-smart.ts — тариф компенсації доставки Rozetka Smart (серверна частина).
 *
 * Rozetka списує фіксований збір з балансу продавця при передачі посилки
 * перевізникові (поза випискою /balances/search — див. звірку 2026-07-28).
 * Пороги — за СУМОЮ ЗАМОВЛЕННЯ, збір разовий на замовлення.
 *
 * Тариф редагується в адмінці (Товари Rozetka → «Умови Smart») і зберігається
 * в app_settings під ключем rozetka_smart_tariff. Діє з моменту збереження:
 * застосовується лише до нових відгрузок, вже проведені списання не чіпаємо.
 * Чисті функції (computeSmartFee тощо) — у lib/rozetka-smart-tariff.ts.
 */
import { createServiceClient } from './supabase';
import { parseSmartTariff, SMART_TARIFF_KEY, type SmartBracket } from './rozetka-smart-tariff';

export * from './rozetka-smart-tariff';

/** Чинний тариф із app_settings (дефолт, якщо не задано/зіпсовано). */
export async function getSmartTariff(): Promise<SmartBracket[]> {
  const db = createServiceClient();
  const { data } = await db.from('app_settings').select('value').eq('key', SMART_TARIFF_KEY).maybeSingle();
  return parseSmartTariff(data?.value as string | undefined);
}
