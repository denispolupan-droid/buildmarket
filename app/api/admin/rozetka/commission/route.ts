import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient, type TableUpdate } from '../../../../../lib/supabase-service';

const db = createServiceClient();

async function checkAdmin() {
  return (await requireStaff('admin')).ok;
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

  const { error } = await db.from('categories').update(update as TableUpdate<'categories'>).eq('slug', slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
