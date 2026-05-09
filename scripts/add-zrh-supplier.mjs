/**
 * Додає постачальника ЗРХ в базу даних.
 * Запуск: node --env-file=.env.local scripts/add-zrh-supplier.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const SUPPLIER = {
  slug:              'zrh',
  name:              'ЗРХ',
  source_url:        'https://docs.google.com/spreadsheets/d/1LONiN3QRTKplrfX2wLIRgZ4t0Va2Xv3L2PpdtAipUbk/edit?gid=594423735#gid=594423735',
  file_format:       'csv',       // буде перетворено на TSV автоматично (Google Sheets)
  sync_interval_h:   6,           // синк кожні 6 годин
  markup_retail:     30,
  markup_wholesale:  15,
  markup_drop:       20,
  is_active:         true,
  notes:             'Google Sheets. Формат: Назва | Код | Ціна (грн) | Од. | Наявність',
};

const { data, error } = await supabase
  .from('suppliers')
  .upsert(SUPPLIER, { onConflict: 'slug' })
  .select()
  .single();

if (error) {
  console.error('❌ Помилка:', error.message);
  process.exit(1);
}

console.log(`✓ Постачальник "${data.name}" додано (id: ${data.id})`);
console.log(`  URL: ${data.source_url}`);
console.log(`  Наценка: роздріб ${data.markup_retail}% | опт ${data.markup_wholesale}% | дроп ${data.markup_drop}%`);
console.log(`\nТепер зайдіть в /admin/suppliers і натисніть "Синхронізувати" для ЗРХ`);
