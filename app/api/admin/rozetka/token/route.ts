import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';
import { readSetting, writeSetting, deleteSetting } from '../../../../../lib/secrets';

const db = createServiceClient();

async function assertAdmin() {
  const auth = await requireStaff('admin');
  if (!auth.ok) throw new Error('Unauthorized');
}

async function _GET() {
  try {
    await assertAdmin();
    const stored = await readSetting(db, 'rozetka_api_token');
    const token = stored || process.env.ROZETKA_API_KEY || '';
    return NextResponse.json({
      hasToken:    !!token,
      maskedToken: token ? `••••••••${token.slice(-4)}` : null,
      source:      stored ? 'db' : (process.env.ROZETKA_API_KEY ? 'env' : null),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export const GET = withApi('admin/rozetka/token', _GET);

async function _POST(req: NextRequest) {
  try {
    await assertAdmin();
    const { token } = await req.json() as { token: string };
    if (!token || typeof token !== 'string' || token.trim().length < 8) {
      return NextResponse.json({ error: 'Невірний токен' }, { status: 400 });
    }
    await writeSetting(db, 'rozetka_api_token', token.trim());
    return NextResponse.json({ ok: true, maskedToken: `••••••••${token.trim().slice(-4)}` });
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const POST = withApi('admin/rozetka/token', _POST);

async function _DELETE() {
  try {
    await assertAdmin();
    await deleteSetting(db, 'rozetka_api_token');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export const DELETE = withApi('admin/rozetka/token', _DELETE);
