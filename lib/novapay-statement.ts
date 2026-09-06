/**
 * Чистий розбір виписки NovaPay (GetAccountExtract → поле `extract`, XML) — без
 * залежностей, під тести.
 *
 * Виплата наложки (COD, «Контроль оплати») приходить одним переказом за реєстром НП:
 *   «Переказ коштів по платежам, прийнятим від населення за товари/послуги згідно
 *    реєстру № 16108345 від 04.09.2026 …»
 * Складу реєстру (які ЕН, комісія) API не віддає: GetRegister → APIError, трекінг
 * НП (getStatusDocuments) полів виплати для «Контролю оплати» не має. Тому з
 * виписки беремо лише дати й суми — для правила «вручено після останнього
 * реєстру = НоваПей ще не виплатила».
 */

export type NovapayRegisterPayout = { date: string; net: number; register: string | null; docId: string | null };

export type NovapayStatementDoc = {
  docId: string | null;
  date: string;             // YYYY-MM-DD (DayDate)
  amount: number;
  direction: 'in' | 'out';  // in — зарахування на наш рахунок
  counterparty: string;     // назва другої сторони
  purpose: string;
  code: string | null;
};

const toIso = (d: string) => { const [dd, mm, yyyy] = d.split('.'); return `${yyyy}-${mm}-${dd}`; };
const field = (b: string, t: string) => (b.match(new RegExp(`<${t}>([^<]*)<`)) ?? [])[1] ?? '';

/** Наш рахунок — з шапки виписки (<Account>). */
export function extractOwnAccount(extractXml: string): string | null {
  return (extractXml.match(/<Account>(\d+)<\/Account>/) ?? [])[1] ?? null;
}

/** Усі документи виписки з напрямком відносно нашого рахунку. */
export function parseNovapayStatement(extractXml: string, ourAccount: string | null = extractOwnAccount(extractXml)): NovapayStatementDoc[] {
  const out: NovapayStatementDoc[] = [];
  for (const m of extractXml.matchAll(/<Docs Amount="([^"]+)"[^>]*>([\s\S]*?)<\/Docs>/g)) {
    const b = m[2];
    const credit = field(b, 'CreditAccount');
    const dir: 'in' | 'out' = ourAccount ? (credit === ourAccount ? 'in' : 'out') : (/НоваПей/i.test(field(b, 'DebitName')) ? 'in' : 'out');
    out.push({
      docId: field(b, 'ID') || null,
      date: toIso(field(b, 'DayDate') || field(b, 'OrgDate')),
      amount: Number(m[1]),
      direction: dir,
      counterparty: dir === 'in' ? field(b, 'DebitName') : field(b, 'CreditName'),
      purpose: field(b, 'Purpose').replace(/\s+/g, ' ').trim(),
      code: field(b, 'Code') || null,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.docId ?? '').localeCompare(b.docId ?? ''));
}

export type NovapayDocKind = 'cod_payout' | 'other_in' | 'debit';

/** Клас документа виписки: виплата наложки за реєстром НП / інше зарахування / списання. */
export function classifyNovapayDoc(doc: Pick<NovapayStatementDoc, 'direction' | 'purpose' | 'counterparty'>): NovapayDocKind {
  if (doc.direction === 'out') return 'debit';
  if (/реєстру/i.test(doc.purpose) && /НоваПей|NovaPay/i.test(doc.counterparty)) return 'cod_payout';
  return 'other_in';
}

/** № реєстру НП з призначення виплати. */
export function registerNumberOf(purpose: string): string | null {
  return (purpose.match(/реєстру\s*№\s*(\d+)/) ?? [])[1] ?? null;
}

/**
 * Підбір складу реєстру НП: які вручені наложки він виплачує.
 *
 * Емпірика 06.09.2026 (64 реєстри з 19.07): НоваПей платить у ДЕНЬ вручення
 * мінус 0,5 % (60/64 реєстрів зійшлись точно за підбором підмножини). Кандидати —
 * ще не виплачені наложки, вручені за останні кілька днів. Перебір бітовою
 * маскою до 22 кандидатів; допуск 6 копійок (округлення по кожній ЕН).
 * null — склад не підібрано (тоді реєстр проводиться сумою, а різницю
 * добирає правило утримань).
 */
export function matchNpRegister(
  net: number,
  candidates: { id: string; gross: number }[],
  feePct = 0.5,
  tol = 0.06,
): { ids: string[]; nets: Record<string, number> } | null {
  const n = Math.min(candidates.length, 22);
  if (n === 0) return null;
  const nets = candidates.slice(0, n).map(c => Math.round(c.gross * (1 - feePct / 100) * 100) / 100);
  // Найменша підмножина — щоб не «зʼїсти» зайві ЕН, коли є кілька рішень
  let best: number | null = null; let bestBits = 99;
  for (let mask = 1; mask < (1 << n); mask++) {
    let s = 0, bits = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { s += nets[i]; bits++; }
    if (Math.abs(s - net) < tol && bits < bestBits) { best = mask; bestBits = bits; }
  }
  if (best === null) return null;
  const ids: string[] = []; const map: Record<string, number> = {};
  for (let i = 0; i < n; i++) if (best & (1 << i)) { ids.push(candidates[i].id); map[candidates[i].id] = nets[i]; }
  return { ids, nets: map };
}

/** Лише вхідні перекази за реєстрами НП (виплати наложки). */
export function parseNovapayRegisterPayouts(extractXml: string, ourAccount: string | null = extractOwnAccount(extractXml)): NovapayRegisterPayout[] {
  return parseNovapayStatement(extractXml, ourAccount)
    .filter(d => d.direction === 'in' && /реєстру/i.test(d.purpose))
    .map(d => ({ date: d.date, net: d.amount, register: (d.purpose.match(/реєстру\s*№\s*(\d+)/) ?? [])[1] ?? null, docId: d.docId }));
}
