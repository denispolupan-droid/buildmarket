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

/**
 * Чи справжній лист від платіжного сервісу — за вердиктом НАШОГО поштового
 * сервера (Zoho), а не за полем From, яке підробляється одним рядком.
 *
 * Аудит 31.10.2026: реєстр виплат проводиться в облік (гроші по замовленнях), а
 * лист класифікувався лише за адресою відправника. Беремо ПЕРШИЙ заголовок
 * Authentication-Results від mx.zohomail — його дописує наш MX під час
 * прийому, і він стоїть зверху; підроблені заголовки відправника опиняються
 * нижче. Вимога: dmarc=pass і header.from — очікуваний домен (або піддомен).
 * Перевірено на справжніх листах RozetkaPay і NovaPay: обидва dmarc=pass.
 */
export const REGISTER_SENDER_DOMAIN: Record<'novapay' | 'rozetkapay', string> = {
  novapay: 'novapay.ua',
  rozetkapay: 'rozetkapay.com',
};

export function registerMailAuthentic(rawHeaders: string, expectedDomain: string): boolean {
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
  const line = unfolded
    .split(/\r?\n/)
    .find(l => /^Authentication-Results:\s*mx\.zohomail\./i.test(l));
  if (!line) return false;
  if (!/\bdmarc=pass\b/i.test(line)) return false;
  const m = /header\.from=<?(?:[^@\s>;]+@)?([a-z0-9.-]+)>?/i.exec(line);
  if (!m) return false;
  const d = m[1].toLowerCase().replace(/\.$/, '');
  const exp = expectedDomain.toLowerCase();
  return d === exp || d.endsWith('.' + exp);
}
