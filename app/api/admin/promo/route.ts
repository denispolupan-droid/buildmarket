import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function assertAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return null;
  return user;
}

export async function GET() {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data } = await serviceClient.from('app_settings').select('value').eq('key', 'promo_config').single();
  return NextResponse.json(data?.value ? JSON.parse(data.value) : null);
}

export async function POST(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const { error } = await serviceClient.from('app_settings').upsert({ key: 'promo_config', value: JSON.stringify(body) }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
