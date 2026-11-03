import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase-service';
import { withApi } from '../../../../lib/api-handler';

const serviceClient = createServiceClient();

async function checkAdmin() {
  return (await requireStaff('admin')).ok;
}

async function _GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await serviceClient.from('app_settings').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Record<string, string> = {};
  (data ?? []).forEach(r => { settings[r.key] = r.value; });
  return NextResponse.json(settings);
}

export const GET = withApi('admin/settings', _GET);

async function _PUT(req: NextRequest) {
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

export const PUT = withApi('admin/settings', _PUT);
