/**
 * Бекфіл контрагентів: замовлення сайту без customer_id → знайти/створити
 * запис у customers (той самий хелпер, що тепер працює в чекауті) і прив'язати.
 *
 * Використання:
 *   npx tsx --env-file=.env.local scripts/backfill-order-customers.ts          # dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-order-customers.ts --apply
 */
import { createServiceClient } from '../lib/supabase';
import { findOrCreateCustomerForOrder } from '../lib/customers';

const APPLY = process.argv.includes('--apply');

async function main() {
  const db = createServiceClient();

  const { data: orders, error } = await db
    .from('orders')
    .select('id, order_number, contact, company, phone, email, user_id, channel_code')
    .is('customer_id', null)
    .neq('channel_code', 'dropship')   // дроп-замовлення прив'язані до партнера через partner_code
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) throw error;

  const list = (orders ?? []).filter(o => o.contact || o.phone || o.email);
  console.log(`Замовлень без контрагента: ${orders?.length ?? 0}, до прив'язки: ${list.length}\n`);

  let linked = 0;
  for (const o of list) {
    console.log(`  #${o.order_number} [${o.channel_code}] ${o.company ?? ''} ${o.contact} · ${o.phone ?? '—'} · ${o.email ?? '—'}`);
    if (!APPLY) continue;

    const customerId = await findOrCreateCustomerForOrder({
      contact:    o.contact,
      company:    o.company,
      phone:      o.phone,
      email:      o.email,
      authUserId: o.user_id,
    });
    if (!customerId) { console.log('    ✗ не вдалось створити контрагента'); continue; }

    const { error: updErr } = await db.from('orders').update({ customer_id: customerId }).eq('id', o.id);
    if (updErr) { console.log(`    ✗ ${updErr.message}`); continue; }
    linked++;
    console.log(`    ✓ прив'язано → ${customerId}`);
  }

  if (!APPLY) console.log('\nDry-run. Запустіть з --apply для прив\'язки.');
  else console.log(`\nГотово: прив'язано ${linked} з ${list.length}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
