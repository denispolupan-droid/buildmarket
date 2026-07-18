import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { syncRozetkaOrders } from '../../../../../lib/rozetka-sync';

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return !!(user && user.app_metadata?.role === 'admin');
}

export async function POST() {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncRozetkaOrders();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
