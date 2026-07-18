import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function assertAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') throw new Error('Unauthorized');
}

export async function GET() {
  try {
    await assertAdmin();
    const { data } = await db.from('app_settings').select('value').eq('key', 'prom_api_token').maybeSingle();
    const token = data?.value || process.env.PROM_API_TOKEN || '';
    return NextResponse.json({
      hasToken: !!token,
      maskedToken: token ? `••••••••${token.slice(-4)}` : null,
      source: data?.value ? 'db' : (process.env.PROM_API_TOKEN ? 'env' : null),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
    const { token } = await req.json() as { token: string };
    if (!token || typeof token !== 'string' || token.trim().length < 10) {
      return NextResponse.json({ error: 'Невірний токен' }, { status: 400 });
    }

    // Test the token against Prom API before saving
    const testRes = await fetch('https://my.prom.ua/api/v1/orders/list?limit=1', {
      headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
    });
    if (!testRes.ok) {
      return NextResponse.json({ error: `Токен недійсний: Prom відповів ${testRes.status}` }, { status: 400 });
    }

    await db.from('app_settings').upsert(
      { key: 'prom_api_token', value: token.trim() },
      { onConflict: 'key' }
    );

    return NextResponse.json({ ok: true, maskedToken: `••••••••${token.trim().slice(-4)}` });
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await assertAdmin();
    await db.from('app_settings').delete().eq('key', 'prom_api_token');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
