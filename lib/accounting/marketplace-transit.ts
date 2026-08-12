import { createServiceClient } from '../supabase';
import { computePromCommission } from '../prom-commission';
import { computeRozetkaCommission } from '../rozetka-commission';

// Комісії «в дорозі»: очікувана комісія по РН-чернетках (посилки відвантажені,
// ще не доставлені → комісія ще НЕ проведена). Площадка спише її при доставці,
// тож прогноз балансу = поточний баланс − ця сума. ЄДИНЕ джерело для екрана
// «Маркетплейси» і картки «Гроші та борги» на «Огляді» — не копіювати.

export type InTransitItem = { docId: string; orderNumber: number | null; ttn: string | null; commission: number };
export type InTransit = { total: number; items: InTransitItem[] };

export async function loadInTransitCommission(marketplace: 'prom' | 'rozetka'): Promise<InTransit> {
  const db = createServiceClient();
  const { data: docs } = await db
    .from('acc_documents')
    .select('id, order_id, tracking_number')
    .eq('doc_type', 'sale')
    .eq('status', 'draft')
    .not('order_id', 'is', null);
  if (!docs?.length) return { total: 0, items: [] };

  const orderIds = [...new Set(docs.map(d => d.order_id))];
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, channel_code')
    .in('id', orderIds)
    .eq('channel_code', marketplace)
    // Скасовані/повернені замовлення НЕ дадуть комісії — їхня чернетка-РН могла
    // лишитись «в дорозі» й фальшиво завищувати очікувану комісію.
    .not('status', 'in', '(cancelled,returned)');
  const orderMap = new Map((orders ?? []).map(o => [o.id, o]));
  const mpDocs = docs.filter(d => orderMap.has(d.order_id));
  if (!mpDocs.length) return { total: 0, items: [] };

  const settingKeys = marketplace === 'prom' ? ['prom_plan', 'prom_commission_pct'] : ['rozetka_commission_pct'];
  const { data: settings } = await db.from('app_settings').select('key, value').in('key', settingKeys);
  const sMap = new Map((settings ?? []).map(s => [s.key, s.value]));
  const plan = (sMap.get('prom_plan') ?? 'single') as 'single' | 'econom';
  const fallbackPct = parseFloat(sMap.get(marketplace === 'prom' ? 'prom_commission_pct' : 'rozetka_commission_pct') ?? (marketplace === 'prom' ? '3' : '15'));

  const items: InTransitItem[] = [];
  let total = 0;
  for (const d of mpDocs) {
    const { data: lines } = await db.from('acc_document_lines').select('sku, qty, price').eq('document_id', d.id);
    const li = (lines ?? []).map(l => ({ sku: l.sku, qty: Number(l.qty), price: Number(l.price) }));
    const commission = marketplace === 'prom'
      ? (await computePromCommission(li, { plan, fallbackPct })).total_commission
      : (await computeRozetkaCommission(li, { fallbackPct })).total_commission;
    const o = orderMap.get(d.order_id)!;
    total += commission;
    items.push({ docId: d.id, orderNumber: o.order_number, ttn: d.tracking_number, commission: Math.round(commission * 100) / 100 });
  }
  return { total: Math.round(total * 100) / 100, items };
}
