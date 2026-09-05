/**
 * Дебітор продажу — «хто нам винен гроші за це замовлення» (Варіант B, 2026-09-05).
 *
 * Сторона визначається КАНАЛОМ ГРОШЕЙ, а не наявністю картки клієнта:
 *   • наложений платіж через Нову Пошту   → np:cod      (НоваПей збирає і виплачує)
 *   • наложений платіж через Rozetka Доставка → mp:rozetka (Rozetka збирає і виплачує)
 *   • передоплата на маркетплейсі (Пром-оплата, Rozetka Pay) → mp:prom / mp:rozetka
 *   • дропшип-партнер                     → сам партнер (customer_id), його COD
 *                                            нараховується окремо (credit_cod_to_partner)
 *   • все, що покупець платить нам напряму (картка на сайті, безнал, готівка,
 *     відстрочка) → customer_id, без картки → guest
 *
 * Чому так: продаж і його погашення мають лягати на ОДНУ сторону. До 09.2026
 * продаж ішов на клієнта, а збір COD — на np:cod; 194 клієнти «заборгували»
 * 152 тис., np:cod пішов у −96 тис. (розбір у пам'яті debtors-audit-2026-09-05).
 *
 * Правило «оплата йде за продажем»: якщо по замовленню вже є проводка продажу,
 * оплати/повернення/сторно лягають на ту саму сторону — навіть якщо спосіб
 * оплати змінили після відгрузки (див. resolveSaleDebitParty у documents.ts).
 */

export const SALE_DEBTOR = {
  npCod:   'np:cod',
  prom:    'mp:prom',
  rozetka: 'mp:rozetka',
  guest:   'guest',
  /**
   * Кліринг виплат RozetkaPay. Усі гроші площадок (Rozetka Pay, наложка через
   * Rozetka Доставка, Пром-оплата) приходять на банк від ТОВ «РОЗЕТКА ПЕЙ» одним
   * переказом за день без розбивки по замовленнях. Без Reports API розкласти їх
   * на mp:prom / mp:rozetka не можна, тож виплата лягає сюди (баланс від'ємний =
   * отримано, ще не рознесено), а рознесення по замовленнях робить окремий крок,
   * коли є реєстр. Сума «до виплати» = mp:prom + mp:rozetka + mp:rozetkapay.
   */
  rozetkapay: 'mp:rozetkapay',
} as const;

export type SpecialDebtor = (typeof SALE_DEBTOR)[keyof typeof SALE_DEBTOR];

/** Людські назви службових дебіторів для екранів боргів. */
export const SPECIAL_DEBTOR_LABEL: Record<SpecialDebtor, string> = {
  'np:cod':        'Нова Пошта — наложені платежі',
  'mp:prom':       'Prom.ua — до виплати',
  'mp:rozetka':    'Rozetka — до виплати',
  'mp:rozetkapay': 'RozetkaPay — отримано, не рознесено',
  'guest':         'Гість (без картки клієнта)',
};

export function isSpecialDebtor(party: string | null | undefined): party is SpecialDebtor {
  return !!party && Object.prototype.hasOwnProperty.call(SPECIAL_DEBTOR_LABEL, party);
}

export type SalePartyOrder = {
  customer_id?:   string | null;
  channel_code?:  string | null;
  payment_type?:  string | null;
  delivery_type?: string | null;
};

/** Доставка силами Rozetka: наложку збирає Rozetka, а не НоваПей. */
export function isRozetkaCarrier(deliveryType: string | null | undefined): boolean {
  return deliveryType === 'rozetka_delivery' || deliveryType === 'rz_delivery';
}

/** Чиста функція: сторона дебіторки за полями замовлення. */
export function saleDebitPartyFor(order: SalePartyOrder): string {
  const direct = order.customer_id || SALE_DEBTOR.guest;

  // Дропшип-партнер отримує рахунок від нас; його наложка — окремий механізм.
  if (order.channel_code === 'dropship') return direct;

  if (order.payment_type === 'cod') {
    return isRozetkaCarrier(order.delivery_type) ? SALE_DEBTOR.rozetka : SALE_DEBTOR.npCod;
  }

  // Передоплата на площадці: гроші тримає маркетплейс і виплачує пакетом.
  if (order.payment_type === 'prepaid') {
    if (order.channel_code === 'prom')    return SALE_DEBTOR.prom;
    if (order.channel_code === 'rozetka') return SALE_DEBTOR.rozetka;
  }

  // Картка на сайті, безнал за рахунком (у т.ч. для замовлень з Rozetka), готівка,
  // відстрочка — покупець платить нам напряму.
  return direct;
}
