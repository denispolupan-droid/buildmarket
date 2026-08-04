import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
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
    .select('id, name, sync_interval_h, last_synced_at, source_url')
    .eq('is_active', true);

  if (!suppliers?.length) return NextResponse.json({ ok: true, synced: [] });

  const now = Date.now();
  const results: { id: number; name: string; status: string }[] = [];
  let synced = 0;

  for (const s of suppliers) {
    // Постачальник без файлу-джерела не налаштований на авто-синк — це конфігурація,
    // а не помилка. Тихо пропускаємо (інакше syncSupplier кидає "URL файлу не вказано"
    // і алерт спамить у Telegram кожні 2 години).
    if (!(s as { source_url?: string | null }).source_url?.trim()) {
      results.push({ id: s.id, name: s.name, status: 'skipped: no source url' });
      continue;
    }

    // Перевіряємо чи настав час синхронізації
    const lastSynced = s.last_synced_at ? new Date(s.last_synced_at).getTime() : 0;
    const intervalMs = s.sync_interval_h * 60 * 60 * 1000;
    if (now - lastSynced < intervalMs) {
      results.push({ id: s.id, name: s.name, status: 'skipped' });
      continue;
    }

    try {
      const result = await syncSupplier(s.id);
      synced += result.rows_updated;
      results.push({ id: s.id, name: s.name, status: `ok: +${result.rows_updated} unmapped:${result.rows_unmapped}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      results.push({ id: s.id, name: s.name, status: `error: ${message}` });
      alertAdmin(`Cron: синк постачальника "${s.name}" впав`, message);
    }
  }

  // Ціни й залишки змінилися в обхід адмінки (ручний синк постачальника чистить
  // кеш сам, див. app/api/admin/suppliers/[id]/sync) — інакше листинги показували б
  // стару ціну й наявність до природного протухання кешу.
  if (synced > 0) revalidateTag('products', 'max');

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
