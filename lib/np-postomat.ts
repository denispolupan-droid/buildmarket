/**
 * Чи це поштомат — за текстом адреси доставки.
 *
 * Rozetka віддає тип доставки структурно, Prom — ні: у нього поштомат
 * приїжджає як звичайний «warehouse», а слово «Поштомат» лишається тільки в
 * людському рядку адреси. Через це модалка ТТН відкривалася на вкладці
 * «Відділення», поштомат у списку не підставлявся — і накладну виписували на
 * відділення, куди покупець не замовляв (живий випадок: замовлення 26081049,
 * Поштомат №8771 у Києві).
 *
 * Тримається окремо, бо потрібна двом сторонам: імпорту замовлень (щоб тип
 * зберігся правильним) і модалці (щоб старі замовлення в базі теж відкривались
 * як треба, без переімпорту).
 */
const POSTOMAT_RE = /поштомат|почтомат|postomat/i;

export function isPostomatText(text: string | null | undefined): boolean {
  return POSTOMAT_RE.test(String(text ?? ''));
}

/**
 * Підтип доставки з урахуванням тексту адреси: явний 'postomat' поважаємо, а
 * «склад» перевіряємо — саме він і бреше. Адресну доставку не чіпаємо: там
 * слово «поштомат» у рядку означало б орієнтир, а не спосіб видачі.
 */
export function resolveDeliverySubtype(
  subtype: string | null | undefined,
  address: string | null | undefined,
): string | null | undefined {
  if (subtype === 'postomat') return 'postomat';
  if (subtype === 'warehouse' || subtype == null) {
    return isPostomatText(address) ? 'postomat' : subtype;
  }
  return subtype;
}
