import { createClient } from '@supabase/supabase-js';

export interface RozetkaCommissionItem {
  sku:            string;
  item_total:     number;
  commission_pct: number;
  commission_amt: number;
  category_slug:  string | null;
}

export interface RozetkaCommissionResult {
  total_commission: number;
  net_revenue:      number;
  items:            RozetkaCommissionItem[];
}

export async function computeRozetkaCommission(
  orderItems: { sku: string; qty: number; price: number }[],
  opts: { fallbackPct: number },
): Promise<RozetkaCommissionResult> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const skus = orderItems.map(i => i.sku).filter(Boolean);

  const { data: products } = await db
    .from('products')
    .select('sku, category_slug, categories(rozetka_commission_pct)')
    .in('sku', skus);

  const catMap = new Map<string, { pct: number; slug: string | null }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((products ?? []) as any[]).map((p: any) => {
      const raw = p.categories?.rozetka_commission_pct;
      const pct = raw != null ? parseFloat(String(raw)) : NaN;
      return [p.sku, { pct: isNaN(pct) ? opts.fallbackPct : pct, slug: p.category_slug }];
    }),
  );

  let totalCommission = 0;
  const items: RozetkaCommissionItem[] = orderItems.map(item => {
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
