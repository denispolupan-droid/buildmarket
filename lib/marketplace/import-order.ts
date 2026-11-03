import { findCustomerIdByPhone } from '../customers';
import { createServiceClient, asJson, type TableInsert } from '../supabase-service';
import { log } from '../log';
import type { MarketplaceAdapter } from './adapter';
import { stageMarketplaceImport } from './staging';

type Db = ReturnType<typeof createServiceClient>;

export type ImportResult =
  | { status: 'created'; orderId: string; customerId: string | null }
  | { status: 'exists'; orderId: string }
  | { status: 'skipped'; reason: 'cancelled' }
  | { status: 'error'; error: string };

/**
 * Імпорт нового замовлення площадки в orders — спільний для всіх адаптерів
 * (раніше три ідентичні блоки в prom/rozetka/epicentr-sync):
 *  1. ще раз перевіряємо, чи нема рядка з таким externalId (гонка двох кронів —
 *     unique-індекси на *_order_id і так не пустять дубль, але так не буде
 *     помилки в логах і зайвого клієнта);
 *  2. клієнт — за нормалізованим телефоном (lib/customers), інакше новий retail;
 *  3. вставляємо замовлення зі статусом new, знімком payload і _commission;
 *  4. перша зустріч (created/skipped/error) лягає в staging marketplace_orders
 *     із сирим payload — слід для розбору й повторного імпорту (міграція 153).
 */
export async function importMarketplaceOrder<Raw>(db: Db, adapter: MarketplaceAdapter<Raw>, raw: Raw): Promise<ImportResult> {
  const result = await importOnce(db, adapter, raw);
  await stageMarketplaceImport(db, adapter, raw, result);
  return result;
}

async function importOnce<Raw>(db: Db, adapter: MarketplaceAdapter<Raw>, raw: Raw): Promise<ImportResult> {
  const externalId = adapter.externalId(raw);
  const { data: existing } = await db.from('orders').select('id').eq(adapter.idColumn, externalId as never).maybeSingle();
  if (existing) return { status: 'exists', orderId: existing.id };
  if (adapter.cancelledOnImport(raw)) return { status: 'skipped', reason: 'cancelled' };

  const mapped = adapter.mapOrder(raw);
  const commission = await adapter.estimateCommission(mapped.items);
  const snapshot = { ...adapter.snapshot(raw), _commission: commission };

  let customerId: string | null = null;
  if (mapped.phone) customerId = await findCustomerIdByPhone(db, mapped.phone);
  if (!customerId) {
    const { data: newCust, error: custErr } = await db
      .from('customers')
      .insert({
        name: mapped.contact, phone: mapped.phone || null, email: mapped.email || null,
        type: 'retail', price_tier: 'retail', is_active: true,
        orders_count: 0, total_revenue: 0, balance: 0, balance_held: 0, meta: {},
      })
      .select('id')
      .single();
    if (custErr) log.warn('mp.import.customer_failed', { mp: adapter.code, externalId, err: custErr.message });
    customerId = newCust?.id ?? null;
  }

  // Колонки площадки обчислювані — типізований insert їх не виводить, тому збираємо
  // рядок окремо; набір колонок той самий, що був у трьох синках.
  const channelCols = { [adapter.idColumn]: externalId, [adapter.dataColumn]: asJson(snapshot) } as unknown as Partial<TableInsert<'orders'>>;
  const row: TableInsert<'orders'> = {
    ...channelCols,
    customer_id:            customerId,
    contact:                mapped.contact,
    phone:                  mapped.phone,
    email:                  mapped.email,
    delivery_type:          mapped.delivery_type,
    delivery_subtype:       mapped.delivery_subtype ?? null,
    delivery_address:       mapped.delivery_address ?? null,
    delivery_city_ref:      mapped.delivery_city_ref ?? null,
    delivery_city_name:     mapped.delivery_city_name ?? null,
    delivery_warehouse_ref: mapped.delivery_warehouse_ref ?? null,
    payment_type:           mapped.payment_type,
    payment_confirmed:      mapped.paid,
    amount_paid:            mapped.paid ? mapped.total_price : 0,
    price_type:             'retail',
    comment:                mapped.comment,
    items:                  asJson(mapped.items),
    total_price:            mapped.total_price,
    status:                 'new',
    channel_code:           adapter.code,
  };
  const { data: inserted, error } = await db.from('orders').insert(row).select('id').single();

  if (error) {
    log.error('mp.import.failed', { mp: adapter.code, externalId, label: adapter.label(raw), err: error.message });
    return { status: 'error', error: error.message };
  }
  log.info('mp.import.created', { mp: adapter.code, externalId, orderId: inserted.id, total: mapped.total_price, items: mapped.items.length });
  return { status: 'created', orderId: inserted.id, customerId };
}
