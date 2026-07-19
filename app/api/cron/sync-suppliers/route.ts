import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncSupplier } from '../../../../lib/supplier-sync';
import { pushPromStock } from '../../../../lib/prom-stock-push';
import { alertAdmin } from '../../../../lib/alert';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  // Vercel cron передає секретний токен через Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: suppliers } = await serviceClient
    .from('suppliers')
    .select('id, name, sync_interval_h, last_synced_at')
    .eq('is_active', true);

  if (!suppliers?.length) return NextResponse.json({ ok: true, synced: [] });

  const now = Date.now();
  const results: { id: number; name: string; status: string }[] = [];

  for (const s of suppliers) {
    // Перевіряємо чи настав час синхронізації
    const lastSynced = s.last_synced_at ? new Date(s.last_synced_at).getTime() : 0;
    const intervalMs = s.sync_interval_h * 60 * 60 * 1000;
    if (now - lastSynced < intervalMs) {
      results.push({ id: s.id, name: s.name, status: 'skipped' });
      continue;
    }

    try {
      const result = await syncSupplier(s.id);
      results.push({ id: s.id, name: s.name, status: `ok: +${result.rows_updated} unmapped:${result.rows_unmapped}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      results.push({ id: s.id, name: s.name, status: `error: ${message}` });
      alertAdmin(`Cron: синк постачальника "${s.name}" впав`, message);
    }
  }

  // Після оновлення залишків постачальників — одразу проштовхуємо їх у Prom
  // (фід Prom перечитує рідко; API-пуш закриває вікно оверсейлу).
  // Тихо пропускається, якщо Prom-кабінет ще не підключений.
  let promPush: unknown = null;
  try {
    promPush = await pushPromStock();
  } catch (err) {
    console.error('[prom-stock-push]', err);
  }

  return NextResponse.json({ ok: true, synced: results, promPush });
}

export const POST = GET;
