/**
 * Разово: замовлення НП з Ref відділення, але без назви (delivery_address IS NULL)
 * — дописати назву з довідника НП. Картка й журнал показували лише місто
 * (№26111029 і ще 8 ручних/сайтових замовлень з 01.09.2026).
 *
 *   npx tsx scripts/backfill-np-warehouse-address.mts          — лише показати
 *   npx tsx scripts/backfill-np-warehouse-address.mts --apply  — записати
 *
 * Пише тільки orders.delivery_address і тільки там, де воно порожнє.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const apply = process.argv.includes('--apply');
const { createServiceClient } = await import('../lib/supabase-service');
const { npWarehouseDescription } = await import('../lib/np-api');
const db = createServiceClient();

const { data, error } = await db.from('orders')
  .select('id, order_number, delivery_warehouse_ref')
  .eq('delivery_type', 'nova')
  .not('delivery_warehouse_ref', 'is', null)
  .is('delivery_address', null)
  .order('order_number')
  .limit(200);
if (error) throw error;

for (const o of data ?? []) {
  const desc = await npWarehouseDescription(o.delivery_warehouse_ref as string);
  console.log(o.order_number, '→', desc ?? '(НП не знайшла)');
  if (apply && desc) {
    const { error: e } = await db.from('orders').update({ delivery_address: desc })
      .eq('id', o.id).is('delivery_address', null);
    if (e) console.error('  помилка:', e.message);
  }
}
console.log(apply ? 'Записано.' : 'Пробний прогін — нічого не записано (додайте --apply).');
