import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { getRozetkaChats } from '../../../../../lib/rozetka-api';
import { getPromChatRooms } from '../../../../../lib/prom-api';
import { loadChatSeen, isChatUnread } from '../../../../../lib/marketplace-chat-seen';

// Лічильник непрочитаних для бейджа в сайдбарі — на ВЛАСНОМУ признаку
// прочитаності (lib/marketplace-chat-seen), а не на лічильниках площадок.
// Раніше брали Rozetka /messages/counts: він показує стан їхнього кабінету,
// тож повідомлення, відкрите в застосунку Rozetka, гасило бейдж, хоча наш
// менеджер його не бачив. Prom же лічильника на рівні кімнати не має взагалі —
// його чати не підсвічувались ніколи.

// Бейдж опитується кожні 60с у КОЖНІЙ відкритій вкладці адмінки, а під ним три
// запити до площадок. Тримаємо коротку спільну кеш-паузу, щоб десяток вкладок
// не перетворювався на десяток обходів API.
const TTL_MS = 30_000;
let cache: { at: number; count: number } | null = null;

export async function GET() {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ count: cache.count });
  }

  try {
    const [seen, ordersChats, itemsChats, promRooms] = await Promise.all([
      loadChatSeen(),
      getRozetkaChats('orders').catch(() => ({ chats: [] })),
      getRozetkaChats('items').catch(() => ({ chats: [] })),
      getPromChatRooms({ limit: 20 }).catch(() => []),
    ]);

    let count = 0;
    for (const c of [...ordersChats.chats, ...itemsChats.chats]) {
      if (isChatUnread(seen, 'rozetka', String(c.id), c.updated ?? c.created ?? null)) count++;
    }
    for (const r of promRooms) {
      if (isChatUnread(seen, 'prom', r.ident, r.date_sent ?? null)) count++;
    }

    cache = { at: Date.now(), count };
    return NextResponse.json({ count });
  } catch {
    // Площадка недоступна — бейдж не вигадуємо, але й сайдбар не ламаємо.
    return NextResponse.json({ count: cache?.count ?? 0 });
  }
}
