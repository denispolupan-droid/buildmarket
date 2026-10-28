import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase';
import { requireStaff } from '../../../../../lib/auth-guard';

const db = createServiceClient();

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const [{ data: warehouses }, { data: suppliers }] = await Promise.all([
    db.from('warehouses').select('id, name').eq('is_active', true).eq('warehouse_type', 'physical').order('sort_order'),
    db.from('suppliers').select('id, name').eq('is_active', true).order('name'),
  ]);

  return NextResponse.json({ warehouses: warehouses ?? [], suppliers: suppliers ?? [] });
}
