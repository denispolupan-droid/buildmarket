/**
 * Реєстр переказів RozetkaPay (XLSX з кабінету, «Реєстр платежів ФОП … <договір>-П») —
 * чиста частина: розбір рядків і план рознесення. Без БД і без xlsx (тести
 * годують масивами рядків; читання файлу — lib/rozetkapay-register-apply).
 *
 * Навіщо. API виплат RozetkaPay не дає (відповідь підтримки 07.09.2026), тож
 * склад виплати досі ПІДБИРАВСЯ підмножиною замовлень під брутто. Реєстр із
 * кабінету — факт: по кожному платежу є «Назва проекту» (Prom / Rozetka) і
 * «№ замовлення» площадки. 09.09 реєстр показав, що підбір по виплаті 09.09
 * (902 ₴) склав її з чужих замовлень із такими самими сумами (#26081071 +
 * #26081165 замість #26091039 + #26091026) — тому імпорт не лише доповнює,
 * а й ПЕРЕПИСУЄ склад виплати: зайве сторнується, відсутнє проводиться.
 *
 * Формат (перевірено на живому файлі 09.09.2026):
 *   A1 «Реєстр переказів»; «Отримувач:»; «Договір:» 3198107136-П;
 *   «Період:» дд.мм.рррр дд.мм.рррр; «Дата формування:»; порожні рядки;
 *   шапка: № | Дата перерахування | Дата та час платежу | Сума платежу |
 *          Сума комісії з отримувача | Сума комісії з платника |
 *          Сума перерахованих коштів | Назва проекту | № замовлення | … ;
 *   рядки; «Всього:» у колонці «Дата та час платежу».
 */

export type RzPayRegisterRow = {
  n: number;
  payoutDate: string;          // ISO дата перерахування
  paidAt: string | null;       // дата-час платежу покупця (як у файлі)
  gross: number;               // Сума платежу
  fee: number;                 // комісія з отримувача (у файлі від'ємна — беремо модуль)
  net: number;                 // Сума перерахованих коштів
  project: string;             // Назва проекту
  marketplace: 'prom' | 'rozetka' | null;
  marketplaceOrderId: string;  // № замовлення (id площадки)
};

export type RzPayRegister = {
  contract: string | null;
  periodFrom: string;          // ISO
  periodTo: string;            // ISO
  generatedAt: string | null;  // ISO
  rows: RzPayRegisterRow[];
  totalGross: number;
  totalNet: number;
};

const isoOf = (s: unknown): string | null => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(s ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function marketplaceOfProject(project: string): 'prom' | 'rozetka' | null {
  const p = project.toLowerCase();
  if (/prom/.test(p)) return 'prom';
  if (/rozetka|розетк/.test(p)) return 'rozetka';
  return null;
}

/** Розбір аркуша (масив рядків, як віддає sheet_to_json({header:1})). Кидає на чужому форматі. */
export function parseRzPayRegister(sheet: unknown[][]): RzPayRegister {
  const cell = (r: unknown[], i: number) => (r[i] === undefined || r[i] === null) ? '' : r[i];
  let contract: string | null = null, periodFrom: string | null = null, periodTo: string | null = null, generatedAt: string | null = null;
  let headerIdx = -1;
  for (let i = 0; i < sheet.length; i++) {
    const r = sheet[i] ?? [];
    const first = String(cell(r, 0)).trim();
    if (/^Договір/i.test(first)) contract = String(cell(r, 1)).trim() || null;
    else if (/^Період/i.test(first)) { periodFrom = isoOf(cell(r, 1)); periodTo = isoOf(cell(r, 2)) ?? periodFrom; }
    else if (/^Дата формування/i.test(first)) generatedAt = isoOf(cell(r, 1));
    else if (first === '№' && r.some(c => /Сума платежу/i.test(String(c)))) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('Це не реєстр переказів RozetkaPay: не знайдено шапку «№ … Сума платежу»');
  if (!periodFrom || !periodTo) throw new Error('У реєстрі немає рядка «Період:»');

  const header = (sheet[headerIdx] ?? []).map(c => String(c ?? '').trim());
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const cPayout = col(/^Дата перерахування/i), cPaidAt = col(/^Дата та час платежу/i), cGross = col(/^Сума платежу/i);
  const cFee = col(/^Сума комісії з отримувача/i), cNet = col(/^Сума перерахованих/i), cProject = col(/^Назва проекту/i), cOrder = col(/^№ замовлення/i);
  if ([cPayout, cGross, cNet, cProject, cOrder].some(i => i < 0)) throw new Error('У реєстрі бракує колонок (дата перерахування / сума / проект / № замовлення)');

  const rows: RzPayRegisterRow[] = [];
  for (let i = headerIdx + 1; i < sheet.length; i++) {
    const r = sheet[i] ?? [];
    if (r.some(c => /^Всього/i.test(String(c ?? '')))) break;
    const n = num(cell(r, 0));
    const payoutDate = isoOf(cell(r, cPayout));
    if (!(n > 0) || !payoutDate) continue;
    const project = String(cell(r, cProject)).trim();
    rows.push({
      n, payoutDate, paidAt: String(cell(r, cPaidAt)).trim() || null,
      gross: r2(num(cell(r, cGross))), fee: r2(Math.abs(num(cell(r, cFee)))), net: r2(num(cell(r, cNet))),
      project, marketplace: marketplaceOfProject(project),
      marketplaceOrderId: String(cell(r, cOrder)).trim().replace(/\.0$/, ''),
    });
  }
  if (!rows.length) throw new Error('У реєстрі немає жодного платежу');
  return {
    contract, periodFrom, periodTo, generatedAt, rows,
    totalGross: r2(rows.reduce((s, x) => s + x.gross, 0)),
    totalNet:   r2(rows.reduce((s, x) => s + x.net, 0)),
  };
}

export type RzPayKnownOrder = { id: string; order_number: number; party: string };
export type RzPayApplyPlan = {
  /** проводки «виплата → замовлення», яких ще немає (або сума інша) */
  post: { orderId: string; orderNumber: number; party: string; amount: number; marketplaceOrderId: string }[];
  /** сторно попереднього (підібраного) складу, якого в реєстрі немає або сума не та */
  undo: { orderId: string; orderNumber: number; party: string; amount: number }[];
  /** рядки реєстру без нашого замовлення (id площадки невідомий) */
  unknown: { marketplaceOrderId: string; project: string; gross: number }[];
  /** уже рознесено правильно — нічого не робимо */
  keep: number;
};

/**
 * План рознесення однієї виплати за реєстром.
 *  - orderByMarketplaceId: наші замовлення за id площадки (з урахуванням площадки з «Назви проекту»)
 *  - existingNet: скільки з ЦІЄЇ виплати вже проведено на кожне замовлення (alloc − undo)
 *  - partyByOrder: сторона дебітора замовлення (mp:prom / mp:rozetka / покупець для рахунків)
 * Один і той самий id площадки може трапитись у реєстрі двічі (дві оплати одного
 * замовлення) — суми складаються.
 */
export function planRzPayRegisterApply(
  register: RzPayRegister,
  orderByMarketplaceId: (marketplace: 'prom' | 'rozetka' | null, marketplaceOrderId: string) => RzPayKnownOrder | null,
  existingNet: Record<string, number>,
): RzPayApplyPlan {
  const want: Record<string, { order: RzPayKnownOrder; amount: number; marketplaceOrderId: string }> = {};
  const unknown: RzPayApplyPlan['unknown'] = [];
  for (const row of register.rows) {
    const o = orderByMarketplaceId(row.marketplace, row.marketplaceOrderId);
    if (!o) { unknown.push({ marketplaceOrderId: row.marketplaceOrderId, project: row.project, gross: row.gross }); continue; }
    const w = (want[o.id] ??= { order: o, amount: 0, marketplaceOrderId: row.marketplaceOrderId });
    w.amount = r2(w.amount + row.gross);
  }
  const plan: RzPayApplyPlan = { post: [], undo: [], unknown, keep: 0 };
  // Що вже стоїть на цій виплаті, але в реєстрі відсутнє чи сума інша — сторно повністю
  for (const [orderId, net] of Object.entries(existingNet)) {
    if (!(net > 0.005)) continue;
    const w = want[orderId];
    if (w && Math.abs(w.amount - net) < 0.005) { plan.keep++; continue; }
    // сторону і номер знаємо лише для замовлень із реєстру; для чужих — заповнить викликач
    plan.undo.push({ orderId, orderNumber: w?.order.order_number ?? 0, party: w?.order.party ?? '', amount: r2(net) });
  }
  for (const [orderId, w] of Object.entries(want)) {
    const net = existingNet[orderId] ?? 0;
    if (net > 0.005 && Math.abs(w.amount - net) < 0.005) continue;   // keep
    plan.post.push({ orderId, orderNumber: w.order.order_number, party: w.order.party, amount: w.amount, marketplaceOrderId: w.marketplaceOrderId });
  }
  return plan;
}
