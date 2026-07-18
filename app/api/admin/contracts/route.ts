import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createServiceClient } from '../../../../lib/supabase';

const db = createServiceClient();

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.app_metadata?.role === 'admin' ? user : null;
}

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const customerId = new URL(req.url).searchParams.get('customer_id');

  let query = db.from('customer_contracts').select('*').order('created_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);

  const { data: contracts, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Merge customer_number from customers table
  const customerIds = [...new Set((contracts ?? []).map(c => c.customer_id as string))].filter(Boolean);
  if (customerIds.length > 0) {
    const { data: customers } = await db
      .from('customers')
      .select('id, customer_number')
      .in('id', customerIds);
    const numMap = new Map((customers ?? []).map(c => [c.id as string, c.customer_number as number | null]));
    const result = (contracts ?? []).map(c => ({ ...c, customer_number: numMap.get(c.customer_id) ?? null }));
    return NextResponse.json(result);
  }

  return NextResponse.json(contracts ?? []);
}

export async function POST(req: NextRequest) {
  const user = await checkAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

  // Auto-generate contract_number if not provided
  if (!body.contract_number?.trim()) {
    const year = new Date().getFullYear();
    const prefix = `ДГ-${year}-`;
    const { count } = await db
      .from('customer_contracts')
      .select('*', { count: 'exact', head: true })
      .like('contract_number', `${prefix}%`);
    body.contract_number = `${prefix}${String((count ?? 0) + 1).padStart(4, '0')}`;
  }

  // Auto-fill customer_name from customers table
  if (body.customer_id) {
    const { data: cust } = await db
      .from('customers')
      .select('name, company, legal_name, customer_number')
      .eq('id', body.customer_id)
      .maybeSingle();
    if (cust) {
      body.customer_name = cust.company?.trim() || cust.legal_name?.trim() || cust.name?.trim() || body.customer_name;
    }
  }

  const { data, error } = await db
    .from('customer_contracts')
    .insert({ ...body, created_by: user.email })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
