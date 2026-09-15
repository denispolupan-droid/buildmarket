/**
 * Дропшип-замовлення, створені до 15.09.2026: кабінет не ставив payment_confirmed /
 * amount_paid (у журналі — «не оплачено», хоча закупку списано з балансу партнера)
 * і зберігав назву з брендом спереду («Tangit Нитка Tangit…»).
 *
 *   npx tsx --env-file=.env.local scripts/fix-dropship-order-paid.mts          # план
 *   npx tsx --env-file=.env.local scripts/fix-dropship-order-paid.mts --apply  # з бекапом
 */
import { writeFileSync } from 'node:fs';
import * as supabaseNS from '../lib/supabase';
import * as orderNS from '../lib/dropship-order';
type Mod<T> = T & { default?: T };
const { createServiceClient } = ((supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS);
const { dropshipItemName } = ((orderNS as Mod<typeof orderNS>).default ?? orderNS);

const apply = process.argv.includes('--apply');
const db = createServiceClient();

const { data: orders } = await db
  .from('orders')
  .select('id, order_number, status, payment_confirmed, amount_paid, items')
  .eq('channel_code', 'dropship')
  .neq('status', 'cancelled')
  .order('created_at')
  .limit(500);

type Item = { sku: string; name: string; brand?: string; qty: number; price: number; cost_price?: number };
const plan: { id: string; order_number: number; before: unknown; after: { payment_confirmed: boolean; amount_paid: number; items: Item[] } }[] = [];

for (const o of orders ?? []) {
  const items = (o.items ?? []) as Item[];
  const { data: charges } = await db.from('partner_balance_transactions').select('amount').eq('order_id', o.id).eq('tx_type', 'charge');
  const charged = Math.round(-(charges ?? []).reduce((s, c) => s + Number(c.amount), 0) * 100) / 100;
  if (!(charged > 0)) continue;   // без списання з балансу — не чіпаємо

  const skus = items.map(i => i.sku);
  const { data: products } = await db.from('products').select('sku, name, brand, volume').in('sku', skus);
  const pMap = new Map((products ?? []).map(p => [p.sku, p]));
  const fixedItems = items.map(i => {
    const p = pMap.get(i.sku);
    return p ? { ...i, name: dropshipItemName({ name: p.name, brand: p.brand ?? '', volume: p.volume ?? null }) } : i;
  });

  const needs = !o.payment_confirmed || Number(o.amount_paid) !== charged || JSON.stringify(fixedItems) !== JSON.stringify(items);
  if (needs) plan.push({ id: o.id, order_number: o.order_number, before: o, after: { payment_confirmed: true, amount_paid: charged, items: fixedItems } });
}

console.log(JSON.stringify(plan.map(p => ({ order: p.order_number, after: { ...p.after, items: p.after.items.map(i => i.name) } })), null, 2));
if (!apply) { console.log('\nПлан. Для застосування: --apply'); process.exit(0); }

const backup = `scripts/.fix-dropship-order-paid-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(backup, JSON.stringify(plan, null, 2));
console.log('Бекап:', backup);
for (const p of plan) {
  const { error } = await db.from('orders').update(p.after).eq('id', p.id);
  console.log(error ? `✗ #${p.order_number}: ${error.message}` : `✓ #${p.order_number}`);
}
