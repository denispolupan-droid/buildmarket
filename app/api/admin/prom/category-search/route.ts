import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q   = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const lim = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 5000);

  const { data, error } = await db.rpc('search_prom_categories', { q, lim });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
