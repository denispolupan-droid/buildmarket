import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { escapeOrTerm } from '../../../../../lib/pg-filter';
import { requireStaff } from '../../../../../lib/auth-guard';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);
  const term = escapeOrTerm(q);

  const { data } = await serviceClient
    .from('products')
    .select('sku, name, brand, volume')
    .or(`sku.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%`)
    .order('name')
    .limit(15);

  return NextResponse.json(data ?? []);
}
