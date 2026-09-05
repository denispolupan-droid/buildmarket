import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { RZPAY_LOGIN_KEY, RZPAY_PASSWORD_KEY, getRzPayCreds, validateRzPayKeys } from '../../../../../lib/rozetkapay-api';

// Ключі RozetkaPay Reports API — як токен Prom: зберігаються в app_settings,
// перед збереженням перевіряються живим запитом /api/merchants/v1/me.

const mask = (s: string) => (s.length > 4 ? `••••••${s.slice(-4)}` : '••••');

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const creds = await getRzPayCreds();
  return NextResponse.json({ hasKeys: !!creds, login: creds ? mask(creds.login) : null });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { login, password } = (await req.json()) as { login?: string; password?: string };
  if (!login?.trim() || !password?.trim()) return NextResponse.json({ error: 'Потрібні логін і пароль' }, { status: 400 });

  let me: Record<string, unknown>;
  try {
    me = await validateRzPayKeys({ login: login.trim(), password: password.trim() });
  } catch (err) {
    return NextResponse.json({ error: `Ключі не прийняті: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.from('app_settings').upsert([
    { key: RZPAY_LOGIN_KEY,    value: login.trim() },
    { key: RZPAY_PASSWORD_KEY, value: password.trim() },
  ], { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, login: mask(login.trim()), merchant: me });
}

export async function DELETE() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  await db.from('app_settings').delete().in('key', [RZPAY_LOGIN_KEY, RZPAY_PASSWORD_KEY]);
  return NextResponse.json({ ok: true });
}
