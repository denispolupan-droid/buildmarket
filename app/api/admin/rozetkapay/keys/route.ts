import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { RZPAY_LOGIN_KEY, RZPAY_PASSWORD_KEY, getRzPayCreds, validateRzPayKeys } from '../../../../../lib/rozetkapay-api';
import { withApi } from '../../../../../lib/api-handler';
import { writeSetting, deleteSetting } from '../../../../../lib/secrets';

// Ключі RozetkaPay Reports API — як токен Prom: зберігаються в app_settings,
// перед збереженням перевіряються живим запитом /api/merchants/v1/me.

const mask = (s: string) => (s.length > 4 ? `••••••${s.slice(-4)}` : '••••');

async function _GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const creds = await getRzPayCreds();
  return NextResponse.json({ hasKeys: !!creds, login: creds ? mask(creds.login) : null });
}

export const GET = withApi('admin/rozetkapay/keys', _GET);

async function _POST(req: NextRequest) {
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
  try {
    await writeSetting(db, RZPAY_LOGIN_KEY, login.trim());
    await writeSetting(db, RZPAY_PASSWORD_KEY, password.trim());   // → Vault
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, login: mask(login.trim()), merchant: me });
}

export const POST = withApi('admin/rozetkapay/keys', _POST);

async function _DELETE() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  for (const k of [RZPAY_LOGIN_KEY, RZPAY_PASSWORD_KEY]) await deleteSetting(db, k);
  return NextResponse.json({ ok: true });
}

export const DELETE = withApi('admin/rozetkapay/keys', _DELETE);
