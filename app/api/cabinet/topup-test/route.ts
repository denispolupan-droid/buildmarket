import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getRole } from '../../../../lib/user-role';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (getRole(user) !== 'dropship' && getRole(user) !== 'wholesale' && user.user_metadata?.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.MONOBANK_API_TOKEN;
  if (!token) return NextResponse.json({ error: 'MONOBANK_API_TOKEN not set' });

  const res  = await fetch('https://api.monobank.ua/api/merchant/details', {
    headers: { 'X-Token': token },
  });
  const data = await res.json();

  return NextResponse.json({ status: res.status, monobank: data });
}
