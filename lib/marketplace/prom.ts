import { promOrderToOurFormat, type PromOrder } from '../prom-api';
import { computePromCommission } from '../prom-commission';
import { createServiceClient } from '../supabase-service';
import type { MarketplaceAdapter, MappedItem } from './adapter';

/** Налаштування Prom з app_settings — читаються раз на прогін синку. */
export async function getPromCommissionSettings(db: ReturnType<typeof createServiceClient>): Promise<{ plan: 'single' | 'econom'; fallbackPct: number }> {
  const [{ data: planRow }, { data: fbRow }] = await Promise.all([
    db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
    db.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle(),
  ]);
  return { plan: (planRow?.value ?? 'single') as 'single' | 'econom', fallbackPct: parseFloat(fbRow?.value ?? '3') };
}

export function promAdapter(settings: { plan: 'single' | 'econom'; fallbackPct: number }): MarketplaceAdapter<PromOrder> {
  return {
    code: 'prom',
    idColumn: 'prom_order_id',
    dataColumn: 'prom_data',
    externalId: o => o.id,
    label: o => String(o.id),
    cancelledOnImport: o => ['declined', 'cancelled', 'cancelled_by_client'].includes(o.status),
    mapOrder: o => promOrderToOurFormat(o),
    snapshot: o => promOrderToOurFormat(o).prom_data as unknown as Record<string, unknown>,
    estimateCommission: (items: MappedItem[]) => computePromCommission(items, settings),
  };
}
