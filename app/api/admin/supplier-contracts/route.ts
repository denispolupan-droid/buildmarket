import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createServiceClient } from '../../../../lib/supabase';

const db = createServiceClient();

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata?.role === 'admin' ? user : null;
}

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supplierId = new URL(req.url).searchParams.get('supplier_id');

  let query = db.from('supplier_contracts').select('*').order('created_at', { ascending: false });
  if (supplierId) query = query.eq('supplier_id', Number(supplierId));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const user = await checkAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

  if (!body.supplier_id) return NextResponse.json({ error: 'supplier_id обовʼязковий' }, { status: 400 });

  if (!body.contract_number?.trim()) {
    const year = new Date().getFullYear();
    const prefix = `ДП-${year}-`;
    const { count } = await db
      .from('supplier_contracts')
      .select('*', { count: 'exact', head: true })
      .like('contract_number', `${prefix}%`);
    body.contract_number = `${prefix}${String((count ?? 0) + 1).padStart(4, '0')}`;
  }

  if (!body.supplier_name?.trim()) {
    const { data: s } = await db.from('suppliers').select('name').eq('id', body.supplier_id).single();
    body.supplier_name = s?.name ?? `Постачальник #${body.supplier_id}`;
  }

  const { data, error } = await db
    .from('supplier_contracts')
    .insert({ ...body, created_by: user.email })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
