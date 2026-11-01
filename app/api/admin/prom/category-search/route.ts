import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';

const db = createServiceClient();

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const q   = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const lim = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 5000);

  const { data, error } = await db.rpc('search_prom_categories', { q, lim });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
