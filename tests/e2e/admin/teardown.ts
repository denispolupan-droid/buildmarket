import { createClient } from '@supabase/supabase-js';
import { lockOwnerId } from '../../shared/db-lock';

/**
 * Звільняє замок тестової бази, узятий у setup.ts. Playwright виконує
 * globalSetup і globalTeardown в одному процесі, тож owner збігається.
 */
export default async function adminGlobalTeardown() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = lockOwnerId('e2e-admin');
  const { data: row } = await db.from('app_settings').select('value').eq('key', 'integration_test_lock').maybeSingle();
  if (!row) return;
  try {
    const cur = JSON.parse(String(row.value)) as { owner?: string };
    if (cur.owner === owner) await db.from('app_settings').delete().eq('key', 'integration_test_lock').eq('value', row.value as string);
  } catch { /* чужий або битий замок не чіпаємо */ }
}
