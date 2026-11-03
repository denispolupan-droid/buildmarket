import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';

const db = createServiceClient();

async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const q   = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const lim = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 5000);

  const { data, error } = await db.rpc('search_prom_categories', { q, lim });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export const GET = withApi('admin/prom/category-search', _GET);
