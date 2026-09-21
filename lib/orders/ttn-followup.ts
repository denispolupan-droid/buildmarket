/**
 * Що робити із замовленням, коли в нього з'явилась ТТН.
 *
 * Момент появи ТТН і момент підтвердження — незалежні: накладну часто виписують
 * ще до підтвердження. Тоді відвантажити нічого (у «нового» замовлення немає ні
 * резервів, ні замовлення постачальнику), і дію треба повторити вже після
 * підтвердження — інакше замовлення залишається в «Підтверджено» з готовою ТТН,
 * хоча за суттю воно вже «До відправки».
 *
 * Чиста функція: рішення приймається лише за станом замовлення, тож його видно
 * в тестах, а не тільки в браузері.
 */

/** Статуси, з яких роут відгрузки взагалі приймає замовлення. */
export const SHIPPABLE_STATUSES = ['confirmed', 'picking', 'awaiting_stock'];

export type TtnFollowUpOrder = {
  status: string;
  fulfillment_mode: string | null;
  channel_code: string | null;
  delivery_type: string;
};

export type TtnFollowUpAction = 'ship' | 'push-rozetka' | 'push-prom' | 'push-epicentr' | 'none';

/**
 * Звідки взявся номер: виписали через API перевізника чи вписали руками.
 * Різниця лише для точок видачі Rozetka — див. нижче.
 */
export type TtnSource = 'api' | 'manual';

export function ttnFollowUpAction(o: TtnFollowUpOrder, source: TtnSource = 'api'): TtnFollowUpAction {
  // Дропшип: відвантаження сам створює видаткову і доносить номер у маркетплейс.
  if (o.fulfillment_mode === 'supplier' && SHIPPABLE_STATUSES.includes(o.status)) return 'ship';

  // Точки видачі Rozetka: накладну там виписує сама Rozetka своїм API, тож свій
  // же номер їй назад не потрібен. Виняток — номер, вписаний руками: так роблять
  // для спільної посилки, коли ЕН виписана з СУСІДНЬОГО замовлення (Seller API
  // вміє лише одне замовлення на накладну). Про такий номер кабінет не знає, і
  // без пушу замовлення висить в «Обробляється менеджером».
  if (o.channel_code === 'rozetka' && o.status !== 'new'
      && (o.delivery_type !== 'rozetka_delivery' || source === 'manual')) {
    return 'push-rozetka';
  }

  if (o.channel_code === 'prom' && o.status !== 'new') return 'push-prom';

  if (o.channel_code === 'epicentr' && o.status !== 'new') return 'push-epicentr';

  return 'none';
}
