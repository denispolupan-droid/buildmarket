/** Чисті правила імпорту реєстрів з пошти (для тестів): класифікація листа, посилання на файл. */

export type MailKind = 'np-register' | 'rzpay-register' | 'rzpay-act' | 'other';

/** Що це за лист — за відправником і темою. */
export function classifyRegisterMail(from: string, subject: string): { source: 'novapay' | 'rozetkapay' | null; kind: MailKind; registerNo: string | null } {
  const f = from.toLowerCase();
  if (/novapay\.ua$/.test(f) && /Реєстр платежів контрагента/i.test(subject)) {
    return { source: 'novapay', kind: 'np-register', registerNo: (subject.match(/№\s*(\d+)/) ?? [])[1] ?? null };
  }
  if (/rozetkapay\.com$/.test(f)) {
    if (/^Реєстр платежів/i.test(subject)) return { source: 'rozetkapay', kind: 'rzpay-register', registerNo: (subject.match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? null };
    if (/Взаєморозрахунки/i.test(subject)) return { source: 'rozetkapay', kind: 'rzpay-act', registerNo: null };
    return { source: 'rozetkapay', kind: 'other', registerNo: null };
  }
  return { source: null, kind: 'other', registerNo: null };
}

/**
 * Чи перечитувати лист, який уже обробляли.
 *
 * Лист обробляється раз — інакше кожен прогін качав би ті самі вкладення. Але
 * «оброблено» не завжди означає «рознесено»: рядок реєстру шукає наше замовлення
 * за ЕН, і якщо номер накладної перевиписали ПІСЛЯ імпорту, рядок пішов у
 * «без замовлення», виплата лягла сумою без order_id, а лист більше не
 * перечитувався. Так 11.10.2026 зависли 388,05 ₴ по #26101021: ЕН змінили, гроші
 * прийшли, а за замовленням і далі висіли 390 ₴ боргу.
 *
 * Тому реєстр НоваПей із нерозпізнаними рядками лишається відкритим ще кілька
 * днів: повторне застосування ідемпотентне (applyNpRegister зводить проводки до
 * складу реєстру й виходить без запису, коли все вже збігається), тож ціна
 * повтору — одне завантаження вкладення, а виграш — виплата сама стає на місце,
 * щойно ЕН у базі поправили.
 */
export const RETRY_UNKNOWN_DAYS = 7;

export type PrevMailImport = { status: string; result: unknown; received_at: string | null };

export function shouldReprocessMail(
  prev: PrevMailImport | undefined,
  kind: MailKind,
  now: Date,
  retryDays = RETRY_UNKNOWN_DAYS,
): boolean {
  if (!prev) return true;
  if (prev.status === 'no-doc' || prev.status === 'error') return true;
  if (prev.status !== 'done' || kind !== 'np-register') return false;
  const unknown = (prev.result as { unknown?: unknown } | null)?.unknown;
  if (!Array.isArray(unknown) || unknown.length === 0) return false;
  const received = prev.received_at ? Date.parse(prev.received_at) : NaN;
  if (!Number.isFinite(received)) return false;
  return now.getTime() - received <= retryDays * 86400_000;
}

/** Посилання на XLSX реєстру з листа RozetkaPay (HTML). */
export function extractRzPayRegisterLink(html: string): string | null {
  const m = /href="(https:\/\/storage\.googleapis\.com\/[^"]+\.xlsx[^"]*)"/i.exec(html);
  return m ? m[1].replace(/&amp;/g, '&') : null;
}
