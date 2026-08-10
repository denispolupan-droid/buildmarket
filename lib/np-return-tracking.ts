/**
 * Де зараз посилка, яка їде назад.
 *
 * Коли одержувач не забирає замовлення, Нова Пошта не везе ту саму накладну
 * назад — вона створює НОВУ, «на підставі» старої (LastCreatedOnTheBasisNumber
 * із типом CargoReturn). Стара при цьому назавжди застигає в статусі «Відмова
 * від отримання», і саме його ми показували в картці повернення. Тобто напис
 * був про подію тижневої давнини, а не про те, де посилка зараз.
 *
 * Тут — розбір відповіді трекінгу зворотної накладної: місце, час прибуття і
 * дата, до якої зберігання безкоштовне. Останнє важливіше, ніж здається: після
 * неї НП починає рахувати платне зберігання, і забута посилка тихо дорожчає.
 */

/** Сирий документ трекінгу НП — беремо лише ті поля, які реально читаємо. */
export type NpTrackingDoc = {
  Number?: string;
  Status?: string;
  StatusCode?: string | number;
  CityRecipient?: string;
  WarehouseRecipient?: string;
  ActualDeliveryDate?: string;
  DatePayedKeeping?: string;
  LastCreatedOnTheBasisNumber?: string;
  LastCreatedOnTheBasisDocumentType?: string;
};

export type ReturnTracking = {
  ttn: string;
  status: string;
  statusCode: string;
  /** «Харків, Відділення №27» — куди приїхала або їде */
  place: string | null;
  /** Коли прибула на відділення (порожньо, поки в дорозі) */
  arrivedAt: string | null;
  /** До цієї дати зберігання безкоштовне */
  storageUntil: string | null;
  syncedAt: string;
};

/** Код статусу НП «Прибув у відділення» — з нього починається відлік зберігання. */
const ARRIVED_CODES = new Set(['7', '8', '9', '10', '11']);

/**
 * Номер зворотної накладної, якщо НП її вже створила. Тип перевіряємо явно:
 * на підставі накладної створюють не лише повернення (буває переадресація), і
 * показувати чужий номер як «повернення» — гірше, ніж не показувати нічого.
 */
export function pickReturnTtn(doc: NpTrackingDoc): string | null {
  if (doc.LastCreatedOnTheBasisDocumentType !== 'CargoReturn') return null;
  const n = String(doc.LastCreatedOnTheBasisNumber ?? '').trim();
  return n || null;
}

/** Місце словами: місто + відділення, як їх називає сама НП. */
export function returnPlace(doc: NpTrackingDoc): string | null {
  const city = (doc.CityRecipient ?? '').trim();
  // «Відділення №27 (до 200 кг на одне місце): вул. Шевченка, 317» — у рядку
  // картки потрібен лише номер відділення, решта тільки заважає читати.
  const wh = (doc.WarehouseRecipient ?? '').trim().replace(/\s*\(.*?\)\s*/, ' ').split(':')[0].trim();
  const parts = [city, wh].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function buildReturnTracking(doc: NpTrackingDoc, syncedAt: string): ReturnTracking | null {
  const ttn = String(doc.Number ?? '').trim();
  if (!ttn) return null;
  const statusCode = String(doc.StatusCode ?? '');
  return {
    ttn,
    status: doc.Status ?? '',
    statusCode,
    place: returnPlace(doc),
    arrivedAt: ARRIVED_CODES.has(statusCode) ? (doc.ActualDeliveryDate ?? null) : null,
    storageUntil: doc.DatePayedKeeping ?? null,
    syncedAt,
  };
}

/**
 * Скільки днів лишилось на безкоштовне зберігання. Від'ємне — зберігання вже
 * платне. null — дати немає (посилка ще в дорозі).
 */
export function storageDaysLeft(t: Pick<ReturnTracking, 'storageUntil'>, now: Date): number | null {
  if (!t.storageUntil) return null;
  // НП віддає «2026-08-18 17:39:37» без зони — вважаємо київським часом доби,
  // точність до дня тут і потрібна.
  const until = new Date(t.storageUntil.replace(' ', 'T'));
  if (Number.isNaN(until.getTime())) return null;
  return Math.ceil((until.getTime() - now.getTime()) / 86_400_000);
}

/** Рядок для картки: «Прибув у відділення · Харків, Відділення №27 · зберігання до 18.08». */
export function returnTrackingLabel(t: ReturnTracking, now: Date): string {
  const days = storageDaysLeft(t, now);
  const until = t.storageUntil ? t.storageUntil.slice(8, 10) + '.' + t.storageUntil.slice(5, 7) : null;
  const storage = until == null || days == null ? null
    : days < 0 ? `платне зберігання з ${until}`
    : `безкоштовне зберігання до ${until}`;
  return [t.status, t.place, storage].filter(Boolean).join(' · ');
}
