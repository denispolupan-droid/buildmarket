/**
 * lib/rozetka-delivery-ttn.ts — накладні для доставки в точки видачі Rozetka
 * (розділ Octopus в апідоку). Серверний модуль: ходить у мережу.
 *
 * Чому відправника беремо з останньої створеної накладної, а не з налаштувань:
 * GET /delivery-rozetka/settings віддає sender: null — преднастройка в кабінеті
 * не заповнена, і змусити її заповнити ми не можемо. Зате в кожній уже
 * створеній ТТН лежить повний блок відправника — рівно той, який продавець
 * обрав руками. Беремо найсвіжіший: це завжди «як минулого разу», без окремого
 * екрана налаштувань, який довелося б синхронізувати з кабінетом.
 *
 * Перевизначити можна через app_settings.rozetka_delivery_sender — якщо колись
 * знадобиться відправляти не з того відділення.
 */
import { createServiceClient } from './supabase';
import { rozetkaFetch } from './rozetka-api';

export const ROZETKA_SENDER_KEY = 'rozetka_delivery_sender';

export type RozetkaSender = {
  type: string;              // 'natural' | 'legal'
  name: string;
  city: string;              // uuid населеного пункту
  address: string;
  department: string;        // uuid відділення відправлення
  department_type?: number;
  phones: string[];
  info?: string;
};

export type RozetkaDeliveryTtn = {
  id: number;
  ttn: string;
  order_id: number;
  created_at: string;
  /** Скільки Rozetka візьме за це відправлення, грн з ПДВ. Джерело правди. */
  delivery_price: string | null;
  cod_amount: number | null;
  declared_price: number | null;
  free_delivery: boolean;
  is_carrier_meest: boolean;
  sender?: RozetkaSender;
};

export async function getRozetkaDeliveryTtns(perPage = 100): Promise<RozetkaDeliveryTtn[]> {
  const data = await rozetkaFetch<{ models: RozetkaDeliveryTtn[] }>(
    `/delivery-rozetka/ttn-list?page=1&per_page=${perPage}`,
  );
  return data.models ?? [];
}

/** Відправник: явне налаштування, інакше — з останньої створеної накладної. */
export async function getRozetkaSender(): Promise<RozetkaSender | null> {
  const db = createServiceClient();
  const { data } = await db.from('app_settings').select('value').eq('key', ROZETKA_SENDER_KEY).maybeSingle();
  if (data?.value) {
    try { return JSON.parse(data.value as string) as RozetkaSender; } catch { /* впаде на список нижче */ }
  }
  const ttns = await getRozetkaDeliveryTtns(20);
  // ttn-list віддає найсвіжіші першими; беремо перший із заповненим відправником
  const withSender = ttns.find(t => t.sender?.department && t.sender?.city);
  if (!withSender?.sender) return null;
  const s = withSender.sender;
  return {
    type: s.type ?? 'natural',
    name: s.name,
    city: s.city,
    address: s.address,
    department: s.department,
    department_type: s.department_type,
    phones: s.phones ?? [],
  };
}

/**
 * Варіанти відправника для вибору в адмінці: всі РІЗНІ відділення з останніх
 * накладних кабінету. Інших довідників немає: settings віддає sender:null, а
 * окремого списку «мої відділення відправки» в API Rozetka не існує. Тож нове
 * відділення з'являється у виборі після першої накладної з нього в кабінеті.
 */
export async function getRozetkaSenderOptions(): Promise<RozetkaSender[]> {
  const ttns = await getRozetkaDeliveryTtns(100);
  const byDep = new Map<string, RozetkaSender>();
  for (const t of ttns) {
    const s = t.sender;
    if (!s?.department || !s?.city || byDep.has(s.department)) continue;
    byDep.set(s.department, {
      type: s.type ?? 'natural',
      name: s.name,
      city: s.city,
      address: s.address,
      department: s.department,
      department_type: s.department_type,
      phones: s.phones ?? [],
    });
  }
  return [...byDep.values()];
}

/** Зберегти обраного відправника — далі всі накладні йдуть від нього. */
export async function saveRozetkaSender(sender: RozetkaSender): Promise<void> {
  const db = createServiceClient();
  await db.from('app_settings').upsert({ key: ROZETKA_SENDER_KEY, value: JSON.stringify(sender) });
}

export type CreateTtnParams = {
  weight: number;   // кг
  length: number;   // см
  width: number;
  height: number;
};

/**
 * Створення накладної із замовлення.
 *
 * has_paid/cost керують поверненням коштів: для накладеного платежу передаємо
 * has_paid=false і суму до стягнення, для передоплаченого — has_paid=true і 0.
 * Якщо не передати — Rozetka візьме з самого замовлення, але тоді ми не
 * контролюємо, що саме вона візьме, тож передаємо явно.
 */
export async function createRozetkaDeliveryTtn(opts: {
  orderId: number;
  sender: RozetkaSender;
  params: CreateTtnParams;
  places?: number;
  description?: string;
  hasPaid: boolean;
  codAmount: number;
}): Promise<RozetkaDeliveryTtn> {
  const { weight, length, width, height } = opts.params;
  const body = {
    order_id: opts.orderId,
    payer: 'sender',            // організацію видачі оплачує продавець — це умови Rozetka
    places: opts.places ?? 1,
    params: {
      weight, length, width, height,
      // об'єм у м³ — Rozetka чекає його окремим полем разом із габаритами
      volume: Number(((length * width * height) / 1_000_000).toFixed(6)),
    },
    sender: opts.sender,
    ...(opts.description ? { description: opts.description.slice(0, 100) } : {}),
    has_paid: opts.hasPaid,
    cost: opts.hasPaid ? 0 : opts.codAmount,
    carrier: 1,                 // 1 — ROZETKA Delivery, 4 — Meest
  };
  return rozetkaFetch<RozetkaDeliveryTtn>('/delivery-rozetka/create-order-ttn', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
