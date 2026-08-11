/**
 * Вага замовлення за текстовим полем products.volume («5 кг», «10 л», «750 мл»).
 *
 * Окремих колонок ваги/габаритів у каталозі немає — постачальники дають фасування
 * рядком, і це єдине, з чого вагу взагалі можна вивести. Модуль чистий (без БД і
 * мережі), бо потрібен у трьох місцях: калькулятор ваги в адмінці, підбір точок
 * видачі Rozetka під ліміт відділення і серверна перевірка при оформленні.
 *
 * Рідини рахуємо як 1 л ≈ 1 кг — для будхімії похибка в межах кількох відсотків,
 * а перевізник усе одно зважує сам.
 */

/** Вага однієї одиниці, кг. Нерозпізнане фасування — 0, а не викид: замовлення
 *  важливіше за точність, недооцінку ловить ліміт відділення з запасом. */
export function parseWeightKg(volume: string | null | undefined): number {
  if (!volume) return 0;
  // Нормалізація: кома → крапка, схлопнуті пробіли, «5 кг» → «5кг»
  const v = volume.trim().replace(',', '.').replace(/\s+/g, ' ').replace(/(\d)\s+(кг|г|л|мл)/i, '$1$2');
  const m = v.match(/^([\d.]+)\s*(кг|г|л|мл|kg|g|l|ml)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'кг' || u === 'kg') return n;
  if (u === 'г'  || u === 'g')  return n / 1000;
  if (u === 'л'  || u === 'l')  return n;        // 1 л ≈ 1 кг
  if (u === 'мл' || u === 'ml') return n / 1000;
  return 0;
}

export type WeighableItem = { volume?: string | null; qty?: number | null };

/** Сумарна вага позицій, кг. */
export function cartWeightKg(items: WeighableItem[]): number {
  const total = items.reduce((sum, i) => sum + parseWeightKg(i.volume) * (i.qty ?? 1), 0);
  return parseFloat(total.toFixed(3));
}

/** Скільки позицій не вдалося зважити — рядок «вага невідома» в UI чесніший за нуль. */
export function unweighedCount(items: WeighableItem[]): number {
  return items.filter(i => parseWeightKg(i.volume) === 0).length;
}
