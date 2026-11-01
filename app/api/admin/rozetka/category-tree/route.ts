import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';

const db = createServiceClient();

async function checkAdmin() {
  const auth = await requireStaff('admin');
  return auth.ok ? auth.user : null;
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await db
    .from('rozetka_category_tree')
    .select('rz_id, name, commission_rz_id')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
