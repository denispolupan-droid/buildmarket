/**
 * Порівняння складу замовлення з тим, що в кабінеті Rozetka.
 *
 * Окремий модуль без мережі й клієнтів БД: rozetka-sync створює Supabase-клієнт
 * на рівні модуля, тож імпорт його в тест вимагав би повного набору env. Ці дві
 * функції — чиста логіка, і саме вона тут найризикованіша: хибна «різниця»
 * означала б вічний алерт і переприсвоєння складу на кожному прогоні крону.
 */

export type OrderItem = { sku: string; qty: number; price: number };

/** Склад як мапа sku → позиція: порядок у кабінеті не стабільний. */
function bySku(items: OrderItem[]): Map<string, OrderItem> {
  return new Map((items ?? []).filter(i => i?.sku).map(i => [i.sku, i]));
}

/**
 * Чи розійшовся склад із кабінетом. Ціни звіряємо з копійковою точністю:
 * Rozetka віддає їх то числом, то рядком, і пряме !== давало б різницю на
 * кожному прогоні.
 */
export function itemsDiffer(ours: OrderItem[], live: OrderItem[]): boolean {
  const a = bySku(ours), b = bySku(live);
  if (a.size !== b.size) return true;
  for (const [sku, i] of a) {
    const j = b.get(sku);
    if (!j) return true;
    if (Number(i.qty) !== Number(j.qty)) return true;
    if (Math.round(Number(i.price) * 100) !== Math.round(Number(j.price) * 100)) return true;
  }
  return false;
}

/** Людський опис різниці — його бачить менеджер у мітці й в алерті. */
export function describeItemsDiff(ours: OrderItem[], live: OrderItem[]): string {
  const a = bySku(ours), b = bySku(live);
  const parts: string[] = [];
  for (const [sku, j] of b) {
    const i = a.get(sku);
    if (!i) { parts.push(`додано ${sku} ×${j.qty}`); continue; }
    if (Number(i.qty) !== Number(j.qty)) parts.push(`${sku}: ${i.qty} → ${j.qty} шт`);
    else if (Math.round(Number(i.price) * 100) !== Math.round(Number(j.price) * 100)) parts.push(`${sku}: ${i.price} → ${j.price} грн`);
  }
  for (const sku of a.keys()) if (!b.has(sku)) parts.push(`прибрано ${sku}`);
  const sum = (x: OrderItem[]) => (x ?? []).reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
  parts.push(`сума ${Math.round(sum(ours))} → ${Math.round(sum(live))} грн`);
  return parts.join('; ');
}
