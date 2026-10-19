import { getRozetkaChatThread } from './rozetka-api';
import { getPromChatHistory } from './prom-api';
import type { MarketplaceId } from './marketplace-chat-seen';

/**
 * Тред одного чату маркетплейсу в єдиному вигляді для адмінки й ШІ-помічника.
 * Живі дані площадки, без дзеркала в БД (як і список чатів).
 */

/**
 * Вкладення повідомлення. Фото/файли покупця віддаються площадками лише з
 * нашим токеном, тому url — на проксі адмінки (/api/admin/marketplace-chats/file),
 * а не на площадку. product — картка товару, з якої покупець відкрив чат
 * (Prom «context»; картинка публічна).
 */
export type ChatAttachment = {
  kind: 'image' | 'file' | 'product';
  name: string;
  url: string;
  size?: number | null;
};

export type MarketplaceChatMessage = {
  body: string;
  at: string | null;
  fromUs: boolean;
  author: string | null;   // 'Система' для сервісних повідомлень Rozetka
  attachments?: ChatAttachment[];
};

export type MarketplaceThread = {
  messages: MarketplaceChatMessage[];
  receiverId: number | null;     // rozetka: user_id покупця (потрібен для відповіді)
  contact: string | null;        // імʼя покупця
  phone: string | null;          // prom інколи віддає user_phone
  /** Prom: id вхідних зі статусом new — роут треда позначає їх прочитаними */
  promUnreadIncoming: number[];
};

const FILE_PROXY = '/api/admin/marketplace-chats/file';

type RzFile = { id: number; name?: string | null; size?: number | null; typeName?: string | null };
type PromAttachment = { attachment_uid?: string; attachment_name?: string; attachment_size?: number; attachment_type?: string; attachment_mime_type?: string };

export function rozetkaAttachments(files: RzFile[] | null | undefined): ChatAttachment[] {
  return (files ?? []).filter(f => Number.isInteger(f.id)).map(f => ({
    kind: (f.typeName ?? '').toUpperCase() === 'IMG' ? 'image' : 'file',
    name: f.name ?? `файл ${f.id}`,
    url: `${FILE_PROXY}?mp=rozetka&id=${f.id}`,
    size: f.size ?? null,
  }));
}

const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function promAttachments(m: { type?: string; attachments?: PromAttachment[] | null; context_item_image_url?: string | null; context_item_type?: string | null }): ChatAttachment[] {
  const out: ChatAttachment[] = [];
  for (const a of m.attachments ?? []) {
    if (!a.attachment_uid || !UID.test(a.attachment_uid)) continue;
    const image = (a.attachment_type ?? '').toUpperCase() === 'IMAGE' || (a.attachment_mime_type ?? '').startsWith('image/');
    out.push({ kind: image ? 'image' : 'file', name: a.attachment_name ?? 'файл', url: `${FILE_PROXY}?mp=prom&uid=${a.attachment_uid}`, size: a.attachment_size ?? null });
  }
  if (m.type === 'context' && m.context_item_image_url && /^https:\/\/images\.prom\.ua\//.test(m.context_item_image_url)) {
    out.push({ kind: 'product', name: 'товар, з якого написали', url: m.context_item_image_url });
  }
  return out;
}

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
      const attachments = rozetkaAttachments(m.files as RzFile[] | undefined);
      messages.push({
        body: m.body ?? '',
        at: m.created ?? null,
        fromUs: m.seller_id != null,
        author: m.seller_id != null ? 'Ми' : m.sender === 0 ? 'Система' : contact,
        ...(attachments.length ? { attachments } : {}),
      });
    }
  } else {
    const history = await getPromChatHistory(id);
    // room_ident = {buyer_user_id}_{company_id}_buyer → перша частина = покупець
    const buyerIdent = id.split('_')[0];
    for (const m of history) {
      const fromUs = m.user_ident != null && String(m.user_ident) !== buyerIdent;
      const attachments = promAttachments(m as unknown as Parameters<typeof promAttachments>[0]);
      // Тип без тексту (attachment/context) — показуємо вкладення, а не «[attachment]»
      const fallback = m.type === 'context' ? 'Звернення зі сторінки товару' : (m.type !== 'message' && !attachments.length ? `[${m.type}]` : '');
      messages.push({
        body: m.body ?? fallback,
        at: m.date_sent ?? null,
        fromUs,
        author: fromUs ? 'Ми' : (m.user_name ?? null),
        ...(attachments.length ? { attachments } : {}),
      });
      if (!fromUs && m.status === 'new') promUnreadIncoming.push(m.id);
      if (!fromUs && !contact && m.user_name) contact = m.user_name;
      if (!fromUs && !phone && m.user_phone) phone = m.user_phone;
    }
  }

  return { messages, receiverId, contact, phone, promUnreadIncoming };
}
