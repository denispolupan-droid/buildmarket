import { createServiceClient } from './supabase';
import { getRozetkaChats } from './rozetka-api';
import { getPromChatRooms } from './prom-api';
import { loadChatSeen, isChatUnread, markChatSeen, type MarketplaceId } from './marketplace-chat-seen';
import { loadMarketplaceThread, type MarketplaceChatMessage } from './marketplace-chat-thread';
import { awaitingOurReply } from './marketplace-chat-draft-rules';

/**
 * Вхідні чатів маркетплейсів — один список для вкладки «Маркетплейси» і для
 * бейджа в сайдбарі, щоб обидва світились за одним правилом.
 *
 * Правило «непрочитаний»: чат оновився після того, як ми його востаннє
 * відкривали (marketplace_chat_seen), І останнє змістовне повідомлення в ньому —
 * від покупця. Сама лише мітка оновлення не годиться: наша відповідь (з адмінки
 * чи з кабінету площадки) теж зсуває updated, і чат спалахував «новим» одразу
 * після того, як ми в ньому відповіли — доводилось заходити вдруге, щоб погасити.
 * Списки площадок автора останнього повідомлення не віддають, тому для
 * «свіжих» чатів (їх одиниці) дотягуємо тред; якщо останнє слово наше —
 * одразу позначаємо переглянутим, щоб наступного разу тред не тягнути.
 */

export type MarketplaceChatItem = {
  mp: MarketplaceId;
  id: string;                 // rozetka: chat id · prom: room_ident
  subject: string;
  contact: string | null;
  updatedAt: string | null;
  unread: number;
  orderNumber: number | null; // наш номер замовлення (якщо знайдено)
  ourOrderId: string | null;
  receiverId: number | null;  // rozetka: user_id покупця (потрібен для відповіді)
};

export type MarketplaceInbox = { items: MarketplaceChatItem[]; errors: string[] };

/** Скільки «свіжих» чатів перевіряємо тредом за один прохід (кожен — запит до площадки). */
const CHECK_LIMIT = 12;

/**
 * Чиста частина правила: для свіжих чатів питаємо тред і гасимо ті, де останнє
 * слово наше. Завантажувач і «позначити переглянутим» передаються ззовні — під
 * тести. Помилка площадки лишає чат підсвіченим: зайвий раз глянути краще, ніж
 * пропустити покупця.
 */
export async function settleUnread(
  items: MarketplaceChatItem[],
  deps: {
    loadThread: (mp: MarketplaceId, id: string) => Promise<{ messages: MarketplaceChatMessage[] }>;
    markSeen: (mp: MarketplaceId, id: string, updatedAt: string | null) => Promise<void>;
    limit?: number;
  },
): Promise<MarketplaceChatItem[]> {
  const fresh = items.filter(i => i.unread > 0).slice(0, deps.limit ?? CHECK_LIMIT);
  await Promise.all(fresh.map(async it => {
    try {
      const { messages } = await deps.loadThread(it.mp, it.id);
      if (awaitingOurReply(messages)) return;
      it.unread = 0;
      await deps.markSeen(it.mp, it.id, it.updatedAt).catch(() => {});
    } catch { /* площадка не відповіла — лишаємо підсвіченим */ }
  }));
  return items;
}

export async function loadMarketplaceInbox(): Promise<MarketplaceInbox> {
  const items: MarketplaceChatItem[] = [];
  const errors: string[] = [];

  // Rozetka: перша сторінка кожного типу, відсортовано за оновленням — для
  // робочої стрічки цього достатньо (20+20 останніх діалогів)
  const [ordersChats, itemsChats, seen] = await Promise.all([
    getRozetkaChats('orders').catch((e: unknown) => { errors.push(`Rozetka: ${e instanceof Error ? e.message : e}`); return { chats: [] }; }),
    getRozetkaChats('items').catch(() => ({ chats: [] })),
    loadChatSeen(),
  ]);
  const rzChats = [...ordersChats.chats, ...itemsChats.chats];

  // Привʼязка Rozetka-чатів до наших замовлень
  const rzOrderIds = [...new Set(rzChats.map(c => c.order_id).filter((v): v is number => !!v))];
  const db = createServiceClient();
  const { data: ourOrders } = rzOrderIds.length
    ? await db.from('orders')
        .select('id, order_number, rozetka_order_id')
        .in('rozetka_order_id', rzOrderIds)
        .limit(rzOrderIds.length)
    : { data: [] as never[] };
  const orderByRz = new Map((ourOrders ?? []).map(o => [Number(o.rozetka_order_id), o]));

  for (const c of rzChats) {
    const our = c.order_id ? orderByRz.get(Number(c.order_id)) : null;
    const updatedAt = c.updated ?? c.created ?? null;
    items.push({
      mp: 'rozetka',
      id: String(c.id),
      subject: c.subject ?? (c.order_id ? `Замовлення rz ${c.order_id}` : 'Чат'),
      contact: c.user?.contact_fio?.trim() || null,
      updatedAt,
      // Свій признак, а не unread_messages_count площадки: той гасне, щойно
      // діалог відкриють у кабінеті Rozetka, хоча ми його не бачили.
      unread: isChatUnread(seen, 'rozetka', String(c.id), updatedAt) ? 1 : 0,
      orderNumber: our?.order_number ?? null,
      ourOrderId: our?.id ?? null,
      receiverId: c.user_id ?? c.user?.id ?? null,
    });
  }

  try {
    const rooms = await getPromChatRooms({ limit: 20 });
    for (const r of rooms) {
      items.push({
        mp: 'prom',
        id: r.ident,
        subject: 'Чат з покупцем',
        contact: null,               // імʼя зʼявиться в треді (user_name повідомлень)
        updatedAt: r.date_sent,
        unread: isChatUnread(seen, 'prom', r.ident, r.date_sent ?? null) ? 1 : 0,
        orderNumber: null,
        ourOrderId: null,
        receiverId: null,
      });
    }
  } catch (e: unknown) {
    errors.push(`Prom: ${e instanceof Error ? e.message : e}`);
  }

  items.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  await settleUnread(items, { loadThread: loadMarketplaceThread, markSeen: markChatSeen });
  return { items, errors };
}

// Бейдж опитується кожні 60с у КОЖНІЙ відкритій вкладці адмінки, а під ним
// запити до двох площадок. Коротка спільна кеш-пауза, щоб десяток вкладок не
// перетворювався на десяток обходів API. Відповідь і відкриття треда кеш
// скидають, щоб бейдж погас одразу, а не за пів хвилини.
const TTL_MS = 30_000;
let cache: { at: number; inbox: MarketplaceInbox } | null = null;

export async function getMarketplaceInboxCached(): Promise<MarketplaceInbox> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.inbox;
  const inbox = await loadMarketplaceInbox();
  cache = { at: Date.now(), inbox };
  return inbox;
}

export function invalidateMarketplaceInboxCache(): void {
  cache = null;
}
