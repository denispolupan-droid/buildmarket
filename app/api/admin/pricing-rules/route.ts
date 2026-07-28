import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { computeMarketplacePrice, type PricingRule, type PriceTarget } from '../../../../lib/pricing-rules';

export const runtime = 'nodejs';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Marketplace = 'rozetka' | 'prom';

/** Поточна ціна у фіді — стара модель: собівартість × (1+націнка) / (1−комісія), крок 5. */
function legacyPrice(cost: number, markupPct: number, commissionPct: number): number {
  const withMarkup = cost * (1 + markupPct / 100);
  const withComm = commissionPct > 0 ? withMarkup / (1 - commissionPct / 100) : withMarkup;
  return Math.ceil(withComm / 5) * 5;
}

/**
 * GET ?marketplace=rozetka — попередній перегляд: що станеться з кожною ціною.
 * НІЧОГО не змінює: фіди досі рахують ціну по-старому, поки модель не увімкнена.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const marketplace = (req.nextUrl.searchParams.get('marketplace') ?? 'rozetka') as Marketplace;
  const onField = marketplace === 'rozetka' ? 'on_rozetka' : 'on_prom';

  const [{ data: rulesRaw }, { data: cats }, products] = await Promise.all([
    serviceClient.from('pricing_rules').select('*').eq('is_active', true),
    serviceClient.from('categories').select('slug, name, rozetka_commission_pct, prom_commission_pct'),
    fetchAllRows<{
      sku: string; name: string; brand: string; category_slug: string | null;
      on_rozetka: boolean | null; on_prom: boolean | null; min_price: number | null;
      rozetka_markup_pct: number | null; prom_markup_pct: number | null;
      product_stock: { price_cost: number | null; price_retail: number | null }
        | { price_cost: number | null; price_retail: number | null }[] | null;
    }>((from, to) => serviceClient.from('products')
      .select('sku, name, brand, category_slug, on_rozetka, on_prom, min_price, rozetka_markup_pct, prom_markup_pct, product_stock(price_cost, price_retail)')
      .eq('is_active', true)
      .range(from, to)),
  ]);

  const rules = (rulesRaw ?? []) as PricingRule[];
  const commissionOf = new Map<string, number>();
  const catName = new Map<string, string>();
  for (const c of cats ?? []) {
    catName.set(c.slug, c.name);
    const pct = marketplace === 'rozetka' ? c.rozetka_commission_pct : c.prom_commission_pct;
    if (pct != null) commissionOf.set(c.slug, Number(pct));
  }

  const rows = [];
  for (const p of products) {
    if (!p[onField]) continue;
    const stock = Array.isArray(p.product_stock) ? p.product_stock[0] : p.product_stock;
    const cost = Number(stock?.price_cost ?? 0);
    if (!(cost > 0)) continue;

    const commissionPct = commissionOf.get(p.category_slug ?? '') ?? 0;
    const target: PriceTarget = {
      sku: p.sku, brand: p.brand, category_slug: p.category_slug,
      cost, commissionPct, minPrice: p.min_price,
    };
    const next = computeMarketplacePrice(target, rules, marketplace);

    const oldMarkup = Number(
      (marketplace === 'rozetka' ? p.rozetka_markup_pct : p.prom_markup_pct) ?? 0,
    );
    const before = legacyPrice(cost, oldMarkup, commissionPct);
    const beforeProfit = Math.round((before * (1 - commissionPct / 100) - cost) * 100) / 100;

    rows.push({
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: catName.get(p.category_slug ?? '') ?? '',
      cost,
      commissionPct,
      before,
      after: next.price,
      changePct: before > 0 ? Math.round(((next.price - before) / before) * 100) : 0,
      profitBefore: beforeProfit,
      profitAfter: next.profit,
      driver: next.driver,
      excluded: next.excluded,
    });
  }

  rows.sort((a, b) => b.changePct - a.changePct);

  const totals = rows.reduce((acc, r) => {
    acc.count++;
    acc.profitBefore += r.profitBefore;
    acc.profitAfter += r.profitAfter;
    if (r.excluded) acc.excluded++;
    else if (r.changePct > 50) acc.over50++;
    else if (r.changePct > 30) acc.over30++;
    else if (r.changePct > 15) acc.over15++;
    else acc.upTo15++;
    return acc;
  }, { count: 0, profitBefore: 0, profitAfter: 0, excluded: 0, over50: 0, over30: 0, over15: 0, upTo15: 0 });

  return NextResponse.json({
    marketplace,
    rules,
    totals: {
      ...totals,
      profitBefore: Math.round(totals.profitBefore),
      profitAfter: Math.round(totals.profitAfter),
    },
    rows,
  });
}

/** PATCH — редагування правила (лише поля моделі, ключі правила не міняємо). */
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json() as Record<string, unknown>;
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ['markup_pct', 'min_profit_uah', 'min_price_uah', 'round_step'] as const) {
    if (!(f in body)) continue;
    if (body[f] === null || body[f] === '') { update[f] = null; continue; }
    const n = Number(body[f]);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: `Некоректне значення ${f}` }, { status: 400 });
    }
    update[f] = n;
  }
  for (const f of ['exclude_single', 'is_active'] as const) {
    if (f in body) update[f] = Boolean(body[f]);
  }
  if ('note' in body) update.note = String(body.note ?? '').slice(0, 300);

  const { error } = await serviceClient.from('pricing_rules').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
