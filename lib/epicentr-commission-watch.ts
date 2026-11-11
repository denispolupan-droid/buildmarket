/**
 * Сторож комісій Епіцентру: чи не змінив маркетплейс ставки, з яких ми рахуємо ціни.
 *
 * Звідки ставки. Публічний тариф (сторінка кабінету /commissions) віддає API
 * core-api.epicentrm.com.ua/v1/billing/tariffs/default/commissions/tree — дерево
 * категорій зі ставкою на вузлі. id вузла НЕ дорівнює коду категорії з фіда, тому
 * вузол шукаємо за шляхом назв із публічної Google-таблиці «Дерево категорій»
 * (ID = наш epicentr_category_code, колонки «Рівень 1…5»). Ставка вузла —
 * commissions[] без бренду, value: базова (найвища), до порогу ціни; priceRanges
 * (поріг у копійках) лише знижують % для дорогих позицій. У категоріях ми тримаємо
 * саме базову — вона консервативна (11.11.2026, клей 18 %, фарби 20 %).
 *
 * Що робить:
 *   • compareCommissions — чиста звірка наших ставок з тарифом (тест);
 *   • loadEpicentrTariffRates — живі ставки для набору кодів (мережа);
 *   • invoiceCommissionAlerts — факт із рахунку замовлення вище нашої ставки.
 * Ставки в базі НЕ змінюємо — лише алерт власнику: зміна комісії міняє ціни.
 */
import { fetchWithTimeout } from './fetch-timeout';

const TREE_API = 'https://core-api.epicentrm.com.ua/v1/billing/tariffs/default/commissions/tree';
const CATEGORY_SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1Zzt9KHX5E5RPforoM924fDfdB3rx6O2TgxOKZy7t-fw/export?format=csv';

type TreeNode = {
  id: number;
  translations: { languageCode: string; title: string }[];
  commissions: { brandId: string | null; value: number }[];
};

export type TariffRate = { rate: number | null; path: string; exact: boolean };

export type CommissionDiff = { slug: string; code: string; ours: number | null; theirs: number; path: string };

/** Наші категорії проти тарифу: лише ті, де тариф відомий і ставка інша. */
export function compareCommissions(
  cats: { slug: string; epicentr_category_code: string | null; epicentr_commission_pct: number | null }[],
  rates: Map<string, TariffRate>,
): CommissionDiff[] {
  const out: CommissionDiff[] = [];
  for (const c of cats) {
    if (!c.epicentr_category_code) continue;
    const t = rates.get(c.epicentr_category_code);
    if (!t || t.rate == null) continue;
    const ours = c.epicentr_commission_pct != null ? Number(c.epicentr_commission_pct) : null;
    if (ours == null || Math.abs(ours - t.rate) > 0.005) {
      out.push({ slug: c.slug, code: c.epicentr_category_code, ours, theirs: t.rate, path: t.path });
    }
  }
  return out;
}

/** Рядок CSV з лапками (назви категорій бувають із комами). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Базова ставка вузла: запис без бренду (інакше перший). */
export function nodeRate(n: Pick<TreeNode, 'commissions'>): number | null {
  const c = n.commissions?.find(x => x.brandId == null) ?? n.commissions?.[0];
  return c && Number.isFinite(Number(c.value)) ? Number(c.value) : null;
}

const uaTitle = (n: Pick<TreeNode, 'translations'>) => n.translations?.find(t => t.languageCode === 'ua')?.title ?? '';

/**
 * Вузол тарифу за назвою рівня з таблиці. Спершу точний збіг; інакше — єдиний
 * вузол, чия назва починається з назви таблиці: у таблиці «Витратні матеріали»,
 * у тарифі «Витратні матеріали для інструментів» (11.11.2026) — без цього звірка
 * брала ставку предка (15 % замість 13 %).
 */
export function pickChild<T extends Pick<TreeNode, 'translations'>>(nodes: T[], title: string): T | undefined {
  const exact = nodes.find(n => uaTitle(n) === title);
  if (exact) return exact;
  const t = title.toLowerCase();
  const pref = nodes.filter(n => uaTitle(n).toLowerCase().startsWith(t));
  return pref.length === 1 ? pref[0] : undefined;
}

/**
 * Живі ставки тарифу для кодів категорій. Шлях беремо з таблиці «Дерево категорій»
 * і спускаємось деревом за назвами. Якщо назва глибшого рівня в тарифі інша —
 * беремо найглибшого знайденого предка (exact=false: ставка категорії успадкована
 * або назва розійшлась — звірка все одно корисна, але позначаємо).
 */
export async function loadEpicentrTariffRates(codes: string[]): Promise<Map<string, TariffRate>> {
  const res = await fetchWithTimeout(CATEGORY_SHEET_CSV, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Дерево категорій Епіцентру: ${res.status}`);
  const paths = new Map<string, string[]>();
  for (const line of (await res.text()).split(/\r?\n/).slice(1)) {
    const r = parseCsvLine(line);
    if (r[0]) paths.set(r[0].trim(), r.slice(1, 6).map(s => s.trim()).filter(Boolean));
  }

  const kids = new Map<number | null, TreeNode[]>();
  const children = async (pid: number | null): Promise<TreeNode[]> => {
    const hit = kids.get(pid);
    if (hit) return hit;
    const q = pid == null ? 'filter%5BisRoot%5D=true&limit=100' : `filter%5BparentId%5D=${pid}&limit=200`;
    const r = await fetchWithTimeout(`${TREE_API}?${q}`);
    if (!r.ok) throw new Error(`Тариф Епіцентру: ${r.status}`);
    const items = ((await r.json()) as { items?: TreeNode[] }).items ?? [];
    kids.set(pid, items);
    return items;
  };

  const out = new Map<string, TariffRate>();
  for (const code of [...new Set(codes)]) {
    const path = paths.get(code);
    if (!path?.length) { out.set(code, { rate: null, path: '', exact: false }); continue; }
    let pid: number | null = null;
    let last: TreeNode | null = null;
    let depth = 0;
    for (const title of path) {
      const node: TreeNode | undefined = pickChild(await children(pid), title);
      if (!node) break;
      last = node; pid = node.id; depth++;
    }
    out.set(code, { rate: last ? nodeRate(last) : null, path: path.join(' > '), exact: depth === path.length });
  }
  return out;
}

/**
 * Рахунок замовлення (/v1/billing/orders/{id}/invoice) проти наших ставок: позиції,
 * де Епіцентр бере більше, ніж закладено в ціну. Менша ставка — норма (пороги
 * ціни знижують %), про неї не кажемо.
 */
export function invoiceCommissionAlerts(
  items: { externalId: string | null; title: string; commissionRate: string }[],
  oursBySku: Map<string, number | null>,
  toSku: (externalId: string) => string,
): { sku: string; title: string; ours: number | null; theirs: number }[] {
  const out: { sku: string; title: string; ours: number | null; theirs: number }[] = [];
  for (const it of items) {
    const theirs = Number(it.commissionRate);
    if (!Number.isFinite(theirs) || !it.externalId) continue;
    const sku = toSku(it.externalId);
    const ours = oursBySku.get(sku) ?? null;
    if (ours == null || theirs > ours + 0.005) out.push({ sku, title: it.title, ours, theirs });
  }
  return out;
}
