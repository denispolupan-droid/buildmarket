// Перерозмітка вже імпортованих замовлень із доставкою в точки видачі Rozetka.
//
// Маппер визначає тип доставки лише при створенні рядка, тож замовлення, які
// приїхали до появи підтримки Octopus, лежать із delivery_type='courier' і
// адресою виду «Відділення № (ЖК Ok'Land)» — там place_number це орієнтир, а не
// номер відділення. Беремо збережений rozetka_data, звідки все й приїхало, і
// перескладаємо ті самі поля тим самим кодом, що й маппер.
//
// Запуск:
//   npx tsx --env-file=.env.local scripts/supabase/backfill-rozetka-delivery.mts          — сухий прогін
//   npx tsx --env-file=.env.local scripts/supabase/backfill-rozetka-delivery.mts --apply
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, existsSync } from 'fs';
import * as delNS from '../../lib/rozetka-delivery';
const D = (delNS as unknown as { default: typeof delNS }).default ?? delNS;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes('--apply');

function freeBackupPath(base: string): string {
  if (!existsSync(base)) return base;
  for (let i = 2; ; i++) {
    const p = base.replace(/\.json$/, `.${i}.json`);
    if (!existsSync(p)) return p;
  }
}

type Row = {
  id: string; order_number: number; delivery_type: string | null;
  delivery_address: string | null; delivery_subtype: string | null;
  rozetka_data: Record<string, unknown> | null;
};

const { data, error } = await db.from('orders')
  .select('id, order_number, delivery_type, delivery_address, delivery_subtype, rozetka_data')
  .eq('channel_code', 'rozetka');
if (error) throw error;

const changes: { row: Row; type: string; address: string }[] = [];
for (const r of (data ?? []) as Row[]) {
  const del = r.rozetka_data?.delivery as Record<string, unknown> | null | undefined;
  if (!D.isRozetkaDelivery(del as { delivery_service_id?: number } | null)) continue;
  const city = ((del?.city as Record<string, unknown> | undefined)?.city_name
    ?? (del?.city as Record<string, unknown> | undefined)?.title ?? '') as string;
  const address = D.rozetkaPickupAddress(del as never, city);
  if (r.delivery_type === D.ROZETKA_DELIVERY_TYPE && r.delivery_address === address) continue;
  changes.push({ row: r, type: D.ROZETKA_DELIVERY_TYPE, address });
}

console.log(`замовлень Rozetka: ${data?.length} · у точки видачі: ${changes.length} потребують перерозмітки\n`);
for (const c of changes) {
  console.log(`  №${c.row.order_number}`);
  console.log(`     тип:    «${c.row.delivery_type}» → «${c.type}»`);
  console.log(`     адреса: «${c.row.delivery_address}»`);
  console.log(`             «${c.address}»`);
}

if (!changes.length) { console.log('нічого робити'); process.exit(0); }
if (!APPLY) { console.log('\nсухий прогін. для запису — прапорець --apply'); process.exit(0); }

const backupPath = freeBackupPath('scripts/supabase/backfill-rozetka-delivery.backup.json');
writeFileSync(backupPath, JSON.stringify(changes.map(c => ({
  id: c.row.id, delivery_type: c.row.delivery_type,
  delivery_address: c.row.delivery_address, delivery_subtype: c.row.delivery_subtype,
})), null, 2));
console.log(`\nбекап: ${backupPath}`);

for (const c of changes) {
  const { error: e } = await db.from('orders')
    .update({ delivery_type: c.type, delivery_address: c.address, delivery_subtype: null })
    .eq('id', c.row.id);
  if (e) throw new Error(`${c.row.order_number}: ${e.message}`);
}
console.log(`оновлено ${changes.length} замовлень`);
