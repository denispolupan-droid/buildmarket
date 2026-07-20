import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';

// Зміна інтервалу синку маркетплейсів з адмінки. Розклад pg_cron змінюється
// ТІЛЬКИ через RPC set_marketplace_sync_interval (єдина точка правди), а не
// ручним SQL — тому налаштування й факт завжди узгоджені.

const ALLOWED = [5, 10, 15, 30, 60];

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.app_metadata?.role === 'admin';
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { minutes?: number };
  const minutes = Number(body.minutes);
  if (!ALLOWED.includes(minutes)) {
    return NextResponse.json({ error: `Дозволені інтервали: ${ALLOWED.join(', ')} хв` }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc('set_marketplace_sync_interval', { p_minutes: minutes });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, minutes, schedule: data });
}
