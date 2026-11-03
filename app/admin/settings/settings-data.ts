import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createServiceClient } from '../../../lib/supabase-service';
import { readSettings, SECRET_KEYS } from '../../../lib/secrets';

const serviceClient = createServiceClient();

// Спільне для всіх вкладок налаштувань: перевірка прав + читання app_settings.
// Кожна вкладка — окремий роут, тому гард має бути в кожній сторінці, а не лише
// в layout.
export async function loadSettings(): Promise<Record<string, string>> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: rows } = await serviceClient.from('app_settings').select('key, value');
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach(r => { cfg[r.key] = r.value; });
  // Секрети — з Vault (lib/secrets); сторінки налаштувань лише для адміна
  Object.assign(cfg, await readSettings(serviceClient, [...SECRET_KEYS]));
  return cfg;
}
