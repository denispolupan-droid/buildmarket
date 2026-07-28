/**
 * lib/rozetka-smart-tariff.ts — ЧИСТА частина тарифу Rozetka Smart (без серверних
 * імпортів — можна використовувати і в клієнтських компонентах, і у фіді).
 * Серверне читання налаштування — lib/rozetka-smart.ts (getSmartTariff).
 */

export type SmartBracket = {
  upTo: number | null; // збір діє, поки сума замовлення < upTo; null = без верхньої межі
  fee: number;         // грн з ПДВ
};

export const SMART_TARIFF_KEY = 'rozetka_smart_tariff';

// Тариф Rozetka станом на 2026-07 (з ПДВ): до 399 грн — 12; 400–699 — 18; від 700 — 30.
export const DEFAULT_SMART_TARIFF: SmartBracket[] = [
  { upTo: 400, fee: 12 },
  { upTo: 700, fee: 18 },
  { upTo: null, fee: 30 },
];

/** Збір за замовлення. Кошики впорядковані за upTo; останній — з upTo=null. */
export function computeSmartFee(orderTotal: number, brackets: SmartBracket[] = DEFAULT_SMART_TARIFF): number {
  for (const b of brackets) {
    if (b.upTo === null || orderTotal < b.upTo) return b.fee;
  }
  return 0;
}

/** Розбір значення з app_settings; на будь-якій невалідності — дефолтний тариф. */
export function parseSmartTariff(raw: string | null | undefined): SmartBracket[] {
  if (!raw) return DEFAULT_SMART_TARIFF;
  try {
    const parsed = JSON.parse(raw) as { brackets?: unknown };
    const list = Array.isArray(parsed.brackets) ? parsed.brackets : null;
    if (!list || list.length === 0) return DEFAULT_SMART_TARIFF;
    const brackets: SmartBracket[] = list.map((b) => {
      const o = b as { upTo?: unknown; fee?: unknown };
      const upTo = o.upTo === null ? null : Number(o.upTo);
      const fee = Number(o.fee);
      if ((upTo !== null && (!Number.isFinite(upTo) || upTo <= 0)) || !Number.isFinite(fee) || fee < 0) {
        throw new Error('invalid bracket');
      }
      return { upTo, fee };
    });
    // останній кошик мусить покривати «і вище», проміжні — зростати
    if (brackets[brackets.length - 1].upTo !== null) return DEFAULT_SMART_TARIFF;
    for (let i = 1; i < brackets.length; i++) {
      const prev = brackets[i - 1].upTo, cur = brackets[i].upTo;
      if (prev === null || (cur !== null && cur <= prev)) return DEFAULT_SMART_TARIFF;
    }
    return brackets;
  } catch {
    return DEFAULT_SMART_TARIFF;
  }
}
