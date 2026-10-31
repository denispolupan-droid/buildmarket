import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { escapeOrTerm } from '../../../../../lib/pg-filter';
import { requireStaff } from '../../../../../lib/auth-guard';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);
  const term = escapeOrTerm(q);
  // prices=1 — пошук для документів обліку: потрібні оптова ціна й собівартість.
  // Собівартість з браузера читати не можна (міграція 137 закрила price_cost
  // для anon/authenticated), тому модалки ходять сюди, а не напряму в PostgREST.
  const withPrices = req.nextUrl.searchParams.get('prices') === '1';
  const activeOnly = req.nextUrl.searchParams.get('active') === '1';

  let query = serviceClient
    .from('products')
    .select(withPrices
      ? 'sku, name, brand, volume, stock:product_stock(price_unit, price_cost)'
      : 'sku, name, brand, volume')
    .or(`sku.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%`)
    .order('name')
    .limit(15);
  if (activeOnly) query = query.eq('is_active', true);

  const { data } = await query;
  if (!withPrices) return NextResponse.json(data ?? []);

  type Row = {
    sku: string; name: string; brand: string | null; volume: string | null;
    stock: { price_unit: number | null; price_cost: number | null }[] | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).map(p => ({
    sku: p.sku, name: p.name, brand: p.brand, volume: p.volume,
    price_unit: p.stock?.[0]?.price_unit ?? 0,
    price_cost: p.stock?.[0]?.price_cost ?? 0,
  }));
  return NextResponse.json(rows);
}
