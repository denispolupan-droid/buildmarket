import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase-service';
import { withApi } from '../../../../lib/api-handler';

const serviceClient = createServiceClient();

async function assertAdmin() {
  const auth = await requireStaff('admin');
  return auth.ok ? auth.user : null;
}

async function _GET() {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data } = await serviceClient.from('app_settings').select('value').eq('key', 'promo_config').single();
  return NextResponse.json(data?.value ? JSON.parse(data.value) : null);
}

export const GET = withApi('admin/promo', _GET);

async function _POST(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const { error } = await serviceClient.from('app_settings').upsert({ key: 'promo_config', value: JSON.stringify(body) }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const POST = withApi('admin/promo', _POST);
