/**
 * cleanup-characteristics.mjs
 * Прибирає дублікати характеристик (рос/укр), залишає українські з одиницями.
 *
 * node scripts/supabase/cleanup-characteristics.mjs --dry-run
 * node scripts/supabase/cleanup-characteristics.mjs
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const DRY_RUN  = process.argv.includes('--dry-run');

// ── Переклад: рос → укр ───────────────────────────────────────────────────────
// Нормалізований ключ → preferred Ukrainian label

const RU_TO_UA = {
  'страна производитель':                                   'Країна виробник',
  'цвет':                                                   'Колір',
  'тип использования':                                      'Тип використання',
  'минимальная температура хранения':                       'Мінімальна температура зберігання',
  'максимальная температура хранения':                      'Максимальна температура зберігання',
  'время полного затвердевания раствора':                   'Час повного затвердіння розчину',
  'прочность клеевого соединения':                          'Міцність клейового з\'єднання',
  'максимальная рабочая температура окружающей среды':      'Максимальна робоча температура навколишнього середовища',
  'минимальная рабочая температура окружающей среды':       'Мінімальна робоча температура навколишнього середовища',
  'максимальная температура эксплуатации':                  'Максимальна температура експлуатації',
  'минимальная температура эксплуатации':                   'Мінімальна температура експлуатації',
  'состояние клея':                                         'Стан клею',
  'количество компонентов':                                 'Кількість компонентів',
  'тип клея':                                               'Тип клею',
  'тип приклеиваемого материала':                           'Тип матеріалу, що приклеюється',
  'тип приклеиваемого изделия':                             'Тип виробу, що приклеюється',
  'вид затирки для межплиточных швов':                      'Вид затирки для міжплиточних швів',
  'противогрибковое действие':                              'Протигрибкова дія',
  'максимальная ширина шва':                                'Максимальна ширина шва',
  'минимальная ширина шва':                                 'Мінімальна ширина шва',
  'водостойкость':                                          'Водостійкість',
  'срок хранения':                                          'Термін зберігання',
  'фасовка материала':                                      'Фасування матеріалу',
  'материал':                                               'Матеріал',
  'покрытие':                                               'Покриття',
  'ширина':                                                 'Ширина',
  'высота':                                                 'Висота',
  'длина':                                                  'Довжина',
  'толщина':                                                'Товщина',
  'вид профиля':                                            'Вид профілю',
  'аэрозольная эмаль':                                      'Аерозольна емаль',
  'основа эмали':                                           'Основа емалі',
  'время высыхания':                                        'Час висихання',
  'степень блеска':                                         'Ступінь блиску',
  'антисептическое свойство':                               'Антисептична властивість',
  'без запаха':                                             'Без запаху',
  'способ нанесения':                                       'Спосіб нанесення',
  'тип окрашиваемого материала':                            'Тип матеріалу, що фарбується',
  'условия эксплуатации':                                   'Умови експлуатації',
  'форма выпуска':                                          'Форма випуску',
  'под окраску':                                            'Під фарбування',
  'область применения':                                     'Сфера застосування',
  'тип использования герметика':                            'Тип використання герметика',
  'вид герметика':                                          'Вид герметика',
  'основа герметика':                                       'Основа герметика',
  'состояние герметика':                                    'Стан герметика',
  'время высыхания поверхности':                            'Час висихання поверхні',
  'эластичность':                                           'Еластичність',
  'запах':                                                  'Запах',
  'тип диска':                                              'Тип диска',
  'назначение диска':                                       'Призначення диска',
  'посадочный диаметр':                                     'Посадковий діаметр',
  'внешний диаметр':                                        'Зовнішній діаметр',
  'добавки в бетон':                                        'Добавки в бетон',
  'минимальная рабочая температура':                        'Мінімальна робоча температура',
  'максимальная рабочая температура':                       'Максимальна робоча температура',
};

// Одиниці для числових характеристик (якщо відсутні)
const UNITS = {
  'мінімальна температура зберігання':                      '°C',
  'максимальна температура зберігання':                     '°C',
  'мінімальна робоча температура навколишнього середовища': '°C',
  'максимальна робоча температура навколишнього середовища':'°C',
  'мінімальна температура експлуатації':                    '°C',
  'максимальна температура експлуатації':                   '°C',
  'час повного затвердіння розчину':                        'год',
  'час висихання':                                          'год',
  'час висихання поверхні':                                 'год',
};

function normalize(label) {
  return label.toLowerCase().trim();
}

function isUkrainian(label) {
  return /[іїєґ]/.test(label) || /[а-яА-Я]/.test(label) === false;
}

function addUnit(label, value) {
  const n = normalize(label);
  const unit = UNITS[n];
  if (!unit) return value;
  const v = value.trim();
  // Вже є одиниця виміру — не додаємо
  if (/[а-яА-ЯіїєґЄ°%]/.test(v) || v.includes('год') || v.includes('°')) return v;
  return `${v} ${unit}`;
}

// ── Головна функція ───────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧹 Очищення характеристик...\n');
  if (DRY_RUN) console.log('🔍 DRY RUN\n');

  // Завантажуємо всі характеристики
  const allChars = [];
  let page = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error: e } = await supabase
      .from('product_characteristics')
      .select('id, product_sku, label, value, sort_order')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (e) { console.error('❌', e.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allChars.push(...data);
    if (data.length < PAGE) break;
    page++;
  }
  const error = null;

  if (error) { console.error('❌', error.message); process.exit(1); }
  console.log(`Всього характеристик в базі: ${allChars.length}`);

  // Групуємо по товару
  const byProduct = {};
  for (const c of allChars) {
    if (!byProduct[c.product_sku]) byProduct[c.product_sku] = [];
    byProduct[c.product_sku].push(c);
  }

  const toDelete = []; // ids для видалення
  const toUpdate = []; // { id, label, value, sort_order }

  let products_processed = 0;
  let duplicates_removed = 0;
  let translated = 0;
  let units_added = 0;

  for (const [sku, chars] of Object.entries(byProduct)) {
    // Крок 1: перекладаємо рос → укр назви, додаємо одиниці
    const normalized = chars.map(c => {
      const nLabel = normalize(c.label);
      const uaLabel = RU_TO_UA[nLabel] ?? c.label;
      const wasTranslated = uaLabel !== c.label;
      const newValue = addUnit(uaLabel, c.value);
      const unitAdded = newValue !== c.value;
      return { ...c, newLabel: uaLabel, newValue, wasTranslated, unitAdded };
    });

    // Крок 2: дедублікація — групуємо по нормалізованій укр назві
    const seen = new Map(); // normalized_label → best char

    for (const c of normalized) {
      const key = normalize(c.newLabel);
      if (!seen.has(key)) {
        seen.set(key, c);
      } else {
        const existing = seen.get(key);
        // Перевагу віддаємо: 1) українській, 2) тій що має одиниці виміру
        const existingIsUa = isUkrainian(existing.label);
        const currentIsUa  = isUkrainian(c.label);
        const currentBetter =
          (!existingIsUa && currentIsUa) ||
          (existingIsUa === currentIsUa && c.newValue.length > existing.newValue.length);

        if (currentBetter) {
          toDelete.push(existing.id);
          seen.set(key, c);
        } else {
          toDelete.push(c.id);
        }
        duplicates_removed++;
      }
    }

    // Крок 3: оновлюємо ті що лишились
    let order = 1;
    for (const [, c] of seen) {
      const needsUpdate = c.newLabel !== c.label || c.newValue !== c.value || c.sort_order !== order;
      if (needsUpdate) {
        toUpdate.push({ id: c.id, label: c.newLabel, value: c.newValue, sort_order: order });
        if (c.wasTranslated) translated++;
        if (c.unitAdded) units_added++;
      }
      order++;
    }

    products_processed++;
  }

  console.log(`\nОброблено товарів:         ${products_processed}`);
  console.log(`Дублікатів для видалення:  ${toDelete.length}`);
  console.log(`Перекладено назв:          ${translated}`);
  console.log(`Додано одиниць виміру:     ${units_added}`);
  console.log(`Оновлень для запису:       ${toUpdate.length}`);

  if (DRY_RUN) {
    // Показуємо приклад
    const exSku = Object.keys(byProduct)[0];
    const exChars = byProduct[exSku];
    console.log(`\nПриклад (${exSku}):`);
    exChars.slice(0, 5).forEach(c => console.log(`  "${c.label}": ${c.value}`));
    console.log('\n🔍 DRY RUN — дані не змінено.\n');
    return;
  }

  // Видаляємо дублікати
  if (toDelete.length > 0) {
    console.log('\n🗑  Видаляю дублікати...');
    for (let i = 0; i < toDelete.length; i += 500) {
      const { error } = await supabase.from('product_characteristics').delete().in('id', toDelete.slice(i, i + 500));
      if (error) console.error('❌', error.message);
      else process.stdout.write(`\r   ${Math.min(i + 500, toDelete.length)}/${toDelete.length}`);
    }
    console.log();
  }

  // Оновлюємо назви та одиниці
  if (toUpdate.length > 0) {
    console.log('✏️  Оновлюю назви та одиниці...');
    let done = 0;
    for (const u of toUpdate) {
      const { error } = await supabase.from('product_characteristics')
        .update({ label: u.label, value: u.value, sort_order: u.sort_order })
        .eq('id', u.id);
      if (error) console.error('❌', error.message);
      else { done++; if (done % 100 === 0) process.stdout.write(`\r   ${done}/${toUpdate.length}`); }
    }
    console.log(`\r   ${done}/${toUpdate.length}`);
  }

  console.log('\n✅ Очищення завершено!\n');
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
