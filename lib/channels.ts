/**
 * Канали продажу — єдиний довідник (аудит 31.10.2026, п. 22 «таблиця channels»).
 * Коди ті самі, що в orders.channel_code; підписи й кольори — одні на журнал,
 * «Огляд», «Аналітику», «Звіти». До 08.11.2026 було чотири копії мап із різними
 * підписами («Сайт»/«Магазин», «Prom»/«Prom.ua»). Таблиця sales_channels (009)
 * лишилась порожньою й кодом не читається — довідник тримаємо в коді: канал
 * з'являється разом із адаптером/роутом, а не з рядка в адмінці.
 */
export type ChannelCode = 'website' | 'b2b' | 'dropship' | 'retail' | 'phone' | 'prom' | 'rozetka' | 'epicentr' | 'other';

export type ChannelKind = 'site' | 'b2b' | 'dropship' | 'offline' | 'marketplace' | 'other';

export type ChannelMeta = {
  code: ChannelCode;
  /** Короткий підпис для вузьких місць (чіпи, легенди). */
  label: string;
  /** Повний підпис для таблиць і звітів. */
  longLabel: string;
  color: string;
  kind: ChannelKind;
};

export const CHANNELS: readonly ChannelMeta[] = [
  { code: 'website',  label: 'Магазин',  longLabel: 'Сайт',       color: '#1E5AA8', kind: 'site' },
  { code: 'b2b',      label: 'Опт',      longLabel: 'Опт (B2B)',  color: '#6B21A8', kind: 'b2b' },
  { code: 'dropship', label: 'Дроп',     longLabel: 'Дроп',       color: '#0E7490', kind: 'dropship' },
  { code: 'retail',   label: 'Роздріб',  longLabel: 'Роздріб',    color: '#B45309', kind: 'offline' },
  { code: 'phone',    label: 'Телефон',  longLabel: 'Телефон',    color: '#334155', kind: 'offline' },
  { code: 'prom',     label: 'Prom',     longLabel: 'Prom.ua',    color: '#C2410C', kind: 'marketplace' },
  { code: 'rozetka',  label: 'Rozetka',  longLabel: 'Rozetka',    color: '#15803D', kind: 'marketplace' },
  { code: 'epicentr', label: 'Епіцентр', longLabel: 'Епіцентр',   color: '#BE123C', kind: 'marketplace' },
  { code: 'other',    label: 'Інше',     longLabel: 'Інше',       color: '#94A3B8', kind: 'other' },
];

const BY_CODE: Record<string, ChannelMeta> = Object.fromEntries(CHANNELS.map(c => [c.code, c]));

/** Мета каналу; невідомий або порожній код → 'other' (підпис — сам код, якщо він є). */
export function channelMeta(code: string | null | undefined): ChannelMeta {
  const m = BY_CODE[code ?? ''];
  if (m) return m;
  const fallback = BY_CODE.other;
  return code ? { ...fallback, code: 'other', label: code, longLabel: code } : fallback;
}

export const channelLabel = (code: string | null | undefined, long = false): string =>
  long ? channelMeta(code).longLabel : channelMeta(code).label;

export const channelColor = (code: string | null | undefined): string => channelMeta(code).color;

export const isMarketplaceChannel = (code: string | null | undefined): boolean => channelMeta(code).kind === 'marketplace';

/** Повні підписи code → longLabel (для таблиць і звітів, де раніше були локальні CHANNEL_LABELS). */
export const CHANNEL_LABELS: Record<string, string> = Object.fromEntries(CHANNELS.map(c => [c.code, c.longLabel]));
