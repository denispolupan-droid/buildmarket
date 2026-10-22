import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertTestDatabase } from './test-db-guard';

/**
 * Взаємне блокування прогонів тестів на СПІЛЬНІЙ тестовій базі.
 *
 * Інтеграційні тести обліку і e2e адмінки працюють на одній тестовій базі й
 * прибирають за собою через reset_accounting_test_data, який TRUNCATE-ить весь
 * облік. Два прогони одночасно (CI + локальний, або дві локальні сесії) ламають
 * один одного: 17.10.2026 CI впав із «expected 5, received 10» і FK на doc_id,
 * яких у послідовному прогоні не буває. Concurrency group у GitHub серіалізує
 * лише CI між собою.
 *
 * Замок — рядок в app_settings (key = LOCK_KEY, value = JSON {owner, at}).
 * Захоплення — compare-and-set через PostgREST: UPDATE … WHERE value = <старе>;
 * якщо рядка немає — INSERT (гонку ловить унікальний ключ). Протухлий замок
 * (старше STALE_MS) перехоплюється: процес, що впав без release, нікого не
 * блокує назавжди.
 */

const LOCK_KEY = 'integration_test_lock';
const STALE_MS = 20 * 60 * 1000;
const WAIT_MS = 15 * 60 * 1000;
const POLL_MS = 10 * 1000;

type LockValue = { owner: string; at: string };

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('db-lock: немає NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  assertTestDatabase(url);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parse(v: unknown): LockValue | null {
  try { const o = typeof v === 'string' ? JSON.parse(v) : v; return o && typeof o.owner === 'string' ? o as LockValue : null; }
  catch { return null; }
}

export function lockOwnerId(label: string): string {
  const host = process.env.GITHUB_RUN_ID ? `ci-${process.env.GITHUB_RUN_ID}` : (process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? 'local');
  return `${label}:${host}:${process.pid}`;
}

/** Чекає, поки база вільна, і займає її. Повертає функцію звільнення. */
export async function acquireTestDbLock(label: string): Promise<() => Promise<void>> {
  const db = client();
  const owner = lockOwnerId(label);
  const deadline = Date.now() + WAIT_MS;
  let announced = false;

  while (true) {
    const { data: row } = await db.from('app_settings').select('value').eq('key', LOCK_KEY).maybeSingle();
    const mine = JSON.stringify({ owner, at: new Date().toISOString() } satisfies LockValue);

    if (!row) {
      const { error } = await db.from('app_settings').insert({ key: LOCK_KEY, value: mine });
      if (!error) return release(db, owner);
    } else {
      const cur = parse(row.value);
      const stale = !cur || Date.now() - new Date(cur.at).getTime() > STALE_MS;
      if (stale || cur?.owner === owner) {
        const { data: updated } = await db.from('app_settings').update({ value: mine }).eq('key', LOCK_KEY).eq('value', row.value as string).select('key');
        if (updated?.length) return release(db, owner);
      } else if (!announced) {
        console.log(`[db-lock] тестова база зайнята (${cur.owner}, з ${cur.at}) — чекаю до ${Math.round(WAIT_MS / 60000)} хв`);
        announced = true;
      }
    }

    if (Date.now() > deadline) throw new Error('[db-lock] не дочекався вільної тестової бази');
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

function release(db: SupabaseClient, owner: string): () => Promise<void> {
  return async () => {
    const { data: row } = await db.from('app_settings').select('value').eq('key', LOCK_KEY).maybeSingle();
    if (row && parse(row.value)?.owner === owner) {
      await db.from('app_settings').delete().eq('key', LOCK_KEY).eq('value', row.value as string);
    }
  };
}
