import { createServiceClient } from './supabase';

// Конфіг інтеграції з Monobank Personal/ФОП API. За зразком prom_api_token /
// rozetka-креди: значення беруться з app_settings (керовано, без редеплою),
// з фолбеком на Vercel env. Так налаштування можна змінити без доступу до дашборду.

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
