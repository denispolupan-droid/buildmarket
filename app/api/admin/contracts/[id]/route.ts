import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';

const db = createServiceClient();

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata?.role === 'admin' ? user : null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const { id: _id, balance: _b, created_at: _c, created_by: _cb, ...updates } = body;
  updates.updated_at = new Date().toISOString();

  // Якщо customer_id оновлюється — підтягуємо актуальне ім'я
  if (updates.customer_id) {
    const { data: cust } = await db
      .from('customers')
      .select('name, company, legal_name')
      .eq('id', updates.customer_id)
      .maybeSingle();
    if (cust) {
      updates.customer_name = cust.company?.trim() || cust.legal_name?.trim() || cust.name?.trim() || updates.customer_name;
    }
  }

  const { data, error } = await db
    .from('customer_contracts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const { count } = await db.from('money_entries').select('*', { count: 'exact', head: true }).eq('contract_id', id);
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Не можна видалити договір з проведеними операціями' }, { status: 409 });

  const { error } = await db.from('customer_contracts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
