/**
 * Ціна для маркетплейсу за правилами націнок.
 *
 * Стара модель: ціна = собівартість × (1 + 10%) / (1 − комісія). Прибуток виходив
 * рівно 10% собівартості для будь-якого товару. Комісія масштабується від ціни, а
 * пакування, праця й доставка — фіксовані на замовлення, тому дрібний товар не
 * окуповував відправку (3 грн прибутку на диску проти ~25 грн витрат на замовлення).
 *
 * Нова модель: цільовий прибуток = max(собівартість × %, абсолютний мінімум).
 * Абсолютний мінімум гарантує, що кожна відправка себе окупає, а відсоток працює
 * там, де товар дорогий і мінімум уже перекритий.
 *
 * Ціна = ceil( (собівартість + прибуток) / (1 − комісія) / крок ) × крок
 *
 * Комісію ділимо, а не додаємо: маркетплейс бере свій відсоток ВІД ЦІНИ продажу,
 * тож щоб після її утримання лишилась потрібна сума, ціну треба «розкрутити».
 */

export type PricingRule = {
  id?: number;
  marketplace: 'all' | 'rozetka' | 'prom';
  scope: 'product' | 'brand_category' | 'category' | 'cost_band' | 'global';
  sku?: string | null;
  brand?: string | null;
  category_slug?: string | null;
  cost_from?: number | null;
  cost_to?: number | null;
  markup_pct?: number | null;
  min_profit_uah?: number | null;
  min_price_uah?: number | null;
  round_step?: number | null;
  exclude_single?: boolean | null;
  is_active?: boolean;
};

export type PriceTarget = {
  sku: string;
  brand: string;
  category_slug: string | null;
  cost: number;
  /** ефективна комісія маркетплейсу у % (уже з урахуванням зборів площадки) */
  commissionPct: number;
  /** РРЦ постачальника, якщо є — жорстка нижня межа */
  minPrice?: number | null;
};

/** Пріоритет: чим менше число, тим точніше правило. */
const SCOPE_PRIORITY: Record<PricingRule['scope'], number> = {
  product: 0, brand_category: 1, category: 2, cost_band: 3, global: 4,
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

function matches(rule: PricingRule, t: PriceTarget, marketplace: 'rozetka' | 'prom'): boolean {
  if (rule.is_active === false) return false;
  if (rule.marketplace !== 'all' && rule.marketplace !== marketplace) return false;
  switch (rule.scope) {
    case 'product':        return rule.sku === t.sku;
    case 'brand_category': return norm(rule.brand) === norm(t.brand) && rule.category_slug === t.category_slug;
    case 'category':       return rule.category_slug === t.category_slug;
    case 'cost_band':      return t.cost >= (rule.cost_from ?? 0)
                                && (rule.cost_to == null || t.cost < rule.cost_to);
    case 'global':         return true;
  }
}

/**
 * Правила, що застосовуються до товару, від найточнішого до загального.
 * Точніше правило б'є загальніше; правило конкретного МП б'є спільне ('all')
 * на тому самому рівні.
 */
export function applicableRules(rules: PricingRule[], t: PriceTarget, marketplace: 'rozetka' | 'prom'): PricingRule[] {
  return rules
    .filter(r => matches(r, t, marketplace))
    .sort((a, b) => {
      const p = SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope];
      if (p !== 0) return p;
      // на одному рівні: точковий МП перед 'all'
      return (a.marketplace === 'all' ? 1 : 0) - (b.marketplace === 'all' ? 1 : 0);
    });
}

export type ResolvedRule = {
  markupPct: number;
  minProfitUah: number;
  minPriceUah: number | null;
  roundStep: number;
  excludeSingle: boolean;
  /** які правила дали значення — для пояснення в UI */
  sources: { field: string; scope: PricingRule['scope']; id?: number }[];
};

/**
 * Зливає застосовні правила: кожне поле бере з найточнішого правила, де воно задане.
 * Незадані поля успадковуються далі по ланцюжку — тож категорійне правило може
 * перекрити лише націнку, лишивши мінімум прибутку зі смуги собівартості.
 */
export function resolveRule(rules: PricingRule[], t: PriceTarget, marketplace: 'rozetka' | 'prom'): ResolvedRule {
  const chain = applicableRules(rules, t, marketplace);
  const out: ResolvedRule = {
    markupPct: 0, minProfitUah: 0, minPriceUah: null, roundStep: 1,
    excludeSingle: false, sources: [],
  };
  const taken = new Set<string>();
  const take = (field: keyof ResolvedRule, value: unknown, rule: PricingRule) => {
    if (taken.has(field) || value == null) return;
    (out as Record<string, unknown>)[field] = value;
    taken.add(field);
    out.sources.push({ field, scope: rule.scope, id: rule.id });
  };
  for (const r of chain) {
    take('markupPct', r.markup_pct, r);
    take('minProfitUah', r.min_profit_uah, r);
    take('minPriceUah', r.min_price_uah, r);
    take('roundStep', r.round_step, r);
    if (!taken.has('excludeSingle') && r.exclude_single != null) {
      out.excludeSingle = !!r.exclude_single;
      taken.add('excludeSingle');
      out.sources.push({ field: 'excludeSingle', scope: r.scope, id: r.id });
    }
  }
  return out;
}

export type PriceResult = {
  price: number;
  /** прибуток після утримання комісії, грн */
  profit: number;
  /** що спрацювало: відсоток чи абсолютний мінімум */
  driver: 'markup' | 'min_profit' | 'min_price';
  excluded: boolean;
  rule: ResolvedRule;
};

const roundUpTo = (value: number, step: number) =>
  step > 0 ? Math.ceil(value / step) * step : Math.ceil(value);

export function computeMarketplacePrice(
  t: PriceTarget,
  rules: PricingRule[],
  marketplace: 'rozetka' | 'prom',
): PriceResult {
  const rule = resolveRule(rules, t, marketplace);
  const byPct = t.cost * (rule.markupPct / 100);
  const targetProfit = Math.max(byPct, rule.minProfitUah);
  let driver: PriceResult['driver'] = byPct >= rule.minProfitUah ? 'markup' : 'min_profit';

  const c = Math.min(Math.max(t.commissionPct, 0), 95) / 100;
  let price = roundUpTo((t.cost + targetProfit) / (1 - c), rule.roundStep);

  // Нижні межі: РРЦ постачальника і межа з правила — обидві жорсткі
  const floor = Math.max(rule.minPriceUah ?? 0, t.minPrice ?? 0);
  if (floor > price) {
    price = roundUpTo(floor, rule.roundStep);
    driver = 'min_price';
  }

  return {
    price,
    profit: Math.round((price * (1 - c) - t.cost) * 100) / 100,
    driver,
    excluded: rule.excludeSingle,
    rule,
  };
}
