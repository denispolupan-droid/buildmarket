import { createClient } from '@supabase/supabase-js';

// Rozetka начисляет комиссию по (категория, ценовой порог): чем дороже товар — тем
// ниже базовый %. Итоговая (эффективная) ставка = base_pct × 1.08 (сбор/НДС площадки),
// как в остальной системе. Пороги хранятся в rozetka_commission_brackets.
export const ROZETKA_FEE_MULTIPLIER = 1.08;

export interface RozetkaCommissionItem {
  sku:            string;
  item_total:     number;
  commission_pct: number;   // эффективная % (с ×1.08)
  commission_amt: number;
  category_slug:  string | null;
}

export interface RozetkaCommissionResult {
  total_commission: number;
  net_revenue:      number;
  items:            RozetkaCommissionItem[];
}

export interface RozetkaBracket {
  price_from: number;   // нижняя граница цены, включительно
  base_pct:   number;   // базовый % Rozetka (до ×1.08)
}

/**
 * Чистый выбор бакета по цене: берём порог с наибольшим price_from ≤ price.
 * Возвращает base_pct или null, если ни один порог не подходит.
 */
export function selectBracketBasePct(brackets: RozetkaBracket[], unitPrice: number): number | null {
  let hit: number | null = null;
  let bestFrom = -Infinity;
  for (const b of brackets) {
    if (b.price_from <= unitPrice && b.price_from >= bestFrom) {
      bestFrom = b.price_from;
      hit = b.base_pct;
    }
  }
  return hit;
}

export interface ResolvedRozetkaItem {
  sku:          string;
  qty:          number;
  price:        number;                  // цена за единицу (определяет ценовой порог)
  brackets:     RozetkaBracket[] | null; // пороги узла категории товара (или null)
  flatPct:      number | null;           // fallback: плоская ставка категории (эффективная %)
  category_slug: string | null;
}

/**
 * Чистое ядро расчёта (без БД) — покрыто юнит-тестом.
 * Приоритет ставки: бакет по цене (base×1.08) → плоская ставка категории → fallbackPct.
 */
export function computeRozetkaCommissionCore(
  items: ResolvedRozetkaItem[],
  fallbackPct: number,
): RozetkaCommissionResult {
  let totalCommission = 0;
  const outItems: RozetkaCommissionItem[] = items.map(it => {
    const item_total = it.qty * it.price;

    let pct: number; // эффективная %
    const base = it.brackets ? selectBracketBasePct(it.brackets, it.price) : null;
    if (base != null) {
      pct = Math.round(base * ROZETKA_FEE_MULTIPLIER * 100) / 100;
    } else if (it.flatPct != null) {
      pct = it.flatPct;
    } else {
      pct = fallbackPct;
    }

    const commission_amt = Math.round(item_total * pct) / 100;
    totalCommission += commission_amt;
    return { sku: it.sku, item_total, commission_pct: pct, commission_amt, category_slug: it.category_slug };
  });

  const order_total = items.reduce((s, i) => s + i.qty * i.price, 0);
  return {
    total_commission: Math.round(totalCommission * 100) / 100,
    net_revenue:      Math.round((order_total - totalCommission) * 100) / 100,
    items:            outItems,
  };
}

export async function computeRozetkaCommission(
  orderItems: { sku: string; qty: number; price: number }[],
  opts: { fallbackPct: number },
): Promise<RozetkaCommissionResult> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const skus = orderItems.map(i => i.sku).filter(Boolean);

  const { data: products } = await db
    .from('products')
    .select('sku, category_slug, categories(rozetka_commission_rz_id, rozetka_category_id, rozetka_commission_pct)')
    .in('sku', skus);

  // sku -> { rzId (узел ставки), flatPct, slug }
  const prodMap = new Map<string, { rzId: string | null; flatPct: number | null; slug: string | null }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (products ?? []) as any[]) {
    const c = p.categories ?? {};
    const rzId = (c.rozetka_commission_rz_id ?? c.rozetka_category_id) != null
      ? String(c.rozetka_commission_rz_id ?? c.rozetka_category_id) : null;
    const flat = c.rozetka_commission_pct != null ? parseFloat(String(c.rozetka_commission_pct)) : null;
    prodMap.set(p.sku, { rzId, flatPct: flat != null && !isNaN(flat) ? flat : null, slug: p.category_slug });
  }

  // Тянем пороги для задействованных узлов (дефолтный бренд).
  const rzIds = [...new Set([...prodMap.values()].map(v => v.rzId).filter((x): x is string => !!x))];
  const bracketsByRz = new Map<string, RozetkaBracket[]>();
  if (rzIds.length > 0) {
    const { data: brRows } = await db
      .from('rozetka_commission_brackets')
      .select('rz_id, price_from, base_pct')
      .eq('brand', '-')
      .in('rz_id', rzIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of (brRows ?? []) as any[]) {
      const arr = bracketsByRz.get(b.rz_id) ?? [];
      arr.push({ price_from: Number(b.price_from), base_pct: Number(b.base_pct) });
      bracketsByRz.set(b.rz_id, arr);
    }
  }

  const resolved: ResolvedRozetkaItem[] = orderItems.map(item => {
    const p = prodMap.get(item.sku);
    const brackets = p?.rzId ? (bracketsByRz.get(p.rzId) ?? null) : null;
    return {
      sku:           item.sku,
      qty:           item.qty,
      price:         item.price,
      brackets,
      flatPct:       p?.flatPct ?? null,
      category_slug: p?.slug ?? null,
    };
  });

  return computeRozetkaCommissionCore(resolved, opts.fallbackPct);
}
