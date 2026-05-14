import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata?.role === 'admin';
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await serviceClient.from('app_settings').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Record<string, string> = {};
  (data ?? []).forEach(r => { settings[r.key] = r.value; });
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const updates: Record<string, string> = await req.json();

  for (const [key, value] of Object.entries(updates)) {
    const { error } = await serviceClient
      .from('app_settings')
      .upsert({ key, value }, { onConflict: 'key' });

    if (error) {
      console.error('[settings] upsert failed:', key, error);
      return NextResponse.json({ error: `Помилка збереження ${key}: ${error.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
