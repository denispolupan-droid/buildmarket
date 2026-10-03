import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';

// Вимикач крона ранкового дайджесту: app_settings.ops_digest = 'on' | 'off'.
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as { enabled?: boolean };
  const db = createServiceClient();
  const { error } = await db.from('app_settings').upsert({ key: 'ops_digest', value: body.enabled === false ? 'off' : 'on' }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enabled: body.enabled !== false });
}
