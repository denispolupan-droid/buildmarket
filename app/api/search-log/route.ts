import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../lib/supabase-server';

export async function POST(req: NextRequest) {
  const { query, resultsCount } = await req.json();

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ ok: false });
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from('search_queries').insert({
    query: query.trim().toLowerCase(),
    results_count: resultsCount ?? null,
    user_id: user?.id ?? null,
  });

  return NextResponse.json({ ok: true });
}
