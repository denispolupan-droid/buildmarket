/**
 * lib/prom-delivery-fee.ts — «Дешева доставка» Новою Поштою на Prom (ЧИСТІ функції,
 * без серверних імпортів — можна тягнути і в клієнтські компоненти).
 *
 * Для продавця це «компенсація частини вартості послуги з організації перевезення
 * відправлень НП»: фіксований збір, який Prom списує з Балансу ПІСЛЯ отримання
 * посилки покупцем (невикуп/скасування — не списується; повернення протягом 14 днів
 * збір НЕ повертає). Офіційний тариф (з ПДВ): замовлення 200–699,99 грн → 10 грн;
 * від 700 грн → 30 грн. Звірено з живою випискою кабінету 2026-07-29: 208→10,
 * 456→10, 1713→30.
 *
 * Тариф редагується в адмінці (Prom → Комісії → «Дешева доставка») і зберігається
 * в app_settings під ключем prom_delivery_fee_tariff; діє з моменту збереження —
 * лише для нових доставок, проведені списання не перераховуються. Серверне читання
 * налаштування — lib/prom-delivery.ts (getPromDeliveryTariff).
 *
 * Ознака, що замовлення підпадає під акцію, — блок ps_promotion у payload
 * замовлення Prom (name «Дешевая доставка» / «Дешева доставка»). Проводка —
 * в applyCompletionEffects при доставці.
 */

export type PromDeliveryBracket = {
  from: number;  // збір діє від цієї суми замовлення (включно)
  fee: number;   // грн з ПДВ
};

export const PROM_DELIVERY_TARIFF_KEY = 'prom_delivery_fee_tariff';

// Пороги за офіційними умовами акції; впорядковані за зростанням from.
export const DEFAULT_PROM_DELIVERY_TARIFF: PromDeliveryBracket[] = [
  { from: 200, fee: 10 },
  { from: 700, fee: 30 },
];

/** Збір за замовлення; 0 — якщо сума нижча за мінімальний поріг акції. */
export function computePromDeliveryFee(orderTotal: number, brackets: PromDeliveryBracket[] = DEFAULT_PROM_DELIVERY_TARIFF): number {
  let fee = 0;
  for (const b of brackets) {
    if (orderTotal >= b.from) fee = b.fee;
  }
  return fee;
}

/**
 * Чи оформлене замовлення за акцією з платною для продавця доставкою.
 * Назва акції у Prom плаває: «Дешевая доставка», з 09.2026 — «Бесплатная
 * доставка Rozetka» (доставка в магазини Rozetka, той самий тариф 10/30 грн,
 * живий кейс №26091055). Тому головна ознака — УМОВИ акції, де прямо написано,
 * що платить продавець; назва з «дешев» лишається запасним розпізнаванням.
 */
export function isPromCheapDelivery(promData: Record<string, unknown> | null | undefined): boolean {
  const promo = promData?.ps_promotion as { name?: unknown; conditions?: unknown } | null | undefined;
  if (!promo) return false;
  if (Array.isArray(promo.conditions) &&
      promo.conditions.some(c => typeof c === 'string' && /продав/i.test(c) && /грн|₴/i.test(c))) return true;
  return typeof promo.name === 'string' && /дешев/i.test(promo.name);
}

/** Розбір значення з app_settings; на будь-якій невалідності — дефолтний тариф. */
export function parsePromDeliveryTariff(raw: string | null | undefined): PromDeliveryBracket[] {
  if (!raw) return DEFAULT_PROM_DELIVERY_TARIFF;
  try {
    const parsed = JSON.parse(raw) as { brackets?: unknown };
    const list = Array.isArray(parsed.brackets) ? parsed.brackets : null;
    if (!list || list.length === 0) return DEFAULT_PROM_DELIVERY_TARIFF;
    const brackets: PromDeliveryBracket[] = list.map((b) => {
      const o = b as { from?: unknown; fee?: unknown };
      const from = Number(o.from);
      const fee = Number(o.fee);
      if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(fee) || fee < 0) {
        throw new Error('invalid bracket');
      }
      return { from, fee };
    });
    for (let i = 1; i < brackets.length; i++) {
      if (brackets[i].from <= brackets[i - 1].from) return DEFAULT_PROM_DELIVERY_TARIFF;
    }
    return brackets;
  } catch {
    return DEFAULT_PROM_DELIVERY_TARIFF;
  }
}
