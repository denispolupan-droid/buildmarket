/**
 * update-rozetka-commissions.mjs
 * Читає PDF з комісіями Rozetka і оновлює rozetka_commission_pct в categories.
 * Бере останній стовпець PDF = "Відсоток комісії+ПДВ".
 *
 * Запуск (перегляд без змін):
 *   node scripts/supabase/update-rozetka-commissions.mjs "k:\...\Розмір відсотків юридична особа + ФОП (1).pdf"
 *
 * Застосувати зміни до БД:
 *   node scripts/supabase/update-rozetka-commissions.mjs "k:\...\..." --apply
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── Конфіг ────────────────────────────────────────────────────────────────────

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const PDF_PATH = process.argv[2];
const APPLY    = process.argv.includes('--apply');

if (!PDF_PATH) {
  console.error('Usage: node scripts/supabase/update-rozetka-commissions.mjs <path-to-pdf> [--apply]');
  process.exit(1);
}

// ── Парсинг PDF через pdfjs-dist ──────────────────────────────────────────────

const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
const buf      = readFileSync(PDF_PATH);
const doc      = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

let text = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page    = await doc.getPage(i);
  const content = await page.getTextContent();
  text += content.items.map(it => it.str).join(' ') + '\n';
}

/**
 * Витягує { rozetka_category_id → commission_pct+ПДВ }.
 *
 * PDF рядок: "ID  Назва  TotalPct  Royalty%  Platform%  VAT  CommissionWithVAT"
 * Беремо ОСТАННІЙ числовий стовпець (CommissionWithVAT = Відсоток комісії+ПДВ).
 *
 * Також підтримується формат з ID в дужках: "(4629382) ... 10  6  4  0,8  10,8"
 */
function parseCommissions(text) {
  const map = new Map();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Формат А: ID в дужках
    const matchA = line.match(/\((\d{5,})\)/);
    if (matchA) {
      const after = line.slice(line.indexOf(matchA[0]) + matchA[0].length);
      const nums  = [...after.matchAll(/(\d+(?:[.,]\d+)?)/g)]
        .map(m => parseFloat(m[1].replace(',', '.')))
        .filter(n => n > 0 && n <= 50);
      if (nums.length > 0) map.set(matchA[1], nums[nums.length - 1]);
      continue;
    }

    // Формат Б: рядок починається з 5-7-значного ID
    const matchB = line.match(/^(\d{5,7})\s+/);
    if (matchB) {
      const rest = line.slice(matchB[0].length);
      const nums = [...rest.matchAll(/(\d+(?:[.,]\d+)?)/g)]
        .map(m => parseFloat(m[1].replace(',', '.')))
        .filter(n => n > 0 && n <= 50);
      if (nums.length > 0) map.set(matchB[1], nums[nums.length - 1]);
    }
  }

  return map;
}

const pdfMap = parseCommissions(text);
console.log(`\n📄 PDF: знайдено ${pdfMap.size} категорій з комісіями`);
if (pdfMap.size === 0) {
  console.error('⚠️  Не вдалося розпарсити PDF. Перевірте формат файлу.');
  process.exit(1);
}

// ── Порівняння з нашими категоріями ──────────────────────────────────────────

const { data: categories, error } = await supabase
  .from('categories')
  .select('slug, name, rozetka_category_id, rozetka_commission_pct')
  .not('rozetka_category_id', 'is', null);

if (error) { console.error('Supabase error:', error.message); process.exit(1); }

const updates = [];
const noMatch = [];

for (const cat of categories) {
  const newPct = pdfMap.get(cat.rozetka_category_id);
  if (newPct == null) {
    noMatch.push(cat);
    continue;
  }
  const oldPct = cat.rozetka_commission_pct != null ? Number(cat.rozetka_commission_pct) : null;
  if (oldPct !== newPct) {
    updates.push({ slug: cat.slug, name: cat.name, id: cat.rozetka_category_id, old: oldPct, new: newPct });
  }
}

// ── Звіт ──────────────────────────────────────────────────────────────────────

if (updates.length === 0) {
  console.log('✅ Всі комісії актуальні — жодних змін не потрібно.');
} else {
  console.log(`\n📊 Зміни (${updates.length}):`);
  for (const u of updates) {
    console.log(`  ${u.name.padEnd(40)} [${u.id}]  ${u.old ?? '—'} → ${u.new}%`);
  }
}

if (noMatch.length > 0) {
  console.log(`\n⚠️  ${noMatch.length} категорій не знайдено безпосередньо в PDF (успадковують ставку батьківської):`);
  for (const c of noMatch) {
    console.log(`  ${c.name.padEnd(40)} [${c.rozetka_category_id}]  поточна: ${c.rozetka_commission_pct ?? '—'}%`);
  }
}

// ── Застосування ─────────────────────────────────────────────────────────────

if (!APPLY) {
  console.log('\n💡 Запустіть з --apply щоб зберегти зміни в БД.');
  process.exit(0);
}

if (updates.length === 0) {
  console.log('Нічого зберігати.');
  process.exit(0);
}

let ok = 0, fail = 0;
for (const u of updates) {
  const { error: upErr } = await supabase
    .from('categories')
    .update({ rozetka_commission_pct: u.new })
    .eq('slug', u.slug);
  if (upErr) { console.error(`  ✗ ${u.slug}:`, upErr.message); fail++; }
  else { console.log(`  ✓ ${u.name}`); ok++; }
}

console.log(`\n✅ Оновлено ${ok} категорій${fail > 0 ? `, помилок: ${fail}` : ''}.`);
