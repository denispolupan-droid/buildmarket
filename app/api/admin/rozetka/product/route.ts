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

export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { sku, on_rozetka, rozetka_markup_pct, rozetka_name } = await req.json();
  if (!sku) return NextResponse.json({ error: 'sku required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (on_rozetka !== undefined)         update.on_rozetka         = on_rozetka;
  if (rozetka_markup_pct !== undefined) update.rozetka_markup_pct = rozetka_markup_pct === '' ? null : Number(rozetka_markup_pct);
  if (rozetka_name !== undefined)       update.rozetka_name       = rozetka_name === '' ? null : rozetka_name;

  const { error } = await db.from('products').update(update).eq('sku', sku);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Bulk update: by category slug, or all active products if no category_slug
export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { category_slug, on_rozetka } = await req.json();

  let query = db.from('products').update({ on_rozetka }).eq('is_active', true);
  if (category_slug) query = query.eq('category_slug', category_slug);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
