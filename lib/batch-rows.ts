/**
 * Розбиває рядки для пакетного upsert на групи з однаковим набором колонок.
 * PostgREST у пакеті бере об'єднання ключів усіх рядків, і поле, якого в рядку
 * немає, записується як NULL — а рядок без price_cost (захищена собівартість)
 * означає «не чіпати», а не «стерти». Тому кожна група — окремий запит.
 */
export function groupByColumnSet<T extends Record<string, unknown>>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = Object.keys(r).sort().join(',');
    const g = groups.get(key);
    if (g) g.push(r); else groups.set(key, [r]);
  }
  return [...groups.values()];
}
