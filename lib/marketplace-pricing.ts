import { computeSmartFee, DEFAULT_SMART_TARIFF, type SmartBracket } from './rozetka-smart-tariff';

// ЄДИНА формула цін маркетплейсів. Використовується ВСІМА споживачами:
// фіди Rozetka/Prom, розділ «Ціни», «Товари Rozetka», «Ціни Prom»,
// прайс-лист, preview моделі націнок. Локальних копій формули бути не може —
// саме розсинхрон копій дав кейс «у фіді 640, на екрані 560».
//
// Логіка ціноутворення (підтверджена власником 2026-07-28):
//   ціна входу (собівартість) → націнка каналу (товарна ?? категорійна) →
//   комісія каналу → округлення; для Rozetka Smart — надбавка компенсації
//   доставки з урахуванням комісії на саму надбавку.
// Роздрібна ціна БЕРЕ УЧАСТЬ лише як fallback, коли ціна входу не заповнена.

/** Націнка каналу: товарний override має пріоритет над категорійним. */
export function resolveMarkup(productPct: number | null | undefined, categoryPct: number | null | undefined): number {
  return productPct ?? categoryPct ?? 0;
}

// ── Rozetka ───────────────────────────────────────────────────────────────────

export type RozetkaInputs = {
  cost: number | null | undefined;    // product_stock.price_cost (ціна входу)
  retail: number;                     // product_stock.price_retail — fallback-база і фолбек-ціна
  productMarkupPct: number | null | undefined;   // products.rozetka_markup_pct
  categoryMarkupPct: number | null | undefined;  // categories.rozetka_markup_pct
  commissionPct: number;              // categories.rozetka_commission_pct
  smart?: boolean;                    // products.rozetka_smart
  smartTariff?: SmartBracket[];       // тариф «Умови Smart» (app_settings), дефолт — чинний
};

/** База націнки: ціна входу, без неї — роздріб. */
function markupBase(cost: number | null | undefined, retail: number): number {
  return cost && cost > 0 ? cost : retail;
}

/** Ціна Rozetka БЕЗ Smart-надбавки (округлення вгору до 5 грн). */
export function rozetkaBasePrice(inp: Pick<RozetkaInputs, 'cost' | 'retail' | 'productMarkupPct' | 'categoryMarkupPct' | 'commissionPct'>): number {
  const markup = resolveMarkup(inp.productMarkupPct, inp.categoryMarkupPct);
  if (inp.commissionPct <= 0 && markup <= 0) return inp.retail;
  const withMarkup = markupBase(inp.cost, inp.retail) * (1 + markup / 100);
  const withComm = inp.commissionPct > 0 ? withMarkup / (1 - inp.commissionPct / 100) : withMarkup;
  return Math.ceil(withComm / 5) * 5;
}

/**
 * Smart-надбавка поверх готової ціни: P' = P + fee(P')/(1 − комісія).
 * Тариф ступінчастий — якщо надбавка перекидає ціну через поріг, рахуємо з
 * більшим тарифом. Без комісії застосовується запобіжник 15 %.
 */
export function rozetkaSmartPrice(price: number, commissionPct: number, tariff: SmartBracket[] = DEFAULT_SMART_TARIFF): number {
  const c = commissionPct > 0 ? commissionPct / 100 : 0.15;
  let fee = computeSmartFee(price, tariff);
  let raised = price + fee / (1 - c);
  if (computeSmartFee(raised, tariff) !== fee) {
    const fee2 = computeSmartFee(raised, tariff);
    const raised2 = price + fee2 / (1 - c);
    if (computeSmartFee(raised2, tariff) === fee2) { fee = fee2; raised = raised2; }
  }
  return Math.ceil(raised / 5) * 5;
}

/** Фінальна ціна Rozetka — те, що їде у фід. */
export function rozetkaPrice(inp: RozetkaInputs): number {
  const base = rozetkaBasePrice(inp);
  return inp.smart ? rozetkaSmartPrice(base, inp.commissionPct, inp.smartTariff) : base;
}

/**
 * Чиста маржа Rozetka. Рахується від ціни БЕЗ Smart-надбавки: надбавка йде на
 * компенсацію доставки, а не в прибуток (конвенція екрана «Товари Rozetka»).
 */
export function rozetkaMargin(inp: RozetkaInputs): { uah: number; pct: number } | null {
  if (!inp.cost || inp.cost <= 0) return null;
  const base = rozetkaBasePrice(inp);
  const net = inp.commissionPct > 0 ? base * (1 - inp.commissionPct / 100) : base;
  if (net <= 0) return null;
  return { uah: net - inp.cost, pct: ((net - inp.cost) / net) * 100 };
}

// ── Prom ──────────────────────────────────────────────────────────────────────

export type PromPlan = 'single' | 'econom';

/**
 * Комісія Prom категорії з урахуванням активного плану (app_settings.prom_plan):
 * «Економ» → prom_commission_pct_econom (fallback на єдину, якщо не заповнена),
 * інакше — єдина prom_commission_pct.
 */
export function promCommissionOf(
  cat: { prom_commission_pct?: number | null; prom_commission_pct_econom?: number | null } | null | undefined,
  plan: PromPlan,
): number {
  if (!cat) return 0;
  const single = cat.prom_commission_pct != null ? Number(cat.prom_commission_pct) : null;
  if (plan === 'econom') {
    const econom = cat.prom_commission_pct_econom != null ? Number(cat.prom_commission_pct_econom) : null;
    return econom ?? single ?? 0;
  }
  return single ?? 0;
}

export type PromInputs = {
  cost: number | null | undefined;     // ціна входу
  retail: number;                      // price_retail ?? price_unit — fallback-база
  manualOverride?: number | null;      // product_stock.price_wholesale — ручна ціна Prom, б'є формулу
  productMarkupPct: number | null | undefined;   // products.prom_markup_pct
  categoryMarkupPct: number | null | undefined;  // categories.prom_markup_pct
  commissionPct: number;               // categories.prom_commission_pct
};

/** Формульна ціна Prom від заданої бази (округлення вгору до 1 грн). */
export function promPriceFromBase(base: number, markupPct: number, commissionPct: number): number {
  if (commissionPct >= 100) return 0;
  return Math.ceil(base * (1 + markupPct / 100) / (1 - commissionPct / 100));
}

/** Фінальна ціна Prom — те, що їде у фід (ручний override має пріоритет). */
export function promPrice(inp: PromInputs): number {
  if (inp.manualOverride && inp.manualOverride > 0) return inp.manualOverride;
  const markup = resolveMarkup(inp.productMarkupPct, inp.categoryMarkupPct);
  return promPriceFromBase(markupBase(inp.cost, inp.retail), markup, inp.commissionPct);
}

/** Чиста маржа Prom: ціна × (1 − комісія) − собівартість. */
export function promMargin(inp: PromInputs): { uah: number; pct: number } | null {
  if (!inp.cost || inp.cost <= 0) return null;
  const price = promPrice(inp);
  const net = inp.commissionPct > 0 ? price * (1 - inp.commissionPct / 100) : price;
  if (net <= 0) return null;
  return { uah: net - inp.cost, pct: ((net - inp.cost) / net) * 100 };
}

// ── Сайт ──────────────────────────────────────────────────────────────────────

/** Маржа роздрібної ціни сайту (без комісій). */
export function siteMargin(retail: number, cost: number | null | undefined): { uah: number; pct: number } | null {
  if (!cost || cost <= 0 || retail <= 0) return null;
  return { uah: retail - cost, pct: ((retail - cost) / retail) * 100 };
}
