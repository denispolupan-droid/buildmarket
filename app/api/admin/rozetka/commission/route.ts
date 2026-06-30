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

  const { slug, commission_pct, markup_pct, rozetka_category_id, rozetka_category_name, rozetka_commission_rz_id, rozetka_commission_label } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (commission_pct !== undefined)            update.rozetka_commission_pct   = commission_pct === '' ? null : Number(commission_pct);
  if (markup_pct !== undefined)                update.rozetka_markup_pct       = markup_pct === '' ? null : Number(markup_pct);
  if (rozetka_category_id !== undefined)       update.rozetka_category_id      = rozetka_category_id || null;
  if (rozetka_category_name !== undefined)     update.rozetka_category_name    = rozetka_category_name || null;
  if (rozetka_commission_rz_id !== undefined)  update.rozetka_commission_rz_id = rozetka_commission_rz_id || null;
  if (rozetka_commission_label !== undefined)  update.rozetka_commission_label = rozetka_commission_label || null;

  const { error } = await db.from('categories').update(update).eq('slug', slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
