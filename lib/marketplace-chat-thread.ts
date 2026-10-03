import { getRozetkaChatThread } from './rozetka-api';
import { getPromChatHistory } from './prom-api';
import type { MarketplaceId } from './marketplace-chat-seen';

/**
 * Тред одного чату маркетплейсу в єдиному вигляді для адмінки й ШІ-помічника.
 * Живі дані площадки, без дзеркала в БД (як і список чатів).
 */

export type MarketplaceChatMessage = {
  body: string;
  at: string | null;
  fromUs: boolean;
  author: string | null;   // 'Система' для сервісних повідомлень Rozetka
};

export type MarketplaceThread = {
  messages: MarketplaceChatMessage[];
  receiverId: number | null;     // rozetka: user_id покупця (потрібен для відповіді)
  contact: string | null;        // імʼя покупця
  phone: string | null;          // prom інколи віддає user_phone
  /** Prom: id вхідних зі статусом new — роут треда позначає їх прочитаними */
  promUnreadIncoming: number[];
};

export async function loadMarketplaceThread(mp: MarketplaceId, id: string): Promise<MarketplaceThread> {
  const messages: MarketplaceChatMessage[] = [];
  let receiverId: number | null = null;
  let contact: string | null = null;
  let phone: string | null = null;
  const promUnreadIncoming: number[] = [];

  if (mp === 'rozetka') {
    const chat = await getRozetkaChatThread(Number(id));
    receiverId = chat.user_id ?? chat.user?.id ?? null;
    contact = chat.user?.contact_fio?.trim() || null;
    for (const m of chat.messages ?? []) {
      messages.push({
        body: m.body ?? '',
        at: m.created ?? null,
        fromUs: m.seller_id != null,
        author: m.seller_id != null ? 'Ми' : m.sender === 0 ? 'Система' : contact,
      });
    }
  } else {
    const history = await getPromChatHistory(id);
    // room_ident = {buyer_user_id}_{company_id}_buyer → перша частина = покупець
    const buyerIdent = id.split('_')[0];
    for (const m of history) {
      const fromUs = m.user_ident != null && String(m.user_ident) !== buyerIdent;
      messages.push({
        body: m.body ?? (m.type !== 'message' ? `[${m.type}]` : ''),
        at: m.date_sent ?? null,
        fromUs,
        author: fromUs ? 'Ми' : (m.user_name ?? null),
      });
      if (!fromUs && m.status === 'new') promUnreadIncoming.push(m.id);
      if (!fromUs && !contact && m.user_name) contact = m.user_name;
      if (!fromUs && !phone && m.user_phone) phone = m.user_phone;
    }
  }

  return { messages, receiverId, contact, phone, promUnreadIncoming };
}
