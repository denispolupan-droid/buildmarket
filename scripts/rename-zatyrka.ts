/**
 * «Замазка» → «Затирка»: перейменування товарів і категорій швів.
 *
 * Навіщо. Люди шукають «затирка» і «фуга»: із 41 запиту на цю тему за півроку
 * лише два містили слово «замазка». Наша ж вітрина називалась саме «замазкою» —
 * і сторінка категорії не ранжувалась узагалі, тоді як російська версія (де
 * name_ru вже «Затирка») стоїть за «цементные затирки» на 29-му місці.
 * Наша ж база знає правильне слово: розділ Prom — «затирка для швів», категорія
 * Rozetka — «Затиральні суміші (Фуга)», опис категорії — «Цементні затирки».
 *
 * Що НЕ чіпаємо і чому:
 *   slug     — адреси лишаються, інакше втратимо накопичені сигнали й доведеться
 *              робити редіректи (код і так генерує slug лише коли він порожній);
 *   name_ru  — там уже «Затирка для швов», російська частина зроблена;
 *   keywords — синоніми там уже є (і «затирка», і «замазка»);
 *   orders   — назви в замовленнях це знімок на момент продажу, історію не
 *              переписуємо: рахунки й накладні рендеряться саме з нього.
 *
 * Куди зміна поїде далі: фіди Prom (promName) і Rozetka (formatForRozetka)
 * беруть українське products.name. Зіставлення на площадках — за артикулом, тож
 * оновляться наявні картки, дублів не буде. Перевірено на всіх 58: структура
 * назви для Rozetka зберігається, різниця рівно в одному слові.
 *
 * ОБЕРЕЖНО з регулярками: /^Замазка\b/ НЕ працює з кирилицею — межу слова \b
 * визначає за ASCII, і між «а» та пробілом її немає. Тому (?=\s).
 *
 * Використання:
 *   npx tsx --env-file=.env.local scripts/rename-zatyrka.ts            # показати
 *   npx tsx --env-file=.env.local scripts/rename-zatyrka.ts --apply    # перейменувати
 *   npx tsx --env-file=.env.local scripts/rename-zatyrka.ts --rollback # повернути з backup
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const BACKUP = 'scripts/.rename-zatyrka-backup.json';

/** «Замазка для швів …» → «Затирка для швів …». Тільки на початку назви. */
export function renameProduct(name: string): string {
  return name
    .replace(/^Замазка(?=\s)/, 'Затирка')
    .replace(/^Замазки(?=\s)/, 'Затирки');
}

const CATEGORY_RENAMES: Record<string, string> = {
  'zamazky-dlya-shviv': 'Затирки для швів',
  'zamazky-tsementni':  'Цементні затирки для швів',
  'zamazky-epoksydni':  'Епоксидні затирки для швів',
};

type Backup = {
  at: string;
  products: { sku: string; name: string }[];
  categories: { slug: string; name: string }[];
};

async function main() {
  // Імпорт усередині функції: інакше тест на renameProduct тягнув би клієнт
  // Supabase і падав на валідації env, хоч сама функція чиста.
  const { createServiceClient } = await import('../lib/supabase');
  const db = createServiceClient();

  if (ROLLBACK) {
    if (!existsSync(BACKUP)) throw new Error(`Немає ${BACKUP} — відкочувати нема з чого`);
    const b = JSON.parse(readFileSync(BACKUP, 'utf8')) as Backup;
    console.log(`відкат до стану ${b.at}: ${b.products.length} товарів, ${b.categories.length} категорій`);
    for (const p of b.products) {
      const { error } = await db.from('products').update({ name: p.name }).eq('sku', p.sku);
      if (error) console.error(`  ${p.sku}: ${error.message}`);
    }
    for (const c of b.categories) {
      const { error } = await db.from('categories').update({ name: c.name }).eq('slug', c.slug);
      if (error) console.error(`  ${c.slug}: ${error.message}`);
    }
    console.log('відкат виконано');
    return;
  }

  const slugs = Object.keys(CATEGORY_RENAMES);
  const { data: cats } = await db.from('categories').select('slug, name').in('slug', slugs);
  const { data: prods } = await db
    .from('products')
    .select('sku, name, category_slug')
    .in('category_slug', slugs)
    .limit(1000);

  const catChanges = (cats ?? [])
    .map(c => ({ slug: c.slug as string, from: c.name as string, to: CATEGORY_RENAMES[c.slug as string] }))
    .filter(c => c.from !== c.to);

  const prodChanges = (prods ?? [])
    .map(p => ({ sku: p.sku as string, from: p.name as string, to: renameProduct(p.name as string) }))
    .filter(p => p.from !== p.to);

  const untouched = (prods ?? []).length - prodChanges.length;

  console.log(`КАТЕГОРІЇ (${catChanges.length}):`);
  for (const c of catChanges) console.log(`  ${c.slug}: «${c.from}» → «${c.to}»`);

  console.log(`\nТОВАРИ: перейменовуються ${prodChanges.length} із ${(prods ?? []).length}` +
    (untouched ? `, не підпали під шаблон ${untouched}` : ''));
  for (const p of prodChanges.slice(0, 5)) console.log(`  ${p.sku}: «${p.from}» → «${p.to}»`);
  if (prodChanges.length > 5) console.log(`  … і ще ${prodChanges.length - 5}`);

  if (untouched > 0) {
    console.log('\nНЕ ПІДПАЛИ ПІД ШАБЛОН (перевір вручну):');
    for (const p of (prods ?? []).filter(x => renameProduct(x.name as string) === x.name)) {
      console.log(`  ${p.sku}: ${p.name}`);
    }
  }

  if (!APPLY) {
    console.log('\n(прогін без запису; додайте --apply)');
    return;
  }

  // Бекап ДО запису: без нього відкат довелося б робити руками по 58 рядках
  const backup: Backup = {
    at: new Date().toISOString(),
    products: prodChanges.map(p => ({ sku: p.sku, name: p.from })),
    categories: catChanges.map(c => ({ slug: c.slug, name: c.from })),
  };
  writeFileSync(BACKUP, JSON.stringify(backup, null, 1), 'utf8');
  console.log(`\nстарі назви збережено у ${BACKUP}`);

  let done = 0;
  for (const c of catChanges) {
    const { error } = await db.from('categories').update({ name: c.to }).eq('slug', c.slug);
    if (error) console.error(`  категорія ${c.slug}: ${error.message}`);
    else done++;
  }
  for (const p of prodChanges) {
    const { error } = await db.from('products').update({ name: p.to }).eq('sku', p.sku);
    if (error) console.error(`  товар ${p.sku}: ${error.message}`);
    else done++;
  }
  console.log(`оновлено записів: ${done} з ${catChanges.length + prodChanges.length}`);
  console.log('\nДалі: фіди Prom і Rozetka віддадуть нові назви при наступному зверненні площадок.');
}

// Запускаємо лише при прямому виклику: під час імпорту з тесту скрипт має
// лишатись мовчазним.
if (process.argv[1]?.includes('rename-zatyrka')) {
  main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
