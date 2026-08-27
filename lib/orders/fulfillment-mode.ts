// Режим виконання замовлення за фактичними джерелами позицій.
// Окремим модулем — щоб покрити тестом, не тягнучи роутер виконання (а з ним
// клієнт Supabase і валідацію env).

export type ItemSource = 'own' | 'dropship';

export function modeFromSources(sources: Map<string, ItemSource>): 'own' | 'supplier' | 'mixed' {
  const vals = [...sources.values()];
  const hasOwn  = vals.includes('own');
  const hasDrop = vals.includes('dropship');
  return hasOwn && hasDrop ? 'mixed' : hasOwn ? 'own' : 'supplier';
}
