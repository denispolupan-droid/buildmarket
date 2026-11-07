/**
 * Чисті правила ПРОГНОЗУ валового прибутку замовлення (без БД — під тести).
 *
 * Факт прибутку — лише леджер (lib/accounting/profit-rules). Але «Огляд» і
 * «Аналітика» показують і замовлення, які ще не вручені: для них собівартість
 * і комісія — оцінка. До 04.11.2026 кожен екран рахував цю оцінку по-своєму
 * (плоска ставка категорії замість порогів Rozetka, свої фолбеки, свої
 * пріоритети факт/оцінка) — і розходився з тим, що потім писав леджер.
 * Тепер усі екрани беруть оцінку звідси (DB-шар — lib/accounting/estimate.ts).
 *
 * Пріоритет: факт із леджера (є проводка по замовленню) → оцінка:
 *   собівартість = Σ qty × поточна закупівельна (product_stock.price_cost — та
 *   сама, що лягає в рядки РН-чернетки при відвантаженні дропшипу);
 *   комісія      = оцінювач каналу з lib/marketplace/fees (ті самі ставки й
 *   пороги, що при проведенні, коли факту з площадки немає).
 * Визначення прибутку — те саме, що у profit-rules: виручка − COGS − витрати
 * угоди (комісія площадки, еквайринг, збори НП).
 */

export type EstimateLine = { sku: string; qty: number; price: number };

/** Рядок із оцінкою: закупівельна за одиницю (null — невідома) і комісія рядка. */
export type LineEstimate = EstimateLine & { unitCost: number | null; fee: number };

/**
 * Факт по замовленню з леджера; null — проводки цього виду ще немає.
 * revenue — проведена виручка (нетто повернень). Вона буває меншою за суму
 * замовлення: частковий повернення, дроп за ціною партнера, безкоштовна
 * досилка, недовкладення (інцидент 07.11.2026: «Огляд» брав суму замовлення
 * при фактичній собівартості — 5 замовлень завищили прибуток на 1 367,50 ₴).
 */
export type OrderFact = { revenue?: number | null; cogs: number | null; fee: number | null; dealExtra: number };

export type ProfitEstimate = {
  /** Проведена виручка, якщо продаж уже в обліку; інакше — сума замовлення. */
  revenue: number;
  revenueSource: 'fact' | 'order';
  cogs: number;
  /** Збори площадки: комісія по рядках + збори рівня замовлення (Smart, видача, «Дешева доставка»). */
  fee: number;
  /** Частина оцінки fee, що не прив'язана до рядків (збори рівня замовлення). */
  orderFee: number;
  /** Еквайринг і збори НП, уже проведені по замовленню (лише факт; оцінки немає). */
  dealExtra: number;
  gross: number;
  cogsSource: 'fact' | 'estimate';
  feeSource: 'fact' | 'estimate';
  /** Чиста оцінка за поточними ставками й закупівлею, без факту — для звірки «прогноз vs факт». */
  estimated: { cogs: number; fee: number; gross: number };
  /** SKU без закупівельної ціни: оцінка собівартості по них = 0, прогноз завищений. */
  unknownCostSkus: string[];
  lines: LineEstimate[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function estimateOrderProfit(totalPrice: number, lines: LineEstimate[], fact?: OrderFact | null, orderFee = 0): ProfitEstimate {
  // Виручка: проведена (факт) має пріоритет над сумою замовлення — інакше
  // собівартість нетто повернень віднімається від повної суми замовлення.
  // Чиста оцінка (estimated) рахується від тієї ж виручки, щоб звірка
  // «прогноз vs факт» порівнювала лише собівартість і збори.
  const revenueSource: ProfitEstimate['revenueSource'] = fact?.revenue != null ? 'fact' : 'order';
  const revenue = revenueSource === 'fact' ? r2(fact!.revenue!) : (Number(totalPrice) || 0);
  const estCogs = r2(lines.reduce((s, l) => s + (l.unitCost ?? 0) * Number(l.qty || 0), 0));
  const estFee  = r2(lines.reduce((s, l) => s + Number(l.fee || 0), 0) + (Number(orderFee) || 0));
  const unknownCostSkus = [...new Set(lines.filter(l => l.unitCost == null).map(l => l.sku))];

  const cogsSource: ProfitEstimate['cogsSource'] = fact?.cogs != null ? 'fact' : 'estimate';
  const feeSource:  ProfitEstimate['feeSource']  = fact?.fee  != null ? 'fact' : 'estimate';
  const cogs = cogsSource === 'fact' ? r2(fact!.cogs!) : estCogs;
  const fee  = feeSource  === 'fact' ? r2(fact!.fee!)  : estFee;
  const dealExtra = r2(fact?.dealExtra ?? 0);

  return {
    revenue, revenueSource, cogs, fee, orderFee: r2(Number(orderFee) || 0), dealExtra,
    gross: r2(revenue - cogs - fee - dealExtra),
    cogsSource, feeSource,
    estimated: { cogs: estCogs, fee: estFee, gross: r2(revenue - estCogs - estFee) },
    unknownCostSkus,
    lines,
  };
}

// ── Звірка «прогноз vs факт» по вручених замовленнях ─────────────────────────
// Прогноз завжди відрізняється від факту (FIFO-партії vs поточна закупівля,
// cpa Prom vs ставка категорії) — питання лише, наскільки. Сумарний дрейф понад
// поріг означає, що ставки категорій або закупівельні ціни застаріли, і прогноз
// на «Огляді» бреше систематично. Порівнюються однакові складові: виручка −
// COGS − збори площадки; еквайринг і збори НП (dealExtra) прогноз не оцінює,
// тож у звірці їх немає з обох боків.

export type DriftRow = {
  orderNumber: number | null;
  revenue: number;
  estGross: number;
  factGross: number;
  /** Складові — щоб у алерті було видно, що саме дрейфує: закупівля чи ставки. */
  estCogs?: number; factCogs?: number; estFee?: number; factFee?: number;
};
export type DriftSummary = {
  ok: boolean;
  orders: number;
  revenue: number;
  est: number;
  fact: number;
  cogs: { est: number; fact: number };
  fee: { est: number; fact: number };
  /** (прогноз − факт) / |факт| у % — наскільки бреше валовий; null — факт нульовий. */
  pct: number | null;
  /** (прогноз − факт) / виручка у % — на цьому поріг: валовий ≈ 10 % виручки, тож
   *  1 % виручки = 10 % валового, і поріг по валовому дзвонив би від шуму FIFO. */
  pctOfRevenue: number | null;
  /** Найбільші розходження по модулю, зі знаком (прогноз − факт). */
  worst: (DriftRow & { diff: number })[];
};

/**
 * Поріг дрейфу у % від виручки за вікно звірки. Калібрування 04.11.2026 на проді
 * (183 вручених за 30 дн): ставки каналів після уніфікації сходяться до 0,05 %
 * виручки, а закупівля (поточна price_cost проти ціни на момент відвантаження
 * й FIFO) дає ≈2 % — це рух цін постачальників, не помилка оцінки. 3 % = щось
 * зламалось у ставках/закупівлі, а не ринок поворухнувся.
 */
export const DRIFT_PCT_OF_REVENUE = 3;
export const DRIFT_MIN_ORDERS = 5;

export function summarizeDrift(rows: DriftRow[], opts: { pctOfRevenue?: number; minOrders?: number; worstN?: number } = {}): DriftSummary {
  const limit = opts.pctOfRevenue ?? DRIFT_PCT_OF_REVENUE;
  const minOrders = opts.minOrders ?? DRIFT_MIN_ORDERS;
  const revenue = r2(rows.reduce((s, r) => s + r.revenue, 0));
  const est  = r2(rows.reduce((s, r) => s + r.estGross, 0));
  const fact = r2(rows.reduce((s, r) => s + r.factGross, 0));
  const pct = Math.abs(fact) > 0 ? r2(((est - fact) / Math.abs(fact)) * 100) : null;
  const pctOfRevenue = revenue > 0 ? r2(((est - fact) / revenue) * 100) : null;
  const worst = rows
    .map(r => ({ ...r, diff: r2(r.estGross - r.factGross) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, opts.worstN ?? 5);
  const ok = rows.length < minOrders || pctOfRevenue === null || Math.abs(pctOfRevenue) <= limit;
  const sum = (k: 'estCogs' | 'factCogs' | 'estFee' | 'factFee') => r2(rows.reduce((s, r) => s + (r[k] ?? 0), 0));
  return {
    ok, orders: rows.length, revenue, est, fact, pct, pctOfRevenue, worst,
    cogs: { est: sum('estCogs'), fact: sum('factCogs') },
    fee:  { est: sum('estFee'),  fact: sum('factFee') },
  };
}
