import { log } from '../../log';
import type { DeliveryProvider, ParcelPhase, ParcelUpdate, TrackedOrder } from '../types';

/**
 * Meest (13.11.2026): поштомати й ЦВЗ Епіцентру, Meest з Rozetka/Prom. Договору й
 * ключів API в нас немає, але публічний трекер Meest Group (той, що на
 * t.meest-group.com/int) віддає JSON без авторизації — ним і ведемо посилку.
 * До цього Meest був у manual-postal: замовлення висіли в «До відправки», хоча
 * посилку прийняли (№26111073: 606 «прийнято» 12.11 17:38, 8081 «виїхала»).
 *
 * Коди — таблиця статусів Meest (wiki.meest-group.com, «Tracking shipments»):
 * 2 «створено, не здано»; 1214 — на відділенні доручення (поштомат); 1622 — доручено;
 * 1825 — повернення відправнику, 1620 — відмова; решта — у дорозі. Трекер віддає
 * лише англійський текст, тому підпис беремо з української назви коду.
 */
const TRACK_URL = 'https://t.meest-group.com/get_int.php?what=tracking&out=json&lang=ua&number=';

export type MeestEvent = { eventDate?: string; city?: string; statusCode?: string | number; eventDescription?: string };

const CODE_UA: Record<string, string> = {
  '2': 'Створено, ще не здано',
  '101': 'Оформлено для відправки',
  '606': 'Прийнято відділенням',
  '808': 'Виїхала із сортувального центру',
  '8081': 'Виїхала з відділення відправника',
  '1214': 'Прибула на відділення доставки',
  '1315': 'Передано курʼєру',
  '1521': 'Змінено напрямок посилки',
  '1622': 'Доручено',
  '1620': 'Відмова отримувача',
  '1621': 'Переадресація',
  '1625': 'Немає контакту з отримувачем',
  '1627': 'Не встигли доставити',
  '1825': 'Повернення відправнику',
  '2028': 'Згруповано для сортувального центру',
  '2129': 'Сортування',
  '2331': 'Доручення призупинено',
  '5051': 'Посилка не прибула',
  '11': 'Виїхала з транзитного сортувального центру',   // 13.11.2026, 724-0577605
};

/**
 * Код, якого немає в таблиці, — перекладаємо відомі англійські фрази трекера,
 * щоб у журналі не з'являвся англійський текст (13.11: «Departure from the
 * transit sorting center»). Фазу це не змінює — вона лише за кодом.
 */
const PHRASE_UA: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/departure from the transit sorting cent(er|re)/i, 'Виїхала з транзитного сортувального центру'],
  [/arriv\w* (at|to) the (transit )?sorting cent(er|re)/i, 'Прибула на сортувальний центр'],
  [/departure from the sorting cent(er|re)/i, 'Виїхала із сортувального центру'],
  [/transportation to the settlement\s+(.+)/i, m => `Прямує до ${m[1].trim()}`],
  [/arriv\w* (at|to) the (delivery )?(branch|office|parcel locker|postomat)/i, 'Прибула на відділення доставки'],
];

function phraseUa(desc: string): string | null {
  for (const [re, ua] of PHRASE_UA) {
    const m = desc.match(re);
    if (m) return typeof ua === 'string' ? ua : ua(m);
  }
  return null;
}

const CREATED_CODE = '2';
const ARRIVED_CODE = '1214';
const DELIVERED_CODE = '1622';
const RETURN_CODES = new Set(['1825', '1620']);

export function meestPhase(code: string): ParcelPhase {
  if (code === DELIVERED_CODE) return 'delivered';
  if (RETURN_CODES.has(code)) return 'returning';
  if (code === ARRIVED_CODE) return 'arrived';
  if (code === CREATED_CODE) return 'created';
  return code ? 'in_transit' : 'unknown';
}

/** Чиста частина: події трекера → оновлення (за останньою подією; «прийнято» — будь-яка подія після створення). */
export function meestUpdate(events: MeestEvent[]): ParcelUpdate | null {
  const evs = events.filter(e => e && e.statusCode != null && String(e.statusCode) !== '');
  if (!evs.length) return null;
  const sorted = [...evs].sort((a, b) => String(a.eventDate ?? '').localeCompare(String(b.eventDate ?? '')));
  const last = sorted[sorted.length - 1];
  const code = String(last.statusCode);
  const desc = (last.eventDescription ?? '').trim();
  const label = CODE_UA[code] || phraseUa(desc) || desc || `Статус ${code}`;
  const city = (last.city ?? '').trim();
  return {
    statusText: `Meest: ${label}${city && code !== DELIVERED_CODE ? ` (${city})` : ''}`,
    phase: meestPhase(code),
    carrierAccepted: sorted.some(e => String(e.statusCode) !== CREATED_CODE),
    expenses: [],   // доставку Meest-Епіцентр утримує площадка в білінгу, не тут
  };
}

async function fetchMeestEvents(ttn: string): Promise<MeestEvent[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(TRACK_URL + encodeURIComponent(ttn), { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (FixLine delivery sync)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { events?: MeestEvent[] };
    return Array.isArray(json?.events) ? json.events : null;   // «parcel not found» — без подій
  } finally {
    clearTimeout(timer);
  }
}

export const meestProvider: DeliveryProvider = {
  code: 'meest',
  label: 'Meest (публічний трекер)',
  handles: t => (t ?? '').trim() === 'meest',
  // Покупцю Епіцентру/Rozetka/Prom про рух пише сама площадка
  notifiesParcelEvents: false,
  async track(orders: TrackedOrder[]) {
    const out = new Map<string, ParcelUpdate>();
    const byTtn = new Map<string, ParcelUpdate | null>();
    for (const o of orders) {
      const ttn = String(o.tracking_number ?? '').trim();
      if (!ttn) continue;
      if (!byTtn.has(ttn)) {
        try {
          const events = await fetchMeestEvents(ttn);
          byTtn.set(ttn, events ? meestUpdate(events) : null);
        } catch (err) {
          log.warn('delivery.meest_track_failed', { order: o.order_number, ttn, err: err instanceof Error ? err.message : String(err) });
          byTtn.set(ttn, null);
        }
      }
      const u = byTtn.get(ttn);
      if (u) out.set(o.id, u);
    }
    return out;
  },
};
