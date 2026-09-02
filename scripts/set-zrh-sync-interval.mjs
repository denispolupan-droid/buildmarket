/**
 * Ставить постачальнику ЗРХ інтервал синку 2 години.
 *
 * На сайті скрізь написано «фід оновлюється кожні 2 години», а насправді синк
 * ішов раз на 4: крон ходить кожні 2, але пропускає виклик, якщо з останнього
 * синку минуло менше за sync_interval_h. Рішення власника 02.09.2026 —
 * приводити роботу до слів, а не слова до роботи.
 *
 * Запуск: node --env-file=.env.local scripts/set-zrh-sync-interval.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: before, error: readErr } = await supabase
  .from('suppliers').select('id, name, sync_interval_h, last_synced_at').eq('id', 1).single();
if (readErr) { console.error('read:', readErr.message); process.exit(1); }
console.log('було:', before);

const { data, error } = await supabase
  .from('suppliers').update({ sync_interval_h: 2 }).eq('id', 1)
  .select('id, name, sync_interval_h, last_synced_at').single();
if (error) { console.error('update:', error.message); process.exit(1); }
console.log('стало:', data);
