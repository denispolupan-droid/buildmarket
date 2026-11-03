import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';
import { writeSetting, deleteSetting } from '../../../../../lib/secrets';

const db = createServiceClient();

async function checkAdmin() {
  return (await requireStaff('admin')).ok;
}

// Separate from /api/admin/rozetka/token (that one stores a bare API token, unused by any
// current feature). Order sync needs the seller's login/password because Rozetka's access
// token expires every 24h — see lib/rozetka-api.ts.
async function _GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data } = await db.from('app_settings').select('key, value').in('key', ['rozetka_login']);
  const login = data?.find(r => r.key === 'rozetka_login')?.value ?? null;
  return NextResponse.json({ hasCredentials: !!login, login });
}

export const GET = withApi('admin/rozetka/credentials', _GET);

async function _POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { login, password } = await req.json() as { login?: string; password?: string };
  if (!login?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Логін і пароль обов\'язкові' }, { status: 400 });
  }

  try {
    await writeSetting(db, 'rozetka_login', login.trim());
    await writeSetting(db, 'rozetka_password', password.trim());   // → Vault
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  // Force a fresh login on next sync rather than an old cached token for a different account.
  for (const k of ['rozetka_token', 'rozetka_token_expires_at']) await deleteSetting(db, k);

  return NextResponse.json({ ok: true });
}

export const POST = withApi('admin/rozetka/credentials', _POST);

async function _DELETE() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  for (const k of ['rozetka_login', 'rozetka_password', 'rozetka_token', 'rozetka_token_expires_at']) await deleteSetting(db, k);
  return NextResponse.json({ ok: true });
}

export const DELETE = withApi('admin/rozetka/credentials', _DELETE);
