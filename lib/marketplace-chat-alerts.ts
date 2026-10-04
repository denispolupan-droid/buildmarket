/**
 * Алерт про нові відгуки Rozetka (викликається з крона rozetka-orders).
 *
 * Алерти про нові повідомлення в чатах МП з 04.10.2026 живуть у
 * lib/marketplace-chat-telegram.ts: вони несуть чернетку відповіді й кнопку
 * «Надіслати як є», а дедуплікуються по вхідному повідомленню, не по
 * лічильниках кабінету.
 */
import { createServiceClient } from './supabase';
import { getRozetkaReviewCounts } from './rozetka-api';
import { alertAdmin } from './alert';

const RZ_REVIEWS_KEY = 'rozetka_reviews_unread_last';

async function getSetting(key: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = createServiceClient();
  await db.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
}

export async function alertRozetkaReviews(): Promise<{ unread: number; alerted: boolean }> {
  const { marketUnread, itemsUnread } = await getRozetkaReviewCounts();
  const total = marketUnread + itemsUnread;
  const prev = Number(await getSetting(RZ_REVIEWS_KEY)) || 0;
  const alerted = total > prev;
  if (alerted) {
    alertAdmin(
      `Rozetka: новий відгук (${marketUnread} про магазин, ${itemsUnread} про товари непрочитано)`,
      'Переглянути й відповісти: Адмінка → «Відгуки» → вкладка Rozetka.',
    );
  }
  if (total !== prev) await setSetting(RZ_REVIEWS_KEY, String(total));
  return { unread: total, alerted };
}
