import { createServiceClient } from './supabase-service';

/**
 * Не даємо двом тікам одного крона йти паралельно (міграція 141, аудит
 * 31.10.2026). Лок має TTL: якщо функція впала посередині й не звільнила його,
 * наступний тік після TTL забере лок сам.
 *
 * Якщо лок узяти не вдалося через саму базу (RPC недоступний) — крон таки
 * виконуємо: пропущений синк замовлень гірший за рідкісне накладання.
 */
export async function withCronLock<T>(
  name: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<{ skipped: true } | { skipped: false; result: T }> {
  const db = createServiceClient();
  const owner = `${name}:${Date.now()}`;
  const { data: acquired, error } = await db.rpc('try_cron_lock', {
    p_name: name, p_ttl_seconds: ttlSeconds, p_by: owner,
  });
  if (!error && acquired === false) return { skipped: true };
  try {
    return { skipped: false, result: await fn() };
  } finally {
    if (!error) {
      const { error: relErr } = await db.rpc('release_cron_lock', { p_name: name });
      if (relErr) console.error(`[cron-lock] release ${name} failed:`, relErr.message);
    }
  }
}
