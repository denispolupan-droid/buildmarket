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
  return !!(user && user.user_metadata?.role === 'admin');
}

export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug, single, econom } = await req.json() as {
    slug:   string;
    single: number | null;
    econom: number | null;
  };

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const { error } = await db
    .from('categories')
    .update({
      prom_commission_pct:        single,
      prom_commission_pct_econom: econom,
    })
    .eq('slug', slug);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
