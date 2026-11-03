import { asJson, createServiceClient, type TableInsert } from '../supabase-service';
import { log } from '../log';
import type { MarketplaceAdapter } from './adapter';
import type { ImportResult } from './import-order';

type Db = ReturnType<typeof createServiceClient>;

/**
 * Staging імпорту (аудит 31.10, п. 17; міграція 153): перша зустріч замовлення
 * площадки лягає в marketplace_orders із сирим payload і результатом. Це слід
 * для розбору («чому не завелось?») і матеріал для повторного імпорту з того ж
 * payload. «exists» сюди не пишемо: крон бачить ті самі замовлення щотику.
 *
 * Помилка staging не має ламати імпорт — лише warn у лог.
 */
export async function stageMarketplaceImport<Raw>(
  db: Db,
  adapter: MarketplaceAdapter<Raw>,
  raw: Raw,
  result: ImportResult,
): Promise<void> {
  if (result.status === 'exists') return;
  const mapped = safeMap(adapter, raw);
  const row: TableInsert<'marketplace_orders'> = {
    marketplace:        adapter.code,
    external_order_id:  String(adapter.externalId(raw)),
    external_order_num: adapter.label(raw),
    our_order_id:       result.status === 'created' ? result.orderId : null,
    buyer_name:         mapped?.contact ?? null,
    buyer_phone:        mapped?.phone ?? null,
    buyer_email:        mapped?.email ?? null,
    delivery_city:      mapped?.delivery_city_name ?? null,
    delivery_address:   mapped?.delivery_address ?? null,
    total_amount:       mapped?.total_price ?? null,
    status_external:    rawStatus(raw),
    status_mapped:      result.status === 'created' ? 'new' : null,
    result:             result.status,
    processing_error:   result.status === 'error' ? result.error : result.status === 'skipped' ? result.reason : null,
    processed_at:       new Date().toISOString(),
    raw_payload:        asJson(raw),
  };
  try {
    const { error } = await db
      .from('marketplace_orders')
      .upsert(row, { onConflict: 'marketplace,external_order_id' });
    if (error) log.warn('mp.staging.failed', { mp: adapter.code, externalId: row.external_order_id, err: error.message });
  } catch (err) {
    log.warn('mp.staging.failed', { mp: adapter.code, externalId: row.external_order_id, err: err instanceof Error ? err.message : String(err) });
  }
}

function rawStatus(raw: unknown): string {
  const v = (raw as Record<string, unknown> | null)?.status;
  return v == null ? '' : String(v);
}

function safeMap<Raw>(adapter: MarketplaceAdapter<Raw>, raw: Raw) {
  try { return adapter.mapOrder(raw); } catch { return null; }
}
