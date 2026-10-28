/**
 * Знімок накладної: що саме ми передали перевізнику при створенні.
 *
 * Навіщо. Вікно «Деталі ЕН» має показати післяплату, вагу, отримувача тощо, а
 * перевізники Rozetka (власний договір і маркетплейс) за номером ці дані назад не
 * віддають, НП — не все. Тож при створенні пишемо в orders.ttn_snapshot те, що
 * відправили, а живі дані перевізника домішуємо вже у вікні.
 *
 * Знімок прив'язаний до номера (ttn): замінили номер вручну — знімок чужий і не
 * показується (`snapshotFor`).
 */

export type TtnCarrier = 'np' | 'rz_delivery' | 'rozetka_delivery';

export type TtnSnapshot = {
  carrier:     TtnCarrier;
  ttn:         string;
  created_at:  string;          // ISO
  created_by?: string | null;   // email менеджера
  /** Сума до стягнення з отримувача, ₴; 0 — без післяплати */
  cod:         number;
  /** Чи виправив менеджер післяплату вручну (інакше — сума з замовлення) */
  cod_manual?: boolean;
  declared?:   number | null;   // оголошена вартість, ₴
  weight?:     number | null;   // кг
  dims?:       { length: number; width: number; height: number } | null; // см
  places?:     number | null;
  /** Розбивка по місцях, якщо їх кілька й кожне вводили окремо (weight/dims тоді — зведені) */
  seats?:      { weight: number; length: number; width: number; height: number }[] | null;
  payer?:      string | null;   // хто платить доставку: 'sender' | 'receiver' | НП PayerType
  payment_method?: string | null;
  service_type?:   string | null;
  description?:    string | null;
  sender?:    { name?: string | null; phone?: string | null; city?: string | null; point?: string | null } | null;
  recipient?: { name?: string | null; phone?: string | null; city?: string | null; point?: string | null; address?: string | null } | null;
  /** Об'єднана посилка: номери замовлень, що їдуть цією накладною */
  orders?:    number[] | null;
  /** Що повернув перевізник при створенні (вартість доставки, комісія, дата) */
  result?:    { delivery_cost?: number | null; payment_fee?: number | null; delivery_date?: string | null } | null;
};

/** Знімок, якщо він стосується саме цього номера; інакше null. */
export function snapshotFor(raw: unknown, ttn: string | null | undefined): TtnSnapshot | null {
  if (!raw || typeof raw !== 'object' || !ttn) return null;
  const s = raw as TtnSnapshot;
  return s.ttn && String(s.ttn).trim().toUpperCase() === String(ttn).trim().toUpperCase() ? s : null;
}

/** Число або null — для полів, які приходять із форми рядками. */
export function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}
