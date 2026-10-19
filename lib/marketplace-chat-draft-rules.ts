import { htmlToText } from './html-to-text';
import type { MarketplaceChatMessage } from './marketplace-chat-thread';

/**
 * Чиста логіка ШІ-помічника чатів МП (без БД і SDK — під тести):
 * коли готувати чернетку, з чого будувати транскрипт, що площадки забороняють
 * і як рахувати результат. Сам агент — lib/marketplace-chat-assistant.ts.
 */

const TRANSCRIPT_LIMIT = 30;

/** Фото/файли покупця — це теж зміст (повідомлення «лише фото» без тексту). Картка товару — ні. */
const mediaCount = (m: MarketplaceChatMessage) => (m.attachments ?? []).filter(a => a.kind !== 'product').length;
const hasContent = (m: MarketplaceChatMessage) => !!htmlToText(m.body) || mediaCount(m) > 0;

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
    if (!hasContent(m)) continue;
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
    const media = mediaCount(m);
    // Сам вміст фото модель не бачить — але має знати, що покупець його надіслав
    const text = [htmlToText(m.body), media ? `[надіслано фото/файлів: ${media}; вміст невідомий — за потреби попроси менеджера переглянути]` : ''].filter(Boolean).join('\n');
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

export const MAX_INSTRUCTION_CHARS = 500;

/** Вказівка менеджера: обрізати пробіли, порожня або задовга — помилка. */
export function normalizeInstruction(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 2) return { ok: false, error: 'Напишіть, що змінити в чернетці' };
  if (text.length > MAX_INSTRUCTION_CHARS) return { ok: false, error: `Вказівка задовга (максимум ${MAX_INSTRUCTION_CHARS} символів)` };
  return { ok: true, text };
}

/**
 * Блок для моделі: поточна чернетка + вказівка менеджера. Вказівка має
 * пріоритет над стилем і власними міркуваннями агента, але НЕ над правилами
 * площадок і НЕ дозволяє вигадувати факти — це тримає системний промпт і
 * детермінований findPolicyViolations після відповіді.
 */
export function buildRevisionBlock(current: string, instruction: string, previous: string[] = []): string {
  const prev = previous.length ? `\nПопередні вказівки менеджера (уже враховані в чернетці): ${previous.map(p => `«${p}»`).join('; ')}` : '';
  return `=== ПОТОЧНА ЧЕРНЕТКА ===
${current}

=== ВКАЗІВКА МЕНЕДЖЕРА ===
${instruction}${prev}

Перепиши ПОТОЧНУ чернетку за вказівкою менеджера: зміни лише те, про що він просить, решту залиш. Вказівка менеджера — рішення магазину (наприклад, повернення за наш рахунок, знижка, обмін) і має пріоритет над твоїми порадами й стилем. Але правила площадок діють і далі: жодних телефонів, посилань, месенджерів. Факти про замовлення (статус, ТТН, суми) — лише з інструментів; якщо вказівка вимагає факту, якого немає, напиши загально і поясни в reason. Якщо вказівка вже виконує рішення, через яке була потрібна людина, needs_human може стати false. Виклич submit_reply.`;
}

/** Що сталося з чернеткою: пішла як є чи менеджер її правив. */
export function draftOutcome(draft: string, sent: string): 'sent_as_is' | 'edited' {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return norm(draft) === norm(sent) ? 'sent_as_is' : 'edited';
}
