import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { EPICENTR_BASE, EPICENTR_TOKEN_KEY } from '../../../../../lib/epicentr-api';
import { withApi } from '../../../../../lib/api-handler';
import { readSetting, writeSetting, deleteSetting } from '../../../../../lib/secrets';

// Ключ Merchant API Епіцентру: app_settings.epicentr_api_token (fallback — env).
const mask = (t: string) => `••••••••${t.slice(-4)}`;

async function _GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  const data = { value: await readSetting(db, EPICENTR_TOKEN_KEY) };
  const token = data?.value || process.env.EPICENTR_API_TOKEN || '';
  return NextResponse.json({
    hasToken: !!token,
    maskedToken: token ? mask(token) : null,
    source: data?.value ? 'db' : (process.env.EPICENTR_API_TOKEN ? 'env' : null),
  });
}

export const GET = withApi('admin/epicentr/token', _GET);

async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { token } = await req.json() as { token?: string };
  const clean = (token ?? '').trim();
  if (!clean.startsWith('mp_') || clean.length < 40) {
    return NextResponse.json({ error: 'Ключ має вигляд mp_… (генерується в кабінеті: Налаштування компанії → API)' }, { status: 400 });
  }

  // Перевіряємо ключ живим запитом, перш ніж зберегти
  const test = await fetch(`${EPICENTR_BASE}/v4/oms/orders?limit=1`, {
    headers: { Authorization: `Bearer ${clean}`, accept: 'application/json' },
  });
  if (!test.ok) {
    return NextResponse.json({ error: `Ключ недійсний: Епіцентр відповів ${test.status}` }, { status: 400 });
  }

  const db = createServiceClient();
  const error = await writeSetting(db, EPICENTR_TOKEN_KEY, clean).then(() => null, (e: unknown) => ({ message: e instanceof Error ? e.message : String(e) }));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, maskedToken: mask(clean) });
}

export const POST = withApi('admin/epicentr/token', _POST);

async function _DELETE() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  await deleteSetting(db, EPICENTR_TOKEN_KEY);
  return NextResponse.json({ ok: true });
}

export const DELETE = withApi('admin/epicentr/token', _DELETE);
