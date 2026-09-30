/**
 * Чиста частина реєстру переказів НоваПей (без БД і мережі — для тестів):
 * типи, розбір аркуша XLSX, план проводок. Проведення — lib/novapay-register.ts.
 */

export type NpRegisterRow = {
  n: number;
  /** № ЕН НП; для платежів НоваПей — номер платежу (починається з 59) */
  ttn: string;
  gross: number;
  fee: number;
  net: number;
  buyer: string;
  /** «Номер замовлення» з реєстру, якщо заповнений */
  orderRef: string | null;
  /** платіж НоваПей (не ЕН) — зіставляти за покупцем і сумою */
  isNpPayment: boolean;
};

export type NpRegister = {
  registerNo: string;
  date: string;         // ISO YYYY-MM-DD
  rows: NpRegisterRow[];
  totalGross: number;
  totalNet: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** «5,840.00» / «5 840,00» / 5840 → 5840 */
export function parseNpMoney(v: unknown): number {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');          // 5,840.00
  else if (s.includes(',')) s = s.replace(',', '.');                        // 5840,00
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Розбір аркуша (масив рядків sheet_to_json({header:1})). Кидає на чужому форматі. */
export function parseNpRegisterSheet(sheet: unknown[][]): NpRegister {
  const cell = (r: unknown[], i: number) => (r?.[i] === undefined || r?.[i] === null) ? '' : String(r[i]).trim();
  let registerNo = '', date = '', headerIdx = -1;
  for (let i = 0; i < sheet.length; i++) {
    const r = sheet[i] ?? [];
    const first = cell(r, 0);
    const m = /РЕЄСТР\s+ПЕРЕКАЗІВ\s*№\s*(\d+)/i.exec(first);
    if (m) registerNo = m[1];
    else if (/^Дата/i.test(first)) { const d = /(\d{2})\.(\d{2})\.(\d{4})/.exec(r.map(c => String(c ?? '')).join(' ')); if (d) date = `${d[3]}-${d[2]}-${d[1]}`; }
    else if (first === '№' && r.some(c => /ЕН НП/i.test(String(c ?? '')))) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('Це не реєстр переказів НоваПей: немає шапки «№ … № ЕН НП»');
  if (!registerNo) throw new Error('У реєстрі НоваПей не знайдено номера («РЕЄСТР ПЕРЕКАЗІВ №…»)');
  const header = (sheet[headerIdx] ?? []).map(c => String(c ?? '').trim());
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const cGross = col(/^Сума принятих/i), cFee = col(/^Сума утриманої/i), cNet = col(/^Сума перерахованих/i);
  const cBuyer = col(/^ПІБ Покупця/i), cTtn = col(/ЕН НП/i), cOrder = col(/^Номер замовлення/i);
  if ([cGross, cNet, cTtn].some(i => i < 0)) throw new Error('У реєстрі НоваПей бракує колонок (сума / № ЕН НП)');

  const rows: NpRegisterRow[] = [];
  for (let i = headerIdx + 1; i < sheet.length; i++) {
    const r = sheet[i] ?? [];
    if (r.some(c => /^Всього/i.test(String(c ?? '')))) break;
    const n = parseNpMoney(cell(r, 0));
    if (!(n > 0)) continue;
    const ttn = cell(r, cTtn).replace(/\s/g, '');
    if (!ttn) continue;
    const gross = r2(parseNpMoney(cell(r, cGross)));
    const net = r2(parseNpMoney(cell(r, cNet)));
    rows.push({
      n, ttn, gross, fee: r2(cFee >= 0 ? Math.abs(parseNpMoney(cell(r, cFee))) : gross - net), net,
      buyer: cBuyer >= 0 ? cell(r, cBuyer).replace(/\s+/g, ' ') : '',
      orderRef: cOrder >= 0 && cell(r, cOrder) ? cell(r, cOrder) : null,
      isNpPayment: /^59\d{10,}$/.test(ttn),
    });
  }
  if (!rows.length) throw new Error(`Реєстр НоваПей № ${registerNo} порожній`);
  return { registerNo, date, rows, totalGross: r2(rows.reduce((s, x) => s + x.gross, 0)), totalNet: r2(rows.reduce((s, x) => s + x.net, 0)) };
}

export type NpKnownOrder = { id: string; order_number: number };
export type NpRegisterLookup = (row: NpRegisterRow) => NpKnownOrder | null;
export type NpRegisterPlan = {
  post: { orderId: string; orderNumber: number; gross: number; net: number; ttn: string }[];
  undo: { orderId: string; net: number }[];
  keep: number;
  unknown: NpRegisterRow[];
};

/**
 * План: що проводити/сторнувати, щоб нетто по кожному замовленню на цьому
 * документі виписки дорівнювало реєстру. existingNet — вже проведене по
 * замовленнях (np-payout − np-payout-undo). Копійчана різниця (наша комісія
 * 0,5 % округлюється інакше, ніж у реєстрі) — не привід перепроводити.
 */
export function planNpRegisterApply(reg: NpRegister, lookup: NpRegisterLookup, existingNet: Record<string, number>, tol = 0.02): NpRegisterPlan {
  const want = new Map<string, { orderNumber: number; gross: number; net: number; ttn: string }>();
  const unknown: NpRegisterRow[] = [];
  for (const row of reg.rows) {
    const o = lookup(row);
    if (!o) { unknown.push(row); continue; }
    const w = want.get(o.id) ?? { orderNumber: o.order_number, gross: 0, net: 0, ttn: row.ttn };
    w.gross = r2(w.gross + row.gross); w.net = r2(w.net + row.net); want.set(o.id, w);
  }
  const plan: NpRegisterPlan = { post: [], undo: [], keep: 0, unknown };
  for (const [orderId, net] of Object.entries(existingNet)) {
    if (!(net > 0.005)) continue;
    const w = want.get(orderId);
    if (w && Math.abs(w.net - net) <= tol) { plan.keep++; continue; }
    plan.undo.push({ orderId, net: r2(net) });
  }
  for (const [orderId, w] of want) {
    const net = existingNet[orderId] ?? 0;
    if (net > 0.005 && Math.abs(w.net - net) <= tol) continue;
    plan.post.push({ orderId, orderNumber: w.orderNumber, gross: w.gross, net: w.net, ttn: w.ttn });
  }
  return plan;
}
