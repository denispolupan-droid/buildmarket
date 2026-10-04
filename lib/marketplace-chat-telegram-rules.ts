import { escTg, type TelegramInlineButton } from './telegram';
import { CATEGORY_LABELS, type DraftCategory } from './marketplace-chat-draft-types';

/**
 * Чиста частина Telegram-алерту з чернеткою (під тести): текст повідомлення,
 * кнопки, розбір callback_data. Робота з БД і площадками — lib/marketplace-chat-telegram.ts.
 */

export type DraftAlertInput = {
  mp: 'rozetka' | 'prom';
  contact: string | null;
  orderNumber: number | null;
  /** останнє повідомлення покупця, вже без HTML */
  lastIncoming: string;
  draft: { id: string; category: DraftCategory; reply: string; needsHuman: boolean; reason: string | null };
  /** посилання на чат в адмінці */
  link: string;
};

const MP_NAME = { rozetka: 'Rozetka', prom: 'Prom' } as const;
const CB_PREFIX = 'mpd';

export function buildDraftAlertHtml(i: DraftAlertInput): string {
  const head = `💬 <b>${MP_NAME[i.mp]} · ${escTg(i.contact ?? 'покупець')}</b>${i.orderNumber ? ` · №${i.orderNumber}` : ''}`;
  const q = i.lastIncoming.length > 350 ? i.lastIncoming.slice(0, 349) + '…' : i.lastIncoming;
  const lines = [head, `<i>«${escTg(q)}»</i>`, '', `✨ <b>Чернетка</b> · ${escTg(CATEGORY_LABELS[i.draft.category] ?? i.draft.category)}`, escTg(i.draft.reply)];
  if (i.draft.needsHuman) lines.push('', `⚠️ <b>Потрібна людина</b>${i.draft.reason ? `: ${escTg(i.draft.reason)}` : ''}`);
  lines.push('', `<a href="${i.link}">Відкрити чат в адмінці</a>`);
  return lines.join('\n');
}

/** Кнопки: «Надіслати як є» лише коли людина не потрібна; «Пропустити» завжди. */
export function buildDraftAlertKeyboard(i: DraftAlertInput): { inline_keyboard: TelegramInlineButton[][] } {
  const row: TelegramInlineButton[] = [];
  if (!i.draft.needsHuman) row.push({ text: '✅ Надіслати як є', callback_data: `${CB_PREFIX}:send:${i.draft.id}` });
  row.push({ text: '✖ Пропустити', callback_data: `${CB_PREFIX}:skip:${i.draft.id}` });
  return { inline_keyboard: [row, [{ text: 'Відкрити в адмінці', url: i.link }]] };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `mpd:send:<uuid>` / `mpd:skip:<uuid>` → дія + id чернетки; інакше null. */
export function parseDraftCallback(data: string | null | undefined): { action: 'send' | 'skip'; draftId: string } | null {
  if (!data) return null;
  const [prefix, action, id] = data.split(':');
  if (prefix !== CB_PREFIX || (action !== 'send' && action !== 'skip') || !id || !UUID.test(id)) return null;
  return { action, draftId: id };
}

/** Посилання на конкретний чат в адмінці (page.tsx читає ?chat=mp:id). */
export function adminChatLink(siteUrl: string, mp: 'rozetka' | 'prom', chatId: string): string {
  return `${siteUrl}/admin/chat?tab=mp&chat=${encodeURIComponent(`${mp}:${chatId}`)}`;
}
