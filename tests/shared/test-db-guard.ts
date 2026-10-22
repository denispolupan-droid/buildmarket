/**
 * Запобіжник: тести, які пишуть у базу, ніколи не ходять у прод.
 *
 * 21.10.2026 інтеграційні тести обліку запустили в свіжому git worktree, куди
 * скопіювали лише .env.local (прод) — .env.test у гіт не йде. setup.ts
 * мовчки взяв .env.local як запасний варіант, і тести створили в бойовій базі
 * 31 замовлення, 55 документів і 158 проводок (банк −6 622, склад реального
 * товару, рахунок реального покупця). Тепер такий прогін падає одразу.
 */
const PROD_REFS = ['boaztnparrdoeknajprn'];

export function assertTestDatabase(url = process.env.NEXT_PUBLIC_SUPABASE_URL): void {
  if (url && PROD_REFS.some(ref => url.includes(ref))) {
    throw new Error(
      'Тести спрямовані на БОЙОВУ базу Supabase — зупинено. Потрібен .env.test з тестовим проєктом ' +
      '(у новому worktree скопіюй його поруч із .env.local).',
    );
  }
}
