import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { rateLimit, getClientIp } from '../../../lib/rate-limit';

export async function POST(req: NextRequest) {
  // Rate limit: 60 search logs per IP per minute
  const ip = getClientIp(req);
  if (!rateLimit(`search-log:${ip}`, 60, 60 * 1000)) {
    return NextResponse.json({ ok: false });
  }

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
