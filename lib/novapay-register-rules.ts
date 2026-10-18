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

/**
 * Чи одна й та сама людина — ПІБ з реєстру і контакт у замовленні.
 *
 * Порядок слів різний: НоваПей дає «Прізвище Ім'я По-батькові», а в замовленні
 * з маркетплейсу зазвичай «Ім'я Прізвище». Порівняння за ПЕРШИМ словом, яке тут
 * було, мовчки не знаходило нікого («Помінчук Володимир Іванович» проти
 * «Володимир Помінчук»), і виплата лишалась без замовлення.
 *
 * Правило: всі слова коротшого імені мають бути в довшому — і збігів має бути
 * щонайменше два. Це строгіше за «однакове перше слово»: один лише спільний
 * «Петров» уже не зчепить різних людей.
 */
export function personNamesMatch(a: string, b: string): boolean {
  const words = (s: string) => new Set(
    s.toLowerCase().replace(/[^\p{L}\s'’-]/gu, ' ').split(/\s+/).filter(w => w.length > 1),
  );
  const x = words(a), y = words(b);
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  if (small.size < 2) return false;
  return [...small].every(w => big.has(w));
}

export type NpKnownOrder = { id: string; order_number: number };
/** Частка рядка реєстру, що припадає на одне замовлення. */
export type NpRowShare = NpKnownOrder & { gross: number; net: number };
/** Порожній масив — рядок не впізнано. */
export type NpRegisterLookup = (row: NpRegisterRow) => NpRowShare[];

export type NpOrderTotal = NpKnownOrder & { total: number };

/**
 * Рознести рядок реєстру по замовленнях, що їдуть під однією ЕН.
 *
 * Дві замовлення в одній посилці — звичайна річ: покупець докупив, менеджер
 * доклав у ту саму коробку. НоваПей бачить одну ЕН і платить одним рядком, а в
 * нас це два борги по наложці. Брати «якесь одне замовлення на цю ЕН» не можна:
 * одне лишиться з непогашеним боргом, друге отримає зайве (так у серпні було б
 * з #26081001/#26081002, #26081005/#26081006, #26081028/#26081029).
 *
 * Ділимо пропорційно сумам замовлень — але лише тоді, коли вони в сумі дають
 * брутто рядка. Якщо не дають, це не «посилка на двох», а збіг ЕН (скасоване +
 * перевиписане): тоді беремо те, чия сума дорівнює рядку, інакше перше за
 * рангом від виклику.
 */
export function splitRowAcrossOrders(row: { gross: number; net: number }, cands: NpOrderTotal[]): NpRowShare[] {
  const whole = (o: NpKnownOrder): NpRowShare[] => [{ id: o.id, order_number: o.order_number, gross: row.gross, net: row.net }];
  if (!cands.length) return [];
  if (cands.length === 1) return whole(cands[0]);
  const sum = r2(cands.reduce((s, o) => s + o.total, 0));
  if (Math.abs(sum - row.gross) > 0.01 || !(row.gross > 0)) {
    return whole(cands.find(o => Math.abs(o.total - row.gross) < 0.005) ?? cands[0]);
  }
  const out: NpRowShare[] = [];
  let grossLeft = row.gross, netLeft = row.net;
  cands.forEach((o, i) => {
    const last = i === cands.length - 1;
    const gross = last ? r2(grossLeft) : r2(o.total);
    const net = last ? r2(netLeft) : r2(row.net * o.total / row.gross);
    grossLeft = r2(grossLeft - gross); netLeft = r2(netLeft - net);
    out.push({ id: o.id, order_number: o.order_number, gross, net });
  });
  return out;
}
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
    const shares = lookup(row);
    if (!shares.length) { unknown.push(row); continue; }
    for (const s of shares) {
      const w = want.get(s.id) ?? { orderNumber: s.order_number, gross: 0, net: 0, ttn: row.ttn };
      w.gross = r2(w.gross + s.gross); w.net = r2(w.net + s.net); want.set(s.id, w);
    }
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

/**
 * Наступний вільний ключ для повторної проводки по тій самій парі (документ, замовлення):
 * base, base:2, base:3 … RPC record_money_txn при зайнятому ключі МОВЧКИ повертає старий
 * txn_id (без помилки unique), тому «спробувати і зловити дубль» не працює — 01.10.2026
 * реєстр 15092123 так втратив проводку 547,25 по #26081076. Вільність ключа визначаємо
 * по вже існуючих ключах, як у rozetkapay-register-apply.
 */
export function nextSeqKey(base: string, existingKeys: Iterable<string>): string {
  let max = 0;
  for (const k of existingKeys) {
    if (k === base) { max = Math.max(max, 1); continue; }
    if (!k.startsWith(base + ':')) continue;
    const n = Number(k.slice(base.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max === 0 ? base : `${base}:${max + 1}`;
}
