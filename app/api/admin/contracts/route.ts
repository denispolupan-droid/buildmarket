import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createServiceClient } from '../../../../lib/supabase';

const db = createServiceClient();

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata?.role === 'admin' ? user : null;
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await db.from('customer_contracts').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await checkAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { data, error } = await db
    .from('customer_contracts')
    .insert({ ...body, created_by: user.email })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
