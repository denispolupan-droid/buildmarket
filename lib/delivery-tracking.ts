/**
 * lib/delivery-tracking.ts — дрібні чисті хелпери відстеження посилок.
 *
 * Одна накладна може обслуговувати кілька замовлень: клієнт зробив два замовлення,
 * а ми відправили їх однією посилкою. Перевізник знає лише номер, тож його відповідь
 * треба розкласти на ВСІ замовлення з цим номером — інакше «щасливчиком» стає одне
 * випадкове, а друге назавжди лишається невідстеженим і непроведеним.
 */

/** Замовлення за номером накладної. Порядок усередині групи — як у вхідному списку. */
export function groupByTracking<T extends { tracking_number: string | null }>(
  orders: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const o of orders) {
    if (!o.tracking_number) continue;
    const key = String(o.tracking_number);
    const cur = map.get(key);
    if (cur) cur.push(o); else map.set(key, [o]);
  }
  return map;
}
