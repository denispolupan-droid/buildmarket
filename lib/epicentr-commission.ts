/**
 * Розрахунок комісії Епіцентру по позиціях замовлення.
 *
 * Модель — плоска ставка категорії (categories.epicentr_commission_pct) з
 * fallback на app_settings.epicentr_commission_pct. Тарифи Епіцентру задаються
 * категорією товару в їхньому дереві («Правила роботи маркетплейсу»), тож
 * категорійна ставка тут — оцінка. ФАКТ дає /v1/billing/orders/{id}/invoice
 * (див. getEpicentrBillingInvoice) — при проведенні комісії він має пріоритет.
 */
import { createClient } from '@supabase/supabase-js';
import type { CommissionItem } from './prom-commission';

export const EPICENTR_COMMISSION_FALLBACK_KEY = 'epicentr_commission_pct';
export const EPICENTR_COMMISSION_DEFAULT_PCT = 12;

export interface EpicentrCommissionResult {
  total_commission: number;
  net_revenue:      number;
  items:            CommissionItem[];
}

export async function computeEpicentrCommission(
  orderItems: { sku: string; qty: number; price: number }[],
  opts: { fallbackPct: number },
): Promise<EpicentrCommissionResult> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const skus = orderItems.map(i => i.sku).filter(Boolean);
  const { data: products } = skus.length
    ? await db.from('products').select('sku, category_slug, categories(epicentr_commission_pct)').in('sku', skus)
    : { data: [] as unknown[] };

  const catMap = new Map<string, { pct: number; slug: string | null }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((products ?? []) as any[]).map((p: any) => {
      const raw = p.categories?.epicentr_commission_pct;
      const pct = raw != null ? parseFloat(String(raw)) : NaN;
      return [p.sku, { pct: isNaN(pct) ? opts.fallbackPct : pct, slug: p.category_slug }];
    }),
  );

  let totalCommission = 0;
  const items: CommissionItem[] = orderItems.map(item => {
    const { pct, slug } = catMap.get(item.sku) ?? { pct: opts.fallbackPct, slug: null };
    const item_total     = item.qty * item.price;
    const commission_amt = Math.round(item_total * pct) / 100;
    totalCommission += commission_amt;
    return { sku: item.sku, item_total, commission_pct: pct, commission_amt, category_slug: slug };
  });

  const order_total = orderItems.reduce((s, i) => s + i.qty * i.price, 0);
  return {
    total_commission: Math.round(totalCommission * 100) / 100,
    net_revenue:      Math.round((order_total - totalCommission) * 100) / 100,
    items,
  };
}

/** Fallback-ставка з app_settings (дефолт — EPICENTR_COMMISSION_DEFAULT_PCT). */
export async function getEpicentrFallbackPct(db: { from: (t: string) => any }): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await db.from('app_settings').select('value').eq('key', EPICENTR_COMMISSION_FALLBACK_KEY).maybeSingle();
  const n = parseFloat((data as { value?: string } | null)?.value ?? '');
  return Number.isFinite(n) ? n : EPICENTR_COMMISSION_DEFAULT_PCT;
}
