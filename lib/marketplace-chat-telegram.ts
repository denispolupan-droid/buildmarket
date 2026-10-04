import { createServiceClient } from './supabase';
import { sendTelegram, editTelegramMessage } from './telegram';
import { htmlToText } from './html-to-text';
import { SITE_URL } from './site';
import { getRozetkaChats, replyRozetkaChat } from './rozetka-api';
import { getPromChatRooms, sendPromChatMessage } from './prom-api';
import { loadChatSeen, isChatUnread, markChatSeen, type MarketplaceId } from './marketplace-chat-seen';
import { loadMarketplaceThread, type MarketplaceChatMessage } from './marketplace-chat-thread';
import { awaitingOurReply, lastIncomingAt, draftOutcome } from './marketplace-chat-draft-rules';
import { getOrCreateDraft } from './marketplace-chat-assistant';
import type { DraftCategory } from './marketplace-chat-draft-types';
import { adminChatLink, buildDraftAlertHtml, buildDraftAlertKeyboard } from './marketplace-chat-telegram-rules';

/**
 * Довесок до агента №1: алерт про нове повідомлення покупця в чаті МП несе
 * готову чернетку і кнопку «Надіслати як є» — відповідати можна з телефону,
 * не відкриваючи адмінку. Відправляє все одно людина (натисканням); сам агент
 * на площадку не пише.
 *
 * Дедуплікація: один вхідний = одна чернетка (ключ last_incoming_at, міграція
 * 122) = один алерт (alerted_at, міграція 128). Крон ходить кожні 5 хв, але
 * повторно не шумить, поки покупець не напише знову.
 */

const MAX_PER_RUN = 4;

type Candidate = { chatId: string; subject: string | null; orderNumber: number | null; ourOrderId: string | null; updatedAt: string | null };

async function candidates(mp: MarketplaceId): Promise<Candidate[]> {
  const seen = await loadChatSeen();
  if (mp === 'rozetka') {
    const [o, i] = await Promise.all([getRozetkaChats('orders'), getRozetkaChats('items').catch(() => ({ chats: [] }))]);
    const chats = [...o.chats, ...i.chats].filter(c => isChatUnread(seen, 'rozetka', String(c.id), c.updated ?? c.created ?? null));
    // Привʼязка до нашого замовлення — як у списку чатів
    const rzIds = [...new Set(chats.map(c => c.order_id).filter((v): v is number => !!v))];
    const db = createServiceClient();
    const { data: ours } = rzIds.length
      ? await db.from('orders').select('id, order_number, rozetka_order_id').in('rozetka_order_id', rzIds).limit(rzIds.length)
      : { data: [] as { id: string; order_number: number; rozetka_order_id: number }[] };
    const byRz = new Map((ours ?? []).map(o => [Number(o.rozetka_order_id), o]));
    return chats.map(c => {
      const our = c.order_id ? byRz.get(Number(c.order_id)) : null;
      return { chatId: String(c.id), subject: c.subject ?? null, orderNumber: our?.order_number ?? null, ourOrderId: our?.id ?? null, updatedAt: c.updated ?? c.created ?? null };
    });
  }
  const rooms = await getPromChatRooms({ limit: 20 });
  return rooms
    .filter(r => isChatUnread(seen, 'prom', r.ident, r.date_sent ?? null))
    .map(r => ({ chatId: r.ident, subject: null, orderNumber: null, ourOrderId: null, updatedAt: r.date_sent ?? null }));
}

function lastIncomingText(messages: MarketplaceChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.fromUs || m.author === 'Система') continue;
    const t = htmlToText(m.body);
    if (t) return t;
  }
  return '';
}

/** Крон: непрочитані чати площадки → чернетка → алерт з кнопками (раз на вхідне). */
export async function alertMarketplaceChatDrafts(mp: MarketplaceId): Promise<{ unread: number; alerted: number; skipped: number }> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const list = await candidates(mp);
  let alerted = 0, skipped = 0;
  const db = createServiceClient();

  for (const c of list.slice(0, MAX_PER_RUN)) {
    try {
      const thread = await loadMarketplaceThread(mp, c.chatId);
      if (!awaitingOurReply(thread.messages)) { skipped++; continue; }
      const key = lastIncomingAt(thread.messages);
      if (!key) { skipped++; continue; }

      const draft = await getOrCreateDraft(
        { mp, chatId: c.chatId, lastIncomingAt: key },
        { mp, messages: thread.messages, contact: thread.contact, phone: thread.phone, orderNumber: c.orderNumber, ourOrderId: c.ourOrderId, subject: c.subject },
      );
      if (!draft.id) { skipped++; continue; }   // журнал недоступний — без нього не дедуплікувати, краще змовчати

      const { data: row } = await db.from('marketplace_chat_drafts').select('alerted_at').eq('id', draft.id).maybeSingle();
      if (row?.alerted_at) { skipped++; continue; }

      const input = {
        mp, contact: thread.contact, orderNumber: c.orderNumber, lastIncoming: lastIncomingText(thread.messages),
        draft: { id: draft.id, category: draft.category as DraftCategory, reply: draft.reply, needsHuman: draft.needsHuman, reason: draft.reason },
        link: adminChatLink(SITE_URL, mp, c.chatId),
      };
      const msgId = chatId ? await sendTelegram(chatId, buildDraftAlertHtml(input), { replyMarkup: buildDraftAlertKeyboard(input), disablePreview: true }) : null;
      await db.from('marketplace_chat_drafts').update({ alerted_at: new Date().toISOString(), tg_message_id: msgId }).eq('id', draft.id);
      alerted++;
    } catch (err) {
      console.error('[mp-chat-telegram]', mp, c.chatId, err instanceof Error ? err.message : err);
      skipped++;
    }
  }
  return { unread: list.length, alerted, skipped };
}

// ── Кнопки з Telegram ───────────────────────────────────────────────────────

type DraftRow = { id: string; mp: MarketplaceId; chat_id: string; last_incoming_at: string; draft: string; outcome: string | null; tg_message_id: number | null; needs_human: boolean };

async function loadDraftRow(draftId: string): Promise<DraftRow | null> {
  const db = createServiceClient();
  const { data } = await db.from('marketplace_chat_drafts')
    .select('id, mp, chat_id, last_incoming_at, draft, outcome, tg_message_id, needs_human').eq('id', draftId).maybeSingle();
  return (data as DraftRow | null) ?? null;
}

async function finalizeTelegram(row: DraftRow, suffix: string): Promise<void> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId || !row.tg_message_id) return;
  const head = row.mp === 'rozetka' ? 'Rozetka' : 'Prom';
  await editTelegramMessage(chatId, row.tg_message_id, `💬 <b>${head}</b> · чернетка\n\n${suffix}`);
}

/** «Надіслати як є»: перевірки → відправка на площадку → журнал → прибрати кнопки. */
export async function sendDraftFromTelegram(draftId: string): Promise<{ ok: boolean; message: string }> {
  const row = await loadDraftRow(draftId);
  if (!row) return { ok: false, message: 'Чернетку не знайдено' };
  if (row.outcome) return { ok: false, message: row.outcome === 'discarded' ? 'Цю чернетку вже пропущено' : 'Уже надіслано' };
  if (row.needs_human) return { ok: false, message: 'Ця чернетка потребує людини — відкрийте чат в адмінці' };

  // Покупець міг написати ще, поки повідомлення лежало в Telegram — тоді
  // відповідь уже не на те питання. Відправляємо лише на той самий вхідний.
  const thread = await loadMarketplaceThread(row.mp, row.chat_id);
  if (lastIncomingAt(thread.messages) !== row.last_incoming_at) {
    return { ok: false, message: 'Покупець написав ще — відкрийте чат, чернетка застаріла' };
  }
  if (!awaitingOurReply(thread.messages)) return { ok: false, message: 'На це вже відповіли' };

  const text = row.draft.trim();
  if (row.mp === 'rozetka') {
    if (!thread.receiverId) return { ok: false, message: 'Невідомий отримувач Rozetka' };
    await replyRozetkaChat({ chatId: Number(row.chat_id), receiverId: thread.receiverId, body: text });
  } else {
    await sendPromChatMessage(row.chat_id, text);
  }

  const db = createServiceClient();
  await db.from('marketplace_chat_drafts').update({
    outcome: draftOutcome(row.draft, text), sent_text: text, outcome_at: new Date().toISOString(),
  }).eq('id', row.id);
  // Менеджер обробив чат з Telegram — в адмінці він більше не «непрочитаний»
  try {
    const after = await loadMarketplaceThread(row.mp, row.chat_id);
    const latest = after.messages.reduce<string | null>((m, x) => (x.at && (!m || x.at > m) ? x.at : m), null);
    await markChatSeen(row.mp, row.chat_id, latest);
  } catch { /* не критично */ }

  await finalizeTelegram(row, `✅ <b>Надіслано покупцю</b>\n${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`);
  return { ok: true, message: 'Надіслано' };
}

/** «Пропустити»: журнал + прибрати кнопки; чат лишається непрочитаним в адмінці. */
export async function discardDraftFromTelegram(draftId: string): Promise<{ ok: boolean; message: string }> {
  const row = await loadDraftRow(draftId);
  if (!row) return { ok: false, message: 'Чернетку не знайдено' };
  if (row.outcome) return { ok: false, message: 'Уже оброблено' };
  const db = createServiceClient();
  await db.from('marketplace_chat_drafts').update({ outcome: 'discarded', outcome_at: new Date().toISOString() }).eq('id', row.id);
  await finalizeTelegram(row, '✖ Пропущено — відповісти з адмінки');
  return { ok: true, message: 'Пропущено' };
}
