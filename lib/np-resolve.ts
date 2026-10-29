/**
 * Підбір відділення Нової Пошти за людським текстом адреси.
 *
 * Навіщо. Замовлення з маркетплейсів (Rozetka, Prom) приходять без Ref НП:
 * лише назва міста і рядок на кшталт «Відділення №4, вул. Євгена Чикаленка, 86»
 * (ref_id Rozetka — її внутрішній, getWarehouses по ньому нічого не віддає —
 * перевірено наживо). Тому і модалка ТТН, і форма нового замовлення (копія
 * такого замовлення) мусять знайти місто пошуком за назвою, а відділення —
 * за номером чи описом у тексті. Логіка чиста й спільна, щоб обидва місця
 * підбирали однаково і це можна було покрити тестами.
 */

import { isPostomatText } from './np-postomat';

export type NpWarehouseLike = { Ref: string; Description: string; Number: string };

/** Номер відділення/поштомату з тексту адреси: «Відділення №4, …» → '4'. */
export function warehouseNumberFromAddress(address: string | null | undefined): string | null {
  const m = String(address ?? '').match(/№\s*(\d+)/);
  return m ? m[1] : null;
}

/**
 * Яке відділення зі списку міста відповідає тексту адреси.
 *  1. Є «№N» у тексті — шукаємо за номером; не знайшли — null (вгадувати не
 *     можна: накладна поїде не туди).
 *  2. Номера немає (села: «Пункт приймання-видачі (до 30 кг): вул. Шкільна, 1-А»):
 *     єдиний пункт потрібного типу — він; кілька — той, чий опис НП дослівно
 *     (без пробілів) входить у текст адреси, і лише якщо такий один.
 */
export function pickWarehouseByAddress<W extends NpWarehouseLike>(
  list: W[],
  address: string | null | undefined,
  isPostomat: boolean,
): W | null {
  const num = warehouseNumberFromAddress(address);
  if (num) return list.find(w => w.Number === num) ?? null;

  const candidates = isPostomat
    ? list.filter(w => isPostomatText(w.Description))
    : list.filter(w => !isPostomatText(w.Description));
  if (candidates.length === 1) return candidates[0];

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const addr = norm(address ?? '');
  if (!addr) return null;
  const byDesc = candidates.filter(w => addr.includes(norm(w.Description)));
  return byDesc.length === 1 ? byDesc[0] : null;
}

export type FormNovaSubtype = 'warehouse' | 'postomat' | 'courier';

/**
 * Підтип з БД → вкладка форми. У БД адресна доставка лежить як 'address'
 * (Prom/Rozetka), 'doors' або 'courier'; поштомат у Prom ховається в тексті
 * адреси (див. lib/np-postomat). Усе інше — відділення.
 */
export function formNovaSubtype(
  subtype: string | null | undefined,
  address: string | null | undefined,
): FormNovaSubtype {
  if (subtype === 'courier' || subtype === 'address' || subtype === 'doors') return 'courier';
  if (subtype === 'postomat' || (subtype == null || subtype === 'warehouse') && isPostomatText(address)) return 'postomat';
  return 'warehouse';
}
