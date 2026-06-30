import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return !!(user && user.user_metadata?.role === 'admin');
}

// PATCH: toggle on_prom or update prom_markup_pct for a single product
export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { sku, on_prom, prom_markup_pct } = await req.json();
  if (!sku) return NextResponse.json({ error: 'sku required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (on_prom !== undefined)        update.on_prom        = on_prom;
  if (prom_markup_pct !== undefined) update.prom_markup_pct = prom_markup_pct === '' ? null : Number(prom_markup_pct);

  const { error } = await db.from('products').update(update).eq('sku', sku);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST: bulk toggle on_prom — for all active products, or a specific category
export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { category_slug, on_prom } = await req.json();

  let query = db.from('products').update({ on_prom }).eq('is_active', true);
  if (category_slug) query = query.eq('category_slug', category_slug);

  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
