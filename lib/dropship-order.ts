/**
 * Дропшип-замовлення з кабінету партнера — чиста частина (без БД).
 *
 * Одна функція на форму і на Excel-імпорт: раніше кожен роут мав свою перевірку,
 * і вони розходились (форма не перевіряла наявність, Excel пропускав «під замовлення»,
 * кількість від клієнта не перевірялась ніде — від'ємна кількість зменшувала списання).
 *
 * Гроші: закупочна (price_drop) — ТІЛЬКИ з каталогу; від партнера беремо лише
 * кількість і його ціну продажу клієнту (вона ж сума накладеного платежу).
 */
import { DROPSHIP_MIN } from './site';
import { productDisplayName } from './seo/meta';

export const DROPSHIP_MAX_QTY = 9999;

export type DropshipCatalogItem = {
  sku:          string;
  name:         string;
  brand:        string;
  volume:       string | null;
  is_active:    boolean;
  stock_status: string | null;
  price_drop:   number | null;
};

export type DropshipLineInput = { sku: unknown; qty: unknown; selling_price: unknown };

/** Рядок у форматі orders.items: price — ціна продажу клієнту, cost_price — списання з балансу. */
export type DropshipLine = {
  sku:        string;
  name:       string;
  brand:      string;
  qty:        number;
  price:      number;
  cost_price: number;
};

export type DropshipBuildResult =
  | { ok: true; lines: DropshipLine[]; totalCost: number; totalSell: number }
  | { ok: false; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Назва для замовлення/прайсу: бренд не дублюємо, якщо він уже є в назві. */
export function dropshipItemName(p: Pick<DropshipCatalogItem, 'name' | 'brand' | 'volume'>): string {
  return productDisplayName({ name: p.name, brand: p.brand ?? '', volume: p.volume });
}

/** Чи можна замовити товар дропшипом: активний, в наявності, з дроп-ціною. */
export function dropshipOrderable(p: DropshipCatalogItem | undefined): p is DropshipCatalogItem {
  return !!p && p.is_active && p.stock_status === 'in_stock' && Number(p.price_drop ?? 0) > 0;
}

/** Перевірка одного рядка без мінімальної суми (її рахують на все замовлення). */
export function validateDropshipLine(
  raw: DropshipLineInput,
  catalog: Map<string, DropshipCatalogItem>,
): { ok: true; line: DropshipLine } | { ok: false; error: string } {
  const sku = typeof raw?.sku === 'string' ? raw.sku.trim() : '';
  if (!sku) return { ok: false, error: 'Некоректний артикул' };

  const qty = Number(raw.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > DROPSHIP_MAX_QTY) {
    return { ok: false, error: `Некоректна кількість для ${sku}` };
  }

  const p = catalog.get(sku);
  if (!p || !p.is_active) return { ok: false, error: `Товар ${sku} не знайдений` };
  if (p.stock_status !== 'in_stock') return { ok: false, error: `Товару ${sku} немає в наявності` };
  const cost = round2(Number(p.price_drop ?? 0));
  if (!(cost > 0)) return { ok: false, error: `Для товару ${sku} не встановлена дропшип-ціна` };

  const sell = round2(Number(raw.selling_price));
  if (!Number.isFinite(sell) || sell < cost) {
    return { ok: false, error: `Ціна продажу ${sku} не може бути меншою за закупочну (${cost} ₴)` };
  }

  return { ok: true, line: { sku, name: dropshipItemName(p), brand: p.brand ?? '', qty, price: sell, cost_price: cost } };
}

export function buildDropshipLines(
  input: DropshipLineInput[],
  catalog: Map<string, DropshipCatalogItem>,
): DropshipBuildResult {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: 'Немає товарів' };

  const seen = new Set<string>();
  const lines: DropshipLine[] = [];

  for (const raw of input) {
    const v = validateDropshipLine(raw, catalog);
    if (!v.ok) return v;
    if (seen.has(v.line.sku)) return { ok: false, error: `Товар ${v.line.sku} додано двічі` };
    seen.add(v.line.sku);
    lines.push(v.line);
  }

  const totalCost = round2(lines.reduce((s, l) => s + l.cost_price * l.qty, 0));
  const totalSell = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));

  if (totalCost < DROPSHIP_MIN) {
    return {
      ok: false,
      error: `Мінімальна сума замовлення — ${DROPSHIP_MIN} ₴ за закупочними цінами. Зараз ${totalCost.toFixed(2)} ₴.`,
    };
  }

  return { ok: true, lines, totalCost, totalSell };
}

/**
 * Скільки повернути партнеру при скасуванні замовлення — з фактичних рухів балансу
 * по цьому замовленню, а не «закупка з рядків при кожному скасуванні»:
 *  • накладений платіж уже зараховано → нічого (посилку вручено, гроші партнер отримав);
 *  • повертаємо списане мінус уже повернене — повторне скасування дає 0;
 *  • старі замовлення, де списання писалось без order_id, — фолбек на закупку з рядків.
 */
export function partnerCancelRefund(
  txs: { tx_type: string; amount: number | string }[],
  itemsCost: number,
): { amount: number; skip?: 'cod_credited' | 'nothing_left' } {
  if (txs.some(t => t.tx_type === 'cod_credit')) return { amount: 0, skip: 'cod_credited' };
  const charged  = -txs.filter(t => t.tx_type === 'charge').reduce((s, t) => s + Number(t.amount), 0);
  const refunded =  txs.filter(t => t.tx_type === 'return_refund').reduce((s, t) => s + Number(t.amount), 0);
  const base = charged > 0 ? charged : Math.max(0, itemsCost);
  const amount = round2(base - refunded);
  return amount > 0 ? { amount } : { amount: 0, skip: 'nothing_left' };
}

/**
 * Зворотна доставка відмовної посилки (lib/dropship-return-fee): з партнера утримуємо
 * один тариф НП — за повернення. Прямий шлях при відмові окремо не оплачується
 * (підтвердив власник 14.09.2026).
 */
export function dropshipReturnFee(tariff: number): number {
  if (!(tariff > 0)) return 0;
  return round2(tariff);
}

/**
 * Ключ посилки для Excel-імпорту: рядки з тим самим телефоном, містом і відділенням
 * — одне замовлення (одна посилка), а не N окремих посилок одному клієнту.
 */
export function dropshipParcelKey(r: { phone: string; city_name: string; branch_number: string }): string {
  const phone = r.phone.replace(/\D/g, '').slice(-10);
  return `${phone}|${r.city_name.trim().toLowerCase()}|${r.branch_number.trim()}`;
}

/**
 * Комісія НоваПей за накладений платіж, яку утримуємо з партнера. Ставка та сама,
 * що в обліку своїх наложок (app_settings.novapay_cod_fee_pct, за замовчуванням 0,5 %,
 * без мінімуму) — дропшип-ТТН їдуть з нашого акаунта НП.
 */
export function npCodFee(codAmount: number, feePct: number): number {
  return round2(Math.max(0, codAmount) * feePct / 100);
}
