// Після деплою коду з lib/secrets (міграція 150): прибрати відкриті значення
// секретів з app_settings — вони вже у Vault, і читає їх звідти лише новий код.
// Перед видаленням звіряє, що у Vault є значення для кожного ключа.
//   npx tsx --env-file=.env.local scripts/purge-app-settings-secrets.ts [--dry]
import { createServiceClient } from '../lib/supabase';
import { SECRET_KEYS, getSecret } from '../lib/secrets';

async function main() {
  const dry = process.argv.includes('--dry');
  const db = createServiceClient();
  const { data: rows } = await db.from('app_settings').select('key, value').in('key', [...SECRET_KEYS]);
  let removed = 0;
  for (const r of rows ?? []) {
    const v = (r.value ?? '').trim();
    if (!v) { console.log(`${r.key}: порожнє в app_settings — видаляю рядок`); }
    else {
      const inVault = await getSecret(db, r.key);
      if (inVault !== v) { console.log(`${r.key}: у Vault інше/порожнє значення — НЕ чіпаю (звірити руками)`); continue; }
    }
    if (!dry) { const { error } = await db.from('app_settings').delete().eq('key', r.key); if (error) { console.log(`${r.key}: помилка ${error.message}`); continue; } }
    removed++;
    console.log(`${r.key}: ${dry ? 'видалив би' : 'видалено'} з app_settings`);
  }
  console.log(dry ? `dry-run: ${removed} рядків` : `готово: ${removed} рядків прибрано з app_settings`);
}
main().catch(e => { console.error(e); process.exit(1); });
