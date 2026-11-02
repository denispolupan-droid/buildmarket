/**
 * Корекції цін маркетплейсів — чиста логіка (без бази, можна і на клієнті).
 *
 * Модель (міграція 147): «постійно — наценка, тимчасово — корекція».
 * Постійна ціна МП рахується від наценки (lib/marketplace-pricing), а акції й
 * зміни «до дати» живуть окремими рядками price_adjustments. Ціна фіда =
 * формула × Π(1 + pct/100) активних корекцій каналу; округлення — у формулі,
 * в кінці. Добуток переставний — корекції вимикаються в будь-якому порядку.
 *
 * Акційні корекції (is_promo) рахуються окремим множником: ціна фіда — з усіма
 * корекціями, стара ціна для площадки — без акційних (Rozetka <price_old>,
 * Prom <price>/<price_promo>).
 *
 * Дати — за Києвом: корекція діє з starts_on (включно) до ends_on (виключно,
 * «повернути після» = у цю дату ціна вже без корекції).
 */

export const ADJ_CHANNELS = ['prom', 'rozetka'] as const;
export type AdjChannel = typeof ADJ_CHANNELS[number];

export const ADJ_CHANNEL_LABEL: Record<AdjChannel, string> = { prom: 'Prom', rozetka: 'Rozetka' };

export function isAdjChannel(c: string): c is AdjChannel {
  return (ADJ_CHANNELS as readonly string[]).includes(c);
}

export type AdjRow = {
  id?: number;
  log_id?: number | null;
  channel: AdjChannel;
  sku: string;
  pct: number;
  is_promo: boolean;
  starts_on: string;          // YYYY-MM-DD
  ends_on: string | null;     // YYYY-MM-DD, виключно
  cancelled_at?: string | null;
  applied_state?: 'pending' | 'active' | 'ended';
  comment?: string | null;
};

export type AdjState = 'scheduled' | 'active' | 'ended' | 'cancelled';

/** Сьогоднішня дата за Києвом, YYYY-MM-DD. */
export function kyivToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
}

export function adjState(row: Pick<AdjRow, 'starts_on' | 'ends_on' | 'cancelled_at'>, today: string): AdjState {
  if (row.cancelled_at) return 'cancelled';
  if (row.starts_on > today) return 'scheduled';
  if (row.ends_on && today >= row.ends_on) return 'ended';
  return 'active';
}

/** Стан для журналу/крона: заплановано → pending, діє → active, решта → ended. */
export function appliedStateFor(state: AdjState): 'pending' | 'active' | 'ended' {
  return state === 'active' ? 'active' : state === 'scheduled' ? 'pending' : 'ended';
}

/** regular — тимчасові зміни без позначки «акція», promo — акції. */
export type Factor = { regular: number; promo: number };
export const NO_FACTOR: Factor = { regular: 1, promo: 1 };

/** Множники активних корекцій: «канал:товар» → { regular, promo }. */
export type FactorMap = Map<string, Factor>;

const key = (channel: string, sku: string) => `${channel}:${sku}`;

export function buildFactorMap(rows: AdjRow[], today: string): FactorMap {
  const map: FactorMap = new Map();
  for (const r of rows) {
    if (adjState(r, today) !== 'active') continue;
    const k = key(r.channel, r.sku);
    const f = map.get(k) ?? { regular: 1, promo: 1 };
    const m = 1 + Number(r.pct) / 100;
    if (r.is_promo) f.promo *= m;
    else f.regular *= m;
    map.set(k, f);
  }
  return map;
}

export function factorOf(map: FactorMap | null | undefined, channel: AdjChannel, sku: string): Factor {
  return map?.get(key(channel, sku)) ?? NO_FACTOR;
}

/** Усі корекції разом — множник ціни фіда. */
export function totalFactor(f: Factor): number {
  return f.regular * f.promo;
}

/** Чи діє на товар акція (є акційний множник ≠ 1). */
export function hasPromo(f: Factor): boolean {
  return Math.abs(f.promo - 1) > 1e-12;
}

/** Підпис множника для таблиць: +2,9 % / -10 %. */
export function factorLabel(x: number): string {
  const pct = (x - 1) * 100;
  const s = Math.abs(pct) < 0.005 ? '0' : pct.toFixed(2).replace(/\.?0+$/, '');
  return `${pct > 0 ? '+' : ''}${s.replace('.', ',')} %`;
}
