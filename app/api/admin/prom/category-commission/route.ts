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

  const { slug, single, econom, more_sales, turbo, prom_section_url, prom_section_id, prom_section_name, prom_markup_pct } = await req.json() as {
    slug:               string;
    single?:            number | null;
    econom?:            number | null;
    more_sales?:        number | null;
    turbo?:             number | null;
    prom_section_url?:  string | null;
    prom_section_id?:   number | null;
    prom_section_name?: string | null;
    prom_markup_pct?:   number | null;
  };

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (single            !== undefined) update.prom_commission_pct            = single;
  if (econom            !== undefined) update.prom_commission_pct_econom     = econom;
  if (more_sales        !== undefined) update.prom_commission_pct_more_sales = more_sales;
  if (turbo             !== undefined) update.prom_commission_pct_turbo      = turbo;
  if (prom_section_url  !== undefined) update.prom_section_url               = prom_section_url;
  if (prom_section_id   !== undefined) update.prom_section_id                = prom_section_id;
  if (prom_section_name !== undefined) update.prom_section_name              = prom_section_name;
  if (prom_markup_pct   !== undefined) update.prom_markup_pct                = prom_markup_pct;

  const { error } = await db.from('categories').update(update).eq('slug', slug);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
