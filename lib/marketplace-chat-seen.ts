import { createServiceClient } from './supabase';

/**
 * Власний признак прочитаності чатів маркетплейсів (таблиця marketplace_chat_seen,
 * міграція 088).
 *
 * Чому не покладаємось на лічильники площадок:
 *  • Rozetka `/messages/counts` показує стан ЇХНЬОГО кабінету — досить комусь
 *    відкрити діалог у застосунку Rozetka, і totalUnread обнуляється, хоча наш
 *    менеджер повідомлення не бачив;
 *  • Prom лічильника на рівні кімнати не віддає взагалі, тож його чати не
 *    підсвічувались ніколи.
 *
 * Порівнюємо мітку оновлення чату з тією, яку бачили останнього разу, — час
 * площадки проти часу площадки. Абсолютних дат тут свідомо немає: площадки
 * віддають «2026-08-06 09:16:39» без зони, Київ узимку +2, улітку +3, і будь-яке
 * зведення до UTC дало б чати, що спалахують як нові через кілька годин після
 * перегляду. Формат «YYYY-MM-DD HH:mm:ss» сортується як рядок, чого й досить.
 */

export type MarketplaceId = 'rozetka' | 'prom';

/** Ключ мапи — `${mp}:${chatId}`, значення — мітка updated на момент перегляду. */
export type SeenMap = Map<string, string>;

export const seenKey = (mp: MarketplaceId, chatId: string) => `${mp}:${chatId}`;

export async function loadChatSeen(): Promise<SeenMap> {
  const db = createServiceClient();
  const { data } = await db.from('marketplace_chat_seen').select('mp, chat_id, seen_update');
  const map: SeenMap = new Map();
  for (const r of data ?? []) {
    map.set(seenKey(r.mp as MarketplaceId, String(r.chat_id)), String(r.seen_update ?? ''));
  }
  return map;
}

/** Позначити переглянутим. updatedAt — мітка чату, яку ми щойно показали. */
export async function markChatSeen(mp: MarketplaceId, chatId: string, updatedAt: string | null): Promise<void> {
  const db = createServiceClient();
  await db.from('marketplace_chat_seen').upsert(
    { mp, chat_id: chatId, seen_update: updatedAt ?? '', seen_at: new Date().toISOString() },
    { onConflict: 'mp,chat_id' },
  );
}

/**
 * Непрочитаний, якщо оновлення новіше за побачене. Чат, якого ми не відкривали
 * жодного разу, вважається непрочитаним — саме він і має підсвітитись.
 */
export function isChatUnread(seen: SeenMap, mp: MarketplaceId, chatId: string, updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const prev = seen.get(seenKey(mp, chatId));
  if (prev === undefined) return true;
  return updatedAt > prev;
}
