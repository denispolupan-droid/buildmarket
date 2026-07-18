import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return !!(user && user.app_metadata?.role === 'admin');
}

// Separate from /api/admin/rozetka/token (that one stores a bare API token, unused by any
// current feature). Order sync needs the seller's login/password because Rozetka's access
// token expires every 24h — see lib/rozetka-api.ts.
export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data } = await db.from('app_settings').select('key, value').in('key', ['rozetka_login']);
  const login = data?.find(r => r.key === 'rozetka_login')?.value ?? null;
  return NextResponse.json({ hasCredentials: !!login, login });
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { login, password } = await req.json() as { login?: string; password?: string };
  if (!login?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Логін і пароль обов\'язкові' }, { status: 400 });
  }

  const { error } = await db.from('app_settings').upsert([
    { key: 'rozetka_login',    value: login.trim() },
    { key: 'rozetka_password', value: password.trim() },
  ], { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Force a fresh login on next sync rather than an old cached token for a different account.
  await db.from('app_settings').delete().in('key', ['rozetka_token', 'rozetka_token_expires_at']);

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await db.from('app_settings').delete().in('key', [
    'rozetka_login', 'rozetka_password', 'rozetka_token', 'rozetka_token_expires_at',
  ]);
  return NextResponse.json({ ok: true });
}
