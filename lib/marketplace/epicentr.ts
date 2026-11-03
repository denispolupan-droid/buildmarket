import { epicentrOrderToOurFormat, EPICENTR_CANCELLED, type EpicentrOrder } from '../epicentr-api';
import { computeEpicentrCommission } from '../epicentr-commission';
import type { MarketplaceAdapter, MappedItem } from './adapter';

export function epicentrAdapter(settings: { fallbackPct: number }): MarketplaceAdapter<EpicentrOrder> {
  return {
    code: 'epicentr',
    idColumn: 'epicentr_order_id',
    dataColumn: 'epicentr_data',
    externalId: o => o.id,
    label: o => o.number,
    cancelledOnImport: o => EPICENTR_CANCELLED.includes(o.statusCode) || o.statusCode === 'canceled_by_merchant',
    mapOrder: o => epicentrOrderToOurFormat(o),
    snapshot: o => o as unknown as Record<string, unknown>,
    estimateCommission: (items: MappedItem[]) => computeEpicentrCommission(items, settings),
  };
}
