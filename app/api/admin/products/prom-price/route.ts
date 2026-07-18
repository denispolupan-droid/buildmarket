import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return !!(user && user.app_metadata?.role === 'admin');
}

export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sku, prom_markup_pct, price_wholesale } = await req.json() as {
    sku:             string;
    prom_markup_pct?: number | null;
    price_wholesale?: number | null;
  };

  if (!sku) return NextResponse.json({ error: 'sku required' }, { status: 400 });

  const [productRes, stockRes] = await Promise.all([
    prom_markup_pct !== undefined
      ? db.from('products').update({ prom_markup_pct }).eq('sku', sku)
      : Promise.resolve({ error: null }),
    price_wholesale !== undefined
      ? db.from('product_stock').update({ price_wholesale }).eq('sku', sku)
      : Promise.resolve({ error: null }),
  ]);

  if (productRes.error) return NextResponse.json({ error: productRes.error.message }, { status: 500 });
  if (stockRes.error)   return NextResponse.json({ error: stockRes.error.message },   { status: 500 });

  return NextResponse.json({ ok: true });
}
