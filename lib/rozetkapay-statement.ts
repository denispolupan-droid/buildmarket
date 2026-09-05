/**
 * Чистий розбір виплати RozetkaPay у виписці Monobank (без залежностей — під тести).
 *
 * Усі гроші площадок — Rozetka Pay, наложка через Rozetka Доставка, Пром-оплата
 * (evopay) — приходять від ТОВ «РОЗЕТКА ПЕЙ» одним переказом за операційний
 * день мінус ~1,5 % винагороди. Призначення типове:
 *   «Переказ коштів за операції 31.08.2026-31.08.2026 зг.дог.№3198107136-П від
 *    15.07.2026 на суму 3835 грн за виключ. винагор. 57.53 грн за їх переказ. Без ПДВ.»
 * Розбивки по замовленнях у ньому немає (перевірено 05.09: сума за день не
 * збігається з доставленими за той день) — її дає лише Reports API.
 */

const RZPAY_COUNTER_RE = /розетка\s*пей|rozetka\s*pay/i;
const RZPAY_COMMENT_RE = /переказ коштів за операції\s+(\d{2}\.\d{2}\.\d{4})-(\d{2}\.\d{2}\.\d{4})\s+зг\.\s*дог\.\s*№\s*(\S+)/i;
const GROSS_RE = /на суму\s+([\d\s]+(?:[.,]\d+)?)\s*грн/i;
const FEE_RE   = /винагор\.\s*([\d\s]+(?:[.,]\d+)?)\s*грн/i;

export type RzPayPayout = {
  contract: string;
  periodFrom: string;   // YYYY-MM-DD (операційний день, за який виплата)
  periodTo: string;
  gross: number;        // сума операцій
  fee: number;          // винагорода RozetkaPay
  net: number;          // зараховано на рахунок
};

const num = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
const iso = (d: string) => { const [dd, mm, yyyy] = d.split('.'); return `${yyyy}-${mm}-${dd}`; };

/**
 * Розбір рядка виписки (amount — у копійках, як у сирій виписці Mono).
 * null — якщо це не виплата RozetkaPay. Нетто береться з суми транзакції;
 * брутто/винагорода — з призначення. Якщо брутто − винагорода ≠ нетто (з
 * копійчаною похибкою), винагороду рахуємо як різницю: банк — джерело правди.
 */
export function parseRzPayPayout(item: { amount: number; comment?: string | null; description?: string | null; counterName?: string | null }): RzPayPayout | null {
  const who = `${item.counterName ?? ''} ${item.description ?? ''}`;
  const comment = item.comment ?? '';
  if (!RZPAY_COUNTER_RE.test(who) && !/зг\.\s*дог\.\s*№\s*\S+-П/i.test(comment)) return null;
  const m = comment.match(RZPAY_COMMENT_RE);
  if (!m) return null;
  const net = Math.round(item.amount) / 100;
  if (!(net > 0)) return null;
  const grossM = comment.match(GROSS_RE);
  const feeM   = comment.match(FEE_RE);
  const gross = grossM ? num(grossM[1]) : net;
  let fee = feeM ? num(feeM[1]) : Math.round((gross - net) * 100) / 100;
  if (Math.abs(gross - fee - net) > 0.05) fee = Math.round((gross - net) * 100) / 100;
  if (!(gross > 0) || fee < 0) return null;
  return { contract: m[3], periodFrom: iso(m[1]), periodTo: iso(m[2]), gross, fee, net };
}
