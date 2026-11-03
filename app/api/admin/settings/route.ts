import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase-service';
import { withApi } from '../../../../lib/api-handler';
import { log } from '../../../../lib/log';
import { readSettings, writeSetting, SECRET_KEYS } from '../../../../lib/secrets';

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
  // Секрети живуть у Vault (lib/secrets): для форм адмінки віддаємо їх звідти — лише адміну
  Object.assign(settings, await readSettings(serviceClient, [...SECRET_KEYS]));
  return NextResponse.json(settings);
}

export const GET = withApi('admin/settings', _GET);

async function _PUT(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const updates: Record<string, string> = await req.json();

  for (const [key, value] of Object.entries(updates)) {
    try {
      await writeSetting(serviceClient, key, value);   // секретні ключі → Vault
    } catch (err) {
      log.error('settings.write_failed', { key, err });
      return NextResponse.json({ error: `Помилка збереження ${key}: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export const PUT = withApi('admin/settings', _PUT);
