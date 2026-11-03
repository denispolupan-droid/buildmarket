import { rozetkaOrderToOurFormat, type RozetkaOrder } from '../rozetka-api';
import { computeRozetkaCommission } from '../rozetka-commission';
import { createServiceClient } from '../supabase-service';
import type { MarketplaceAdapter, MappedItem } from './adapter';

/** Фолбек-ставка Rozetka (для SKU без ставки категорії) з app_settings. */
export async function getRozetkaFallbackPct(db: ReturnType<typeof createServiceClient>): Promise<number> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle();
  return parseFloat(data?.value ?? '15');
}

export function rozetkaAdapter(settings: { fallbackPct: number }): MarketplaceAdapter<RozetkaOrder> {
  return {
    code: 'rozetka',
    idColumn: 'rozetka_order_id',
    dataColumn: 'rozetka_data',
    externalId: o => o.id,
    label: o => String(o.id),
    // Групи 2/3 (виконані/скасовані) синк тягне лише для освіження плашки і
    // відсіває сам до імпорту; на рівні адаптера скасованих у групі 1 немає.
    cancelledOnImport: () => false,
    mapOrder: o => rozetkaOrderToOurFormat(o),
    snapshot: o => o as unknown as Record<string, unknown>,
    estimateCommission: (items: MappedItem[]) => computeRozetkaCommission(items, settings),
  };
}
