/**
 * Виплати RozetkaPay за ФАКТОМ з кабінету — чиста частина: розбір файлів і план
 * рознесення. Без БД і без xlsx (тести годують рядками; читання файлу —
 * lib/rozetkapay-register-apply).
 *
 * Навіщо. API виплат RozetkaPay не дає (відповідь підтримки 07.09.2026), тож
 * склад виплати досі ПІДБИРАВСЯ підмножиною замовлень під брутто. 09.09 реєстр
 * із кабінету показав, що підбір по виплаті 09.09 (902 ₴) склав її з чужих
 * замовлень із такими самими сумами (#26081071 + #26081165 замість #26091039 +
 * #26091026); перевірка по всіх 32 виплатах: склад не виводиться ні з дати
 * оплати покупцем, ні з дати вручення. Тому імпорт не лише доповнює, а й
 * ПЕРЕПИСУЄ склад виплати: зайве сторнується, відсутнє проводиться.
 *
 * Два формати з кабінету RozetkaPay:
 *  1. «Реєстр платежів ФОП … <договір>-П» (XLSX) за період — по платежу дата
 *     перерахування, брутто/комісія/нетто, «Назва проекту», «№ замовлення».
 *  2. Розгорнутий експорт транзакцій (CSV, «;») — те саме за всю історію одним
 *     файлом: «Дата перерахування торговцю» = дата переказу (31/32 виплат за
 *     20.07–09.09 зійшлись до копійки), «Повернення» з датою перерахування
 *     зменшує той самий переказ (02.09: 19 714 − 8 680 = 11 034), рядки без
 *     дати перерахування — ще не виплачено. Для точок видачі (pnfp_*)
 *     «№ замовлення» — id Rozetka або НАШ номер (власний договір), а в
 *     призначенні — номер накладної (RMP-… чи 101…).
 */

export type RzPayRegisterRow = {
  n: number;
  payoutDate: string;          // ISO дата перерахування
  paidAt: string | null;       // дата-час платежу покупця (як у файлі)
  gross: number;               // Сума платежу; для повернення — від'ємна
  fee: number;                 // комісія з отримувача (модуль)
  net: number;                 // Сума перерахованих коштів
  project: string;             // Назва проекту / платформа
  marketplace: 'prom' | 'rozetka' | null;
  marketplaceOrderId: string;  // № замовлення (id площадки або наш номер)
  kind: 'payment' | 'refund';
  /** Номер накладної з призначення платежу (RMP-… Rozetka, 101… власний договір) */
  ref: string | null;
};

export type RzPayRegister = {
  contract: string | null;
  periodFrom: string;          // ISO
  periodTo: string;            // ISO
  generatedAt: string | null;  // ISO
  rows: RzPayRegisterRow[];
  totalGross: number;
  totalNet: number;
  /** платежі без дати перерахування — ще не виплачено (лише CSV) */
  pending: { marketplaceOrderId: string; project: string; gross: number; paidAt: string | null }[];
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
  if (/rozetka|розетк|pnfp|пнфп/.test(p)) return 'rozetka';
  return null;
}

/** Номер накладної з призначення платежу («Оплата за замовлення RMP-901773675» / «… 101807100841»). */
export function refOfPurpose(purpose: string | null | undefined): string | null {
  const m = /\b(RMP-\d{6,}|101\d{9})\b/i.exec(purpose ?? '');
  return m ? m[1].toUpperCase() : null;
}

/** Розбір аркуша реєстру (масив рядків, як віддає sheet_to_json({header:1})). Кидає на чужому форматі. */
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
  const cPurpose = col(/^Призначення платежу/i);
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
      kind: 'payment', ref: cPurpose >= 0 ? refOfPurpose(String(cell(r, cPurpose))) : null,
    });
  }
  if (!rows.length) throw new Error('У реєстрі немає жодного платежу');
  return {
    contract, periodFrom, periodTo, generatedAt, rows,
    totalGross: r2(rows.reduce((s, x) => s + x.gross, 0)),
    totalNet:   r2(rows.reduce((s, x) => s + x.net, 0)),
    pending: [],
  };
}

/** Розбиття рядка CSV з «;» і лапками ("АТ ""Ощадбанк"""). */
export function splitCsvLine(line: string, sep = ';'): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Розгорнутий експорт транзакцій RozetkaPay (CSV). Успішні «Оплата» з датою
 * перерахування — платежі; успішні «Повернення» з датою перерахування — від'ємні
 * рядки того самого переказу; без дати перерахування — pending. Блокування,
 * відміни, невдалі — пропускаються.
 */
export function parseRzPayTransactionsCsv(text: string): RzPayRegister {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('Порожній CSV');
  const header = splitCsvLine(lines[0]).map(h => h.trim());
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const c = {
    id: col(/^№ замовлення/i), date: col(/^Дата замовлення/i), amount: col(/^Сума платежу/i), type: col(/^Тип оплати/i),
    platform: col(/^Платформа/i), status: col(/^Статус$/i), paidAt: col(/^Дата оплати покупцем/i), payout: col(/^Дата перерахування торговцю/i),
    fee: col(/^Сума комісії з отримувача/i), project: col(/^Проект/i), purpose: col(/^Призначення платежу/i),
  };
  if ([c.id, c.amount, c.type, c.platform, c.status, c.payout].some(i => i < 0)) {
    throw new Error('Це не розгорнутий експорт транзакцій RozetkaPay: бракує колонок (№ замовлення / Тип оплати / Платформа / Статус / Дата перерахування торговцю)');
  }
  const rows: RzPayRegisterRow[] = [];
  const pending: RzPayRegister['pending'] = [];
  let n = 0;
  for (const line of lines.slice(1)) {
    const r = splitCsvLine(line);
    const get = (i: number) => (i >= 0 ? (r[i] ?? '') : '').trim();
    if (get(c.status) !== 'Успіх') continue;
    const type = get(c.type);
    if (type !== 'Оплата' && type !== 'Повернення') continue;
    const amount = r2(num(get(c.amount)));
    if (!(amount > 0)) continue;
    const platform = get(c.platform);
    const project = get(c.project) || platform;
    const payoutDate = isoOf(get(c.payout));
    const base = { marketplaceOrderId: get(c.id), project: `${platform} · ${project}`, gross: type === 'Повернення' ? -amount : amount, paidAt: get(c.paidAt) || get(c.date) || null };
    if (!payoutDate) { if (type === 'Оплата') pending.push(base); continue; }
    const fee = r2(Math.abs(num(get(c.fee))));
    rows.push({
      n: ++n, payoutDate, paidAt: base.paidAt, gross: base.gross, fee, net: r2(base.gross - (type === 'Повернення' ? 0 : fee)),
      project: base.project, marketplace: marketplaceOfProject(platform) ?? marketplaceOfProject(project),
      marketplaceOrderId: base.marketplaceOrderId, kind: type === 'Повернення' ? 'refund' : 'payment', ref: refOfPurpose(get(c.purpose)),
    });
  }
  if (!rows.length && !pending.length) throw new Error('У файлі немає успішних оплат');
  const dates = rows.map(x => x.payoutDate).sort();
  return {
    contract: null, periodFrom: dates[0] ?? '', periodTo: dates[dates.length - 1] ?? '', generatedAt: null, rows,
    totalGross: r2(rows.reduce((s, x) => s + x.gross, 0)),
    totalNet:   r2(rows.reduce((s, x) => s + x.net, 0)),
    pending,
  };
}

export type RzPayKnownOrder = { id: string; order_number: number; party: string; total?: number | null };
export type RzPayLookup = (marketplace: 'prom' | 'rozetka' | null, marketplaceOrderId: string, ref: string | null) => RzPayKnownOrder | null;
export type RzPayApplyPlan = {
  /** проводки «виплата → замовлення», яких ще немає (або сума інша) */
  post: { orderId: string; orderNumber: number; party: string; amount: number; marketplaceOrderId: string }[];
  /** сторно попереднього (підібраного) складу, якого в реєстрі немає або сума не та */
  undo: { orderId: string; orderNumber: number; party: string; amount: number }[];
  /** рядки реєстру без нашого замовлення (id площадки невідомий) */
  unknown: { marketplaceOrderId: string; project: string; gross: number }[];
  /** уже рознесено правильно — нічого не робимо */
  keep: number;
  /** замовлення, у яких оплата й повернення в одному переказі дали нуль */
  zeroed: number;
  /**
   * платіж більший за суму замовлення — рахунок Rozetka на кілька замовлень одразу
   * (04.08: 6 150 = #26081008 + #26081011 + #26081012; 19.08: 3 860 = #26081097 +
   * #26081098 за фактом власника). На замовлення з файлу проводимо лише його суму,
   * решта (leftover) — інші замовлення того ж рахунку, їх файл не називає.
   */
  overpaid: { orderNumber: number; amount: number; total: number; leftover: number }[];
};

/**
 * План рознесення однієї виплати за реєстром.
 *  - lookup: наше замовлення за площадкою, id площадки і номером накладної
 *  - existingNet: скільки з ЦІЄЇ виплати вже проведено на кожне замовлення (alloc − undo)
 * Один і той самий id може трапитись у реєстрі кілька разів (дві оплати, оплата +
 * повернення) — суми складаються зі знаком; нуль або менше — нічого не проводимо.
 */
export function planRzPayRegisterApply(register: RzPayRegister, lookup: RzPayLookup, existingNet: Record<string, number>): RzPayApplyPlan {
  const want: Record<string, { order: RzPayKnownOrder; amount: number; marketplaceOrderId: string }> = {};
  const unknown: RzPayApplyPlan['unknown'] = [];
  for (const row of register.rows) {
    const o = lookup(row.marketplace, row.marketplaceOrderId, row.ref);
    if (!o) { unknown.push({ marketplaceOrderId: row.marketplaceOrderId, project: row.project, gross: row.gross }); continue; }
    const w = (want[o.id] ??= { order: o, amount: 0, marketplaceOrderId: row.marketplaceOrderId });
    w.amount = r2(w.amount + row.gross);
  }
  const plan: RzPayApplyPlan = { post: [], undo: [], unknown, keep: 0, zeroed: 0, overpaid: [] };
  for (const [orderId, w] of Object.entries(want)) {
    if (w.amount <= 0.005) { plan.zeroed++; delete want[orderId]; continue; }
    const total = r2(Number(w.order.total ?? 0));
    if (total > 0 && w.amount > total * 1.01 + 1) {
      plan.overpaid.push({ orderNumber: w.order.order_number, amount: w.amount, total, leftover: r2(w.amount - total) });
      w.amount = total;
    }
  }
  // Що вже стоїть на цій виплаті, але в реєстрі відсутнє чи сума інша — сторно повністю
  for (const [orderId, net] of Object.entries(existingNet)) {
    if (!(net > 0.005)) continue;
    const w = want[orderId];
    if (w && Math.abs(w.amount - net) < 0.005) { plan.keep++; continue; }
    plan.undo.push({ orderId, orderNumber: w?.order.order_number ?? 0, party: w?.order.party ?? '', amount: r2(net) });
  }
  for (const [orderId, w] of Object.entries(want)) {
    const net = existingNet[orderId] ?? 0;
    if (net > 0.005 && Math.abs(w.amount - net) < 0.005) continue;   // keep
    plan.post.push({ orderId, orderNumber: w.order.order_number, party: w.order.party, amount: w.amount, marketplaceOrderId: w.marketplaceOrderId });
  }
  return plan;
}

/** Опис для оператора: чим замінили попередній склад. */
export function mergedDescriptionOf(rows: RzPayRegisterRow[]): string {
  return rows.map(r => `${r.marketplaceOrderId}${r.kind === 'refund' ? ' (повернення)' : ''}`).join(', ');
}
