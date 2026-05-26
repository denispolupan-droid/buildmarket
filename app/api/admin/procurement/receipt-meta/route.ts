import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';

const db = createServiceClient();

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [{ data: warehouses }, { data: suppliers }] = await Promise.all([
    db.from('warehouses').select('id, name').eq('is_active', true).eq('warehouse_type', 'physical').order('sort_order'),
    db.from('suppliers').select('id, name').eq('is_active', true).order('name'),
  ]);

  return NextResponse.json({ warehouses: warehouses ?? [], suppliers: suppliers ?? [] });
}
