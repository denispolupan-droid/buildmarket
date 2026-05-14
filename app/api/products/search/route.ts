import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  const term = q.replace(/[%_]/g, '\\$&'); // escape special chars
  const { data } = await supabase
    .from('products')
    .select('sku, name, brand, volume')
    .or(`name.ilike.%${term}%,brand.ilike.%${term}%,sku.ilike.%${term}%`)
    .eq('is_active', true)
    .limit(8);

  return NextResponse.json(
    { results: data ?? [] },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } },
  );
}
