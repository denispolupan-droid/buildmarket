import { htmlToText } from './html-to-text';
import type { MarketplaceChatMessage } from './marketplace-chat-thread';

/**
 * Чиста логіка ШІ-помічника чатів МП (без БД і SDK — під тести):
 * коли готувати чернетку, з чого будувати транскрипт, що площадки забороняють
 * і як рахувати результат. Сам агент — lib/marketplace-chat-assistant.ts.
 */

const TRANSCRIPT_LIMIT = 30;

/** Мітка останнього повідомлення покупця (сервісні повідомлення Rozetka не рахуємо). */
export function lastIncomingAt(messages: MarketplaceChatMessage[]): string | null {
  let max: string | null = null;
  for (const m of messages) {
    if (m.fromUs || m.author === 'Система' || !m.at) continue;
    if (!max || m.at > max) max = m.at;
  }
  return max;
}

/** Чи чекає покупець на відповідь: останнє змістовне повідомлення — його. */
export function awaitingOurReply(messages: MarketplaceChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!htmlToText(m.body)) continue;
    if (m.author === 'Система') continue;
    return !m.fromUs;
  }
  return false;
}

/** Транскрипт для моделі: останні N повідомлень, HTML прибрано. */
export function buildTranscript(messages: MarketplaceChatMessage[]): string {
  const tail = messages.slice(-TRANSCRIPT_LIMIT);
  const lines: string[] = [];
  for (const m of tail) {
    const text = htmlToText(m.body);
    if (!text) continue;
    const who = m.fromUs ? 'МИ (магазин)' : m.author === 'Система' ? 'СИСТЕМА площадки' : `ПОКУПЕЦЬ${m.author ? ` (${m.author})` : ''}`;
    lines.push(`[${m.at ?? '—'}] ${who}:\n${text}`);
  }
  return lines.join('\n\n');
}

/**
 * Правила площадок: Rozetka і Prom карають за виведення покупця з платформи.
 * Телефони, месенджери, посилання на свій сайт у чаті — привід для санкцій.
 * Детермінована перевірка поверх промпта: якщо модель усе ж вставила контакт,
 * чернетка йде до людини з поясненням.
 */
export function findPolicyViolations(text: string): string[] {
  const out: string[] = [];
  // Межі (?<!\d)/(?!\d) — щоб ТТН із 14 цифр не читався як телефон усередині.
  if (/(?<!\d)(\+?38[\s(-]*)?0\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/.test(text)) out.push('телефон');
  if (/https?:\/\/|www\.|fixline\.com\.ua/i.test(text)) out.push('посилання');
  if (/\b(viber|telegram|вайбер|телеграм|whatsapp)\b/i.test(text)) out.push('месенджер');
  if (/@[a-z0-9._-]+\.[a-z]{2,}/i.test(text)) out.push('email');
  return out;
}

/** Що сталося з чернеткою: пішла як є чи менеджер її правив. */
export function draftOutcome(draft: string, sent: string): 'sent_as_is' | 'edited' {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return norm(draft) === norm(sent) ? 'sent_as_is' : 'edited';
}
