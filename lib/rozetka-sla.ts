/**
 * lib/rozetka-sla.ts — набори доставки (SLA) Rozetka і те, які товари на них стоять.
 *
 * Доставка в точки видачі вмикається НЕ по товару, а набором доставки: у товара
 * є sla_id, у набору — перелік служб. Набір із точками впізнаємо за складом
 * служб, а не за id: id свій у кожного продавця, а рядок «ROZETKA Delivery»
 * у переліку — ознака однозначна й переживе перейменування набору.
 *
 * Керувати цим через API не можна: sla_id у товарі є тільки на читання і як
 * фільтр у /goods/*, ендпоїнта на призначення набору в апідоку немає. Тож це
 * рівно звіт — подивитися, де що стоїть, а міняти в кабінеті.
 */
import { rozetkaFetch } from './rozetka-api';

export type RozetkaSla = {
  roz_id: number;
  title: string;
  rz_self_pickup?: boolean;
  is_standard?: boolean;
  is_reserve?: boolean;
  ff?: boolean;
  deliveryServices?: { delivery_service_name?: string; title?: string }[];
};

export type RozetkaSlaItem = {
  article: string;
  name: string;
  sla_id: number;
  stock_quantity?: number;
  price?: number | string;
};

export type RozetkaSlaReport = {
  slas: {
    id: number; title: string; pickup: boolean;
    isStandard: boolean; isReserve: boolean; ff: boolean;
    services: string[]; itemCount: number;
  }[];
  totals: { items: number; withPickup: number; withoutPickup: number };
  /** Групи назв, де є товари без точок видачі — найбільші згори. */
  groups: { group: string; off: number; on: number }[];
  /** Товари без точок видачі, від найбільшого залишку. */
  off: { article: string; name: string; slaId: number; slaTitle: string; stock: number }[];
};

/** Набір дає точки видачі, якщо серед його служб є ROZETKA Delivery. */
export function slaHasPickup(sla: RozetkaSla): boolean {
  return (sla.deliveryServices ?? []).some(d =>
    /rozetka\s*delivery/i.test(`${d.delivery_service_name ?? ''} ${d.title ?? ''}`));
}

/** Перших два слова назви — цього досить, щоб побачити розʼїзд усередині товарної групи. */
export function slaGroupKey(name: string): string {
  return String(name ?? '').trim().split(/\s+/).slice(0, 2).join(' ');
}

export async function fetchRozetkaSlas(): Promise<RozetkaSla[]> {
  const { slas } = await rozetkaFetch<{ slas: RozetkaSla[] }>('/sla/search');
  return slas ?? [];
}

/** Усі товари продавця. /items/search віддає по 20 на сторінку — per_page він ігнорує. */
export async function fetchRozetkaItems(maxPages = 200): Promise<RozetkaSlaItem[]> {
  const items: RozetkaSlaItem[] = [];
  let page = 1, pages = 1;
  do {
    const c = await rozetkaFetch<{ items: RozetkaSlaItem[]; _meta?: { pageCount?: number } }>(
      `/items/search?page=${page}`);
    items.push(...(c.items ?? []));
    pages = c._meta?.pageCount ?? 1;
    page++;
  } while (page <= pages && page <= maxPages);
  return items;
}

export function buildRozetkaSlaReport(slas: RozetkaSla[], items: RozetkaSlaItem[]): RozetkaSlaReport {
  const pickupIds = new Set(slas.filter(slaHasPickup).map(s => Number(s.roz_id)));
  const title = new Map(slas.map(s => [Number(s.roz_id), s.title]));
  const isOn = (i: RozetkaSlaItem) => pickupIds.has(Number(i.sla_id));

  const perSla = new Map<number, number>();
  for (const i of items) perSla.set(Number(i.sla_id), (perSla.get(Number(i.sla_id)) ?? 0) + 1);

  const groups = new Map<string, { on: number; off: number }>();
  for (const i of items) {
    const k = slaGroupKey(i.name);
    const e = groups.get(k) ?? { on: 0, off: 0 };
    if (isOn(i)) e.on++; else e.off++;
    groups.set(k, e);
  }

  return {
    slas: slas.map(s => ({
      id:         Number(s.roz_id),
      title:      s.title,
      pickup:     slaHasPickup(s),
      isStandard: Boolean(s.is_standard),
      isReserve:  Boolean(s.is_reserve),
      ff:         Boolean(s.ff),
      services:   (s.deliveryServices ?? []).map(d => d.title || d.delivery_service_name || '').filter(Boolean),
      itemCount:  perSla.get(Number(s.roz_id)) ?? 0,
    })),
    totals: {
      items:          items.length,
      withPickup:     items.filter(isOn).length,
      withoutPickup:  items.filter(i => !isOn(i)).length,
    },
    groups: [...groups.entries()]
      .filter(([, v]) => v.off > 0)
      .map(([group, v]) => ({ group, off: v.off, on: v.on }))
      .sort((a, b) => b.off - a.off),
    off: items.filter(i => !isOn(i))
      .map(i => ({
        article:  i.article,
        name:     i.name,
        slaId:    Number(i.sla_id),
        slaTitle: title.get(Number(i.sla_id)) ?? '',
        stock:    Number(i.stock_quantity ?? 0),
      }))
      .sort((a, b) => b.stock - a.stock),
  };
}

export async function getRozetkaSlaReport(): Promise<RozetkaSlaReport> {
  const [slas, items] = await Promise.all([fetchRozetkaSlas(), fetchRozetkaItems()]);
  return buildRozetkaSlaReport(slas, items);
}
