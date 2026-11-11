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
  /** Множник активних корекцій каналу (lib/price-adjustments), 1 — без корекцій. */
  adjustFactor?: number;
};

/** База націнки: ціна входу, без неї — роздріб. */
function markupBase(cost: number | null | undefined, retail: number): number {
  return cost && cost > 0 ? cost : retail;
}

// Множник корекцій МП — акції й зміни «до дати» (міграція 147). Без корекцій формула має давати РІВНО те
// саме, що й до них, тому всі гілки з множником вмикаються лише при f ≠ 1, а
// допуск на хвіст подвійної точності — лише там (100.0000001 не стає 105/101).
const EPS = 1e-9;
const hasFactor = (f: number | undefined): f is number => f != null && Math.abs(f - 1) > 1e-12;
const ceilStep = (v: number, step: number, f: number | undefined) =>
  hasFactor(f) ? Math.ceil((v * f) / step - EPS) * step : Math.ceil(v / step) * step;

/** Ціна Rozetka БЕЗ Smart-надбавки (округлення вгору до 5 грн), з корекціями. */
export function rozetkaBasePrice(inp: Pick<RozetkaInputs, 'cost' | 'retail' | 'productMarkupPct' | 'categoryMarkupPct' | 'commissionPct' | 'adjustFactor'>): number {
  const markup = resolveMarkup(inp.productMarkupPct, inp.categoryMarkupPct);
  if (inp.commissionPct <= 0 && markup <= 0) {
    return hasFactor(inp.adjustFactor) ? ceilStep(inp.retail, 5, inp.adjustFactor) : inp.retail;
  }
  const withMarkup = markupBase(inp.cost, inp.retail) * (1 + markup / 100);
  const withComm = inp.commissionPct > 0 ? withMarkup / (1 - inp.commissionPct / 100) : withMarkup;
  return ceilStep(withComm, 5, inp.adjustFactor);
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
  /** Множник активних корекцій каналу (lib/price-adjustments), 1 — без корекцій. */
  adjustFactor?: number;
};

/** Формульна ціна Prom від заданої бази (округлення вгору до 1 грн), з корекціями. */
export function promPriceFromBase(base: number, markupPct: number, commissionPct: number, adjustFactor?: number): number {
  if (commissionPct >= 100) return 0;
  return ceilStep(base * (1 + markupPct / 100) / (1 - commissionPct / 100), 1, adjustFactor);
}

/**
 * Фінальна ціна Prom — те, що їде у фід. Ручна ціна (price_wholesale) б'є
 * формулу, але корекції діють і на неї: «−2 % на бренд» — це зсув ціни, хоч
 * би звідки вона взялась.
 */
export function promPrice(inp: PromInputs): number {
  if (inp.manualOverride && inp.manualOverride > 0) {
    return hasFactor(inp.adjustFactor) ? ceilStep(inp.manualOverride, 1, inp.adjustFactor) : inp.manualOverride;
  }
  const markup = resolveMarkup(inp.productMarkupPct, inp.categoryMarkupPct);
  return promPriceFromBase(markupBase(inp.cost, inp.retail), markup, inp.commissionPct, inp.adjustFactor);
}

/** Чиста маржа Prom: ціна × (1 − комісія) − собівартість. */
export function promMargin(inp: PromInputs): { uah: number; pct: number } | null {
  if (!inp.cost || inp.cost <= 0) return null;
  const price = promPrice(inp);
  const net = inp.commissionPct > 0 ? price * (1 - inp.commissionPct / 100) : price;
  if (net <= 0) return null;
  return { uah: net - inp.cost, pct: ((net - inp.cost) / net) * 100 };
}

// ── Епіцентр ──────────────────────────────────────────────────────────────────

export type EpicentrInputs = {
  cost: number | null | undefined;     // ціна входу
  retail: number;                      // price_retail — fallback-база
  productMarkupPct: number | null | undefined;   // products.epicentr_markup_pct
  categoryMarkupPct: number | null | undefined;  // categories.epicentr_markup_pct
  commissionPct: number;               // categories.epicentr_commission_pct
  /** Множник активних корекцій каналу (lib/price-adjustments), 1 — без корекцій. */
  adjustFactor?: number;
};

/**
 * Ціна Епіцентру — та сама схема, що Prom: вхід → націнка → комісія → ceil до 1 грн.
 * Без комісії й націнки — роздрібна як є (щоб порожні налаштування не ламали фід).
 */
export function epicentrPrice(inp: EpicentrInputs): number {
  const markup = resolveMarkup(inp.productMarkupPct, inp.categoryMarkupPct);
  if (inp.commissionPct <= 0 && markup <= 0) return ceilStep(inp.retail, 1, inp.adjustFactor);
  return promPriceFromBase(markupBase(inp.cost, inp.retail), markup, inp.commissionPct, inp.adjustFactor);
}

/**
 * Ціна й стара ціна Епіцентру з корекціями (міграції 147/161) — ОДНЕ правило для
 * фіда й щогодинного пуша /v1/offers. Ціна = формула × усі корекції каналу; при
 * акції стара ціна = формула без акційного множника (площадка покаже знижку), без
 * акції — price_old складу, як і раніше. Стара ціна йде лише якщо вона вища.
 */
export function epicentrOfferPrices(
  inp: Omit<EpicentrInputs, 'adjustFactor'>,
  factor: { regular: number; promo: number },
  stockOld: number | null,
): { price: number; oldPrice: number | null } {
  const price = epicentrPrice({ ...inp, adjustFactor: factor.regular * factor.promo });
  const promoOld = Math.abs(factor.promo - 1) > 1e-12 ? epicentrPrice({ ...inp, adjustFactor: factor.regular }) : null;
  const old = promoOld != null && promoOld > price ? promoOld : stockOld;
  return { price, oldPrice: old != null && old > price ? old : null };
}

/** Чиста маржа Епіцентру: ціна × (1 − комісія) − собівартість. */
export function epicentrMargin(inp: EpicentrInputs): { uah: number; pct: number } | null {
  if (!inp.cost || inp.cost <= 0) return null;
  const price = epicentrPrice(inp);
  const net = inp.commissionPct > 0 ? price * (1 - inp.commissionPct / 100) : price;
  if (net <= 0) return null;
  return { uah: net - inp.cost, pct: ((net - inp.cost) / net) * 100 };
}

// ── Переоцінка МП через націнку ───────────────────────────────────────────────

/**
 * Націнка, за якої ціна каналу зросте на changePct %. Ціна МП пропорційна
 * (1 + націнка), тож (1 + m′) = (1 + m) × (1 + Δ). Від'ємний Δ — зниження.
 * Результат округлено до 0,01 (products.*_markup_pct — NUMERIC(6,2)). Фактична
 * зміна ціни у фіді буде близька до Δ, не точна: Rozetka округлює до 5 грн і
 * додає Smart-надбавку, Prom — до 1 грн.
 */
export function markupForPriceChange(currentMarkupPct: number, changePct: number): number {
  const m = (1 + currentMarkupPct / 100) * (1 + changePct / 100) - 1;
  return Math.round(m * 10000) / 100;
}

// ── Сайт ──────────────────────────────────────────────────────────────────────

/** Маржа роздрібної ціни сайту (без комісій). */
export function siteMargin(retail: number, cost: number | null | undefined): { uah: number; pct: number } | null {
  if (!cost || cost <= 0 || retail <= 0) return null;
  return { uah: retail - cost, pct: ((retail - cost) / retail) * 100 };
}
