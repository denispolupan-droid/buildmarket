import { createServiceClient } from './supabase';
import { alertAdmin } from './alert';
import { AI_OUTAGE_ALERT_EVERY_MS, aiOutageMessage, classifyAiError, needsOwnerAction, type AiFailureKind } from './ai-health-rules';

/**
 * Повідомити про збій ШІ-агента. Для «грошей» і «ключа» — окреме повідомлення
 * в Telegram не частіше ніж раз на 6 годин (мітка в app_settings.ai_outage_alerted_at),
 * бо крони чатів ходять кожні 5 хв. Нічого не кидає — викликається з catch.
 */
export async function reportAiFailure(err: unknown, where: string): Promise<AiFailureKind> {
  const kind = classifyAiError(err);
  console.error('[ai-health]', where, kind, err instanceof Error ? err.message : err);
  if (!needsOwnerAction(kind)) return kind;
  try {
    const db = createServiceClient();
    const { data } = await db.from('app_settings').select('value').eq('key', 'ai_outage_alerted_at').maybeSingle();
    const last = data?.value ? Date.parse(String(data.value)) : 0;
    if (Number.isFinite(last) && Date.now() - last < AI_OUTAGE_ALERT_EVERY_MS) return kind;
    await db.from('app_settings').upsert({ key: 'ai_outage_alerted_at', value: new Date().toISOString() }, { onConflict: 'key' });
  } catch { /* БД недоступна — алерт важливіший за тротлінг */ }
  const m = aiOutageMessage(kind, where);
  alertAdmin(m.title, m.detail);
  return kind;
}
