/**
 * Вікно «Деталі ЕН»: зводить знімок (що ми вписали при створенні, lib/ttn-snapshot)
 * і живі дані перевізника в один список рядків. Чиста функція — мережу робить роут
 * app/api/admin/orders/[id]/ttn-details.
 *
 * Пріоритет. Живе значення перевізника важливіше за знімок там, де перевізник
 * міг змінити дані сам (фактична вага, вартість доставки, статус) або де знімку
 * немає (старі накладні). Знімок важливіший там, де перевізник даних не віддає
 * зовсім (ROZETKA Доставка: післяплата, вага, габарити).
 */
import type { TtnCarrier, TtnSnapshot } from './ttn-snapshot';

/** Поля TrackingDocument.getStatusDocuments, які показуємо (НП віддає їх рядками). */
export type NpLiveDoc = {
  Number?: string; Status?: string; StatusCode?: string;
  DateCreated?: string; ScheduledDeliveryDate?: string; ActualDeliveryDate?: string; RecipientDateTime?: string;
  CitySender?: string; WarehouseSender?: string; SenderAddress?: string; SenderFullNameEW?: string; PhoneSender?: string;
  CounterpartySenderDescription?: string;
  CityRecipient?: string; WarehouseRecipient?: string; RecipientAddress?: string;
  RecipientFullName?: string; RecipientFullNameEW?: string; PhoneRecipient?: string;
  DocumentWeight?: string | number; FactualWeight?: string | number; VolumeWeight?: string | number; SeatsAmount?: string | number;
  AnnouncedPrice?: string | number; DocumentCost?: string | number;
  AfterpaymentOnGoodsCost?: string | number; RedeliverySum?: string | number;
  PayerType?: string; PaymentMethod?: string; ServiceType?: string; CargoDescriptionString?: string;
};

/** Рядок ttn-list маркетплейсу Rozetka (lib/rozetka-delivery-ttn.ts). */
export type RozetkaLiveTtn = {
  created_at?: string; delivery_price?: string | null; cod_amount?: number | null; declared_price?: number | null;
  free_delivery?: boolean; sender?: { name?: string; address?: string; phones?: string[] } | null;
};

export type RzLiveStatus = { status_name: string; date: string };

export type TtnDetailsInput = {
  carrier:  TtnCarrier;
  ttn:      string;
  snapshot: TtnSnapshot | null;
  order: {
    contact?: string | null; phone?: string | null;
    delivery_city_name?: string | null; delivery_address?: string | null;
    carrier_status_text?: string | null; carrier_accepted_at?: string | null; carrier_delivered_at?: string | null;
    np_delivery_cost?: number | null; np_delivery_payer?: string | null;
    rz_delivery_cost?: number | null; rz_payment_fee?: number | null; rz_delivery_payer?: string | null;
    /** delivery-блок замовлення Rozetka (rozetka_data.delivery) */
    rozetka_delivery?: { recipient_title?: string | null; recipient_phone?: string | null; city?: { title?: string; city_name?: string } | null } | null;
  };
  np?:       NpLiveDoc | null;
  rozetka?:  RozetkaLiveTtn | null;
  rzHistory?: RzLiveStatus[] | null;
};

export type TtnRow = { label: string; value: string; hint?: string; accent?: boolean };
export type TtnSection = { title: string; rows: TtnRow[] };
export type TtnDetails = {
  carrierLabel: string;
  ttn:          string;
  sections:     TtnSection[];
  history:      RzLiveStatus[];
  /** Чого не вистачає і чому — показуємо внизу вікна */
  notes:        string[];
};

const CARRIER_LABEL: Record<TtnCarrier, string> = {
  np: 'Нова Пошта',
  rz_delivery: 'ROZETKA Доставка',
  rozetka_delivery: 'Rozetka (маркетплейс)',
};

const PAYER_LABEL: Record<string, string> = {
  sender: 'Відправник (ми)', Sender: 'Відправник (ми)',
  receiver: 'Отримувач', Recipient: 'Отримувач',
  ThirdPerson: 'Третя особа',
};

const SERVICE_LABEL: Record<string, string> = {
  WarehouseWarehouse: 'Відділення → відділення',
  WarehouseDoors: 'Відділення → адреса',
  DoorsWarehouse: 'Адреса → відділення',
  DoorsDoors: 'Адреса → адреса',
};

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function fmtUah(n: number): string {
  return `${n.toLocaleString('uk-UA', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} ₴`;
}

/** Перше непорожнє значення */
const first = <T,>(...vals: (T | null | undefined | '')[]): T | null => {
  for (const v of vals) if (v != null && v !== '') return v as T;
  return null;
};

/**
 * Дата для показу. Формати різні: ISO з БД (UTC → Київ), «2026-10-21 12:51:08»
 * у ROZETKA Доставки і «21-10-2026 12:51:33» у НП — обидва вже київський час,
 * тож їх лише переставляємо, не конвертуючи.
 */
export function fmtDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const local = s.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})/) ?? null;
  if (local) return `${local[3]}.${local[2]}.${local[1]}, ${local[4]}:${local[5]}`;
  const np = s.match(/^(\d{2})[-.](\d{2})[-.](\d{4})(?:[ ](\d{2}):(\d{2}))?/);
  if (np) return `${np[1]}.${np[2]}.${np[3]}${np[4] ? `, ${np[4]}:${np[5]}` : ''}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const dt = fmtDate;

/** Ключ сортування для дат обох «локальних» форматів і ISO */
const dateKey = (s: string): string => {
  const np = s.match(/^(\d{2})[-.](\d{2})[-.](\d{4})(.*)$/);
  return np ? `${np[3]}-${np[2]}-${np[1]}${np[4]}` : s;
};

export function buildTtnDetails(input: TtnDetailsInput): TtnDetails {
  const { carrier, snapshot: s, order: o, np, rozetka: rz } = input;
  const notes: string[] = [];
  const push = (rows: TtnRow[], label: string, value: string | null | undefined, extra: Partial<TtnRow> = {}) => {
    const v = value?.trim();
    if (v) rows.push({ label, value: v, ...extra });
  };
  // Перевізники віддають історію в різному порядку — зводимо до хронологічного
  const history = [...(input.rzHistory ?? [])].sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));

  // ── Гроші ──────────────────────────────────────────────────────────────────
  const money: TtnRow[] = [];
  // НП: «Контроль оплати» (AfterpaymentOnGoodsCost) або класична післяплата
  // (RedeliverySum) — непотрібне поле приходить нулем, тож беремо більше
  const npCod = [num(np?.AfterpaymentOnGoodsCost), num(np?.RedeliverySum)].filter((v): v is number => v != null);
  const codLive = carrier === 'np'
    ? (np ? (npCod.length ? Math.max(...npCod) : null) : null)
    : carrier === 'rozetka_delivery' ? num(rz?.cod_amount) : null;
  const cod = first(codLive, s ? s.cod : null);
  if (cod != null) {
    push(money, 'Післяплата', cod > 0 ? fmtUah(cod) : 'без післяплати', {
      accent: true,
      hint: s?.cod_manual ? 'виправлено вручну при створенні' : undefined,
    });
  } else {
    notes.push('Суму післяплати перевізник не віддає, а накладну створено до того, як ми почали зберігати її дані.');
  }
  push(money, 'Оголошена вартість', (() => {
    const v = first(carrier === 'np' ? num(np?.AnnouncedPrice) : carrier === 'rozetka_delivery' ? num(rz?.declared_price) : null, s?.declared ?? null);
    return v != null ? fmtUah(v) : null;
  })());
  const deliveryCost = carrier === 'np'
    ? first(num(np?.DocumentCost), o.np_delivery_cost ?? null)
    : carrier === 'rz_delivery'
      ? first(o.rz_delivery_cost ?? null, s?.result?.delivery_cost ?? null)
      : first(num(rz?.delivery_price), s?.result?.delivery_cost ?? null);
  push(money, 'Вартість доставки', deliveryCost != null ? fmtUah(deliveryCost) : null);
  const payer = first(carrier === 'np' ? np?.PayerType : null, s?.payer, carrier === 'np' ? o.np_delivery_payer : carrier === 'rz_delivery' ? o.rz_delivery_payer : null);
  push(money, 'Доставку оплачує', payer ? (PAYER_LABEL[payer] ?? payer) : (carrier === 'rozetka_delivery' ? PAYER_LABEL.sender : null));
  if (carrier === 'rz_delivery') {
    const fee = first(o.rz_payment_fee ?? null, s?.result?.payment_fee ?? null);
    push(money, 'Комісія за переказ післяплати', fee != null ? fmtUah(fee) : null);
  }

  // ── Отримувач ──────────────────────────────────────────────────────────────
  const rcp: TtnRow[] = [];
  const rd = o.rozetka_delivery ?? null;
  push(rcp, 'ПІБ', first(np?.RecipientFullName, np?.RecipientFullNameEW, s?.recipient?.name, rd?.recipient_title, o.contact));
  push(rcp, 'Телефон', first(np?.PhoneRecipient, s?.recipient?.phone, rd?.recipient_phone, o.phone));
  push(rcp, 'Місто', first(np?.CityRecipient, s?.recipient?.city, rd?.city?.title, rd?.city?.city_name, o.delivery_city_name));
  push(rcp, carrier === 'np' && np?.RecipientAddress && !np?.WarehouseRecipient ? 'Адреса' : 'Точка / відділення',
    first(np?.WarehouseRecipient, np?.RecipientAddress, s?.recipient?.point, s?.recipient?.address, o.delivery_address));

  // ── Відправник ─────────────────────────────────────────────────────────────
  const snd: TtnRow[] = [];
  push(snd, 'Відправник', first(np?.SenderFullNameEW?.trim(), np?.CounterpartySenderDescription?.trim(), s?.sender?.name, rz?.sender?.name));
  push(snd, 'Телефон', first(np?.PhoneSender, s?.sender?.phone, rz?.sender?.phones?.[0]));
  push(snd, 'Звідки', first(
    np?.WarehouseSender ? [np.CitySender, np.WarehouseSender].filter(Boolean).join(', ') : null,
    np?.SenderAddress,
    [s?.sender?.city, s?.sender?.point].filter(Boolean).join(', ') || null,
    rz?.sender?.address,
  ));

  // ── Посилка ────────────────────────────────────────────────────────────────
  const parcel: TtnRow[] = [];
  const w = first(carrier === 'np' ? first(num(np?.FactualWeight), num(np?.DocumentWeight)) : null, s?.weight ?? null);
  push(parcel, 'Вага', w != null ? `${w} кг` : null,
    { hint: carrier === 'np' && num(np?.VolumeWeight) ? `об'ємна ${num(np?.VolumeWeight)} кг` : undefined });
  push(parcel, 'Габарити', s?.dims ? `${s.dims.length} × ${s.dims.width} × ${s.dims.height} см` : null);
  push(parcel, 'Місць', (() => { const p = first(num(np?.SeatsAmount), s?.places ?? null); return p != null ? String(p) : null; })());
  push(parcel, 'Тип доставки', (() => { const t = first(np?.ServiceType, s?.service_type); return t ? (SERVICE_LABEL[t] ?? t) : null; })());
  push(parcel, 'Опис', first(np?.CargoDescriptionString, s?.description));
  push(parcel, "Об'єднана посилка", s?.orders?.length ? s.orders.map(n => `#${n}`).join(' + ') : null);
  if (carrier !== 'np' && !s) notes.push('Вагу й габарити перевізник Rozetka за номером не віддає — вони видні лише для накладних, створених в адмінці після 21.10.2026.');

  // ── Статус і дати ──────────────────────────────────────────────────────────
  const st: TtnRow[] = [];
  push(st, 'Статус', first(np?.Status, history.at(-1)?.status_name, o.carrier_status_text), { accent: true });
  push(st, 'Створено', dt(first(np?.DateCreated, rz?.created_at, s?.created_at)), { hint: s?.created_by ?? undefined });
  push(st, 'Прийнято перевізником', dt(o.carrier_accepted_at));
  push(st, 'Очікувана доставка', dt(first(np?.ScheduledDeliveryDate, s?.result?.delivery_date)));
  push(st, 'Вручено', dt(first(np?.RecipientDateTime, np?.ActualDeliveryDate, o.carrier_delivered_at)));

  const sections = [
    { title: 'Гроші', rows: money },
    { title: 'Отримувач', rows: rcp },
    { title: 'Відправник', rows: snd },
    { title: 'Посилка', rows: parcel },
    { title: 'Статус', rows: st },
  ].filter(x => x.rows.length);

  return {
    carrierLabel: CARRIER_LABEL[carrier],
    ttn: input.ttn,
    sections,
    history: [...history].reverse().map(h => ({ ...h, date: fmtDate(h.date) ?? h.date })),
    notes,
  };
}
