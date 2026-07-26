/**
 * Алерти про нові повідомлення покупців у чатах маркетплейсів.
 * Викликаються з 15-хвилинних cron-синків (rozetka-orders / prom-orders):
 * без цього нове питання покупця видно лише в кабінеті площадки.
 *
 * Rozetka: порівнюємо totalUnread (/messages/counts) зі збереженим в
 * app_settings — зріст = нові вхідні. Prom: кімнати з date_sent новішим за
 * збережену позначку; щоб не алертити на власні відповіді, перевіряємо
 * напрямок останнього повідомлення кімнати.
 */
import { createServiceClient } from './supabase';
import { getRozetkaChatCounts, getRozetkaReviewCounts } from './rozetka-api';
import { getPromChatRooms, getPromChatHistory } from './prom-api';
import { alertAdmin } from './alert';

const RZ_KEY         = 'rozetka_chat_unread_last';
const PROM_KEY       = 'prom_chat_last_seen_ts';
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

export async function alertRozetkaChatUnread(): Promise<{ unread: number; alerted: boolean }> {
  const { totalUnread } = await getRozetkaChatCounts();
  const prev = Number(await getSetting(RZ_KEY)) || 0;
  const alerted = totalUnread > prev;
  if (alerted) {
    alertAdmin(
      `Rozetka: нові повідомлення в чаті (${totalUnread} непрочитаних)`,
      'Відповісти: Адмінка → «Чати МП».',
    );
  }
  if (totalUnread !== prev) await setSetting(RZ_KEY, String(totalUnread));
  return { unread: totalUnread, alerted };
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

export async function alertPromChatNew(): Promise<{ newRooms: number }> {
  const lastSeen = await getSetting(PROM_KEY) ?? '';
  const rooms = await getPromChatRooms({ limit: 20 });
  const fresh = rooms.filter(r => r.date_sent && r.date_sent > lastSeen);
  let alerts = 0;

  for (const room of fresh.slice(0, 5)) {
    try {
      const history = await getPromChatHistory(room.ident, 5);
      const last = history[history.length - 1];
      if (!last) continue;
      const buyerIdent = room.ident.split('_')[0];
      const fromBuyer = last.user_ident != null && String(last.user_ident) === buyerIdent;
      if (fromBuyer) {
        alerts++;
        alertAdmin(
          `Prom: нове повідомлення від покупця${last.user_name ? ` (${last.user_name})` : ''}`,
          `${(last.body ?? '').slice(0, 200)}\nВідповісти: Адмінка → «Чати МП».`,
        );
      }
    } catch { /* одна кімната не валить прохід */ }
  }

  const maxTs = rooms.reduce((m, r) => (r.date_sent && r.date_sent > m ? r.date_sent : m), lastSeen);
  if (maxTs && maxTs !== lastSeen) await setSetting(PROM_KEY, maxTs);
  return { newRooms: alerts };
}
