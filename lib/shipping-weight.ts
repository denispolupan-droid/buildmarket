/**
 * Вага посилки для фіду Merchant Center (g:shipping_weight).
 *
 * Навіщо: правило доставки «Нова Пошта» в Merchant Center рахує вартість за
 * вагою (до 2 кг — одна ставка, важче — інша; налаштовано власником 19.10.2026).
 * Без ваги у фіді Google не може вибрати рядок таблиці й ставить «Вартість
 * доставки: неповна інформація», а картки показуються без ціни доставки.
 *
 * Вагу беремо з фасовки (products.volume): кг і г — точно, л і мл — через
 * щільність родини товару, плюс тара. Похибка в сотні грамів не важить: ступенів
 * усього два, межа 2 кг. Товар без маси/об'єму (інструмент, кріплення, стрічки
 * в метрах) отримує DEFAULT_KG — це легкі товари, і вони чесно потрапляють у
 * першу ступінь.
 */

export const DEFAULT_KG = 0.5;

/** Щільність, кг/л, за кореневою родиною категорії; решта рідин — DENSITY_DEFAULT. */
const DENSITY_BY_ROOT: Record<string, number> = {
  'montazhna-pina': 1.3, // аерозольний балон: піна + газ + метал
  farby: 1.3,            // водоемульсійні й алкідні фарби, лаки, колоранти
  gruntivky: 1.1,
  plastyfikatory: 1.1,
};
/** Розчинники легші за воду — їх знаходимо за власною категорією, не коренем. */
const DENSITY_BY_SLUG: Record<string, number> = { rozchynnyky: 0.85, ochysnyky: 0.9 };
const DENSITY_DEFAULT = 1.1;

/** Тара: банка/відро/картридж — частка від маси вмісту плюс мінімум. */
const PACKAGING_SHARE = 0.08;
const PACKAGING_MIN_KG = 0.05;

/** «0,75 л», «2.2 кг», «400 г», «850 мл» → { value, unit }; інше → null. */
export function parseVolume(volume: string | null | undefined): { value: number; unit: 'кг' | 'г' | 'л' | 'мл' } | null {
  if (!volume) return null;
  const m = volume.trim().match(/^(\d+(?:[.,]\d+)?)\s*(кг|г|мл|л)(?!\p{L})/iu);
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, unit: m[2].toLowerCase() as 'кг' | 'г' | 'л' | 'мл' };
}

/** Вага посилки в кг з тарою, округлена до 0,01; товар без фасовки — DEFAULT_KG. */
export function shippingWeightKg(volume: string | null | undefined, categorySlug: string | null, rootSlug: string | null): number {
  const v = parseVolume(volume);
  if (!v) return DEFAULT_KG;
  let net: number;
  if (v.unit === 'кг') net = v.value;
  else if (v.unit === 'г') net = v.value / 1000;
  else {
    const litres = v.unit === 'л' ? v.value : v.value / 1000;
    const density: number = (categorySlug ? DENSITY_BY_SLUG[categorySlug] : undefined)
      ?? (rootSlug ? DENSITY_BY_ROOT[rootSlug] : undefined)
      ?? DENSITY_DEFAULT;
    net = litres * density;
  }
  const gross = net + Math.max(net * PACKAGING_SHARE, PACKAGING_MIN_KG);
  return Math.round(gross * 100) / 100;
}
