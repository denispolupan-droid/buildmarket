import { createServiceClient } from './supabase';

// Конфіг інтеграції з Monobank Personal/ФОП API. За зразком prom_api_token /
// rozetka-креди: значення беруться з app_settings (керовано, без редеплою),
// з фолбеком на Vercel env. Так налаштування можна змінити без доступу до дашборду.

/**
 * Токен еквайрингу (merchant API) з env, очищений від сміття.
 *
 * У значенні змінної цілком реально опиняється BOM, перенос рядка чи пробіл —
 * так буває від копіювання з дашборду. Для fetch це не дрібниця: заголовок із
 * недрукованим символом не відправляється взагалі, виклик падає.
 *
 * Чистка колись була скопійована в кожне місце, де створюється інвойс, — і саме
 * тому пропустила ЄДИНЕ місце, де вона була критичною: завантаження публічного
 * ключа у вебхуку. Ключ не діставався, перевірка підпису мовчки повертала false,
 * кожен вебхук отримував 401, і карткові замовлення не створювались зовсім,
 * хоча інвойси виставлялись нормально. Тому — одна функція на всіх.
 */
export function getMonoAcquiringToken(): string {
  return (process.env.MONOBANK_API_TOKEN ?? '')
    .replace(/[^\x20-\x7E]/g, '')   // BOM, переноси рядків, невидимі символи
    .trim();
}

async function setting(db: ReturnType<typeof createServiceClient>, key: string): Promise<string | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  const v = (data?.value ?? '').trim();
  return v || null;
}

export async function getMonoToken(db: ReturnType<typeof createServiceClient>): Promise<string | null> {
  return (await setting(db, 'mono_personal_token')) ?? (process.env.MONOBANK_PERSONAL_TOKEN?.trim() || null);
}

export async function getMonoWebhookSecret(db: ReturnType<typeof createServiceClient>): Promise<string | null> {
  return (await setting(db, 'mono_webhook_secret')) ?? (process.env.MONO_WEBHOOK_SECRET?.trim() || null);
}

export async function getMonoFopAccount(db: ReturnType<typeof createServiceClient>): Promise<string | null> {
  return setting(db, 'mono_fop_account_id');
}
