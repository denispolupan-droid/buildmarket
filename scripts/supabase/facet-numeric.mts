/**
 * Числові фасети (2026-09-04) — затирки, стрічки, кріплення, інструменти.
 * Разовий переклад карток після перезаливки словника (seed-char-dictionary):
 *  1. «Тип» лишається карточним (product_type тут грубіший: «Цементна» проти
 *     «Цементна затирка»); дефолт категорії підставляється лише де його немає.
 *  2. Лейбли: «Довжина рулону» → «Довжина» (родина стрічок); «Діаметр різьби» та
 *     «Діаметр електрода» зливаються в «Діаметр» аліасами словника (normalizeChars).
 *  3. Формат розмірних значень: «3 м.п.» → «3 м», «близько 2,2-2,6 мм» → «2,2–2,6 мм»,
 *     «6,0 мм» → «6 мм», «5х5 мм» → «5×5 мм», «До 6 мм» → «до 6 мм», дефіс у
 *     діапазонах → «–». Посадковий отвір «22 мм» → «22,23 мм» (стандарт КШМ).
 *  4. Дефолти категорії для відсутніх: Ширина (сітки/склополотно = 1 м),
 *     Призначення, Тип покриття, Посадковий отвір.
 *  5. Міссорт: 2002-019/020 (Knauf Fugendeckstreifen — стрічка для швів) лежали
 *     в малярних стрічках → переносяться в strichka-dlya-shviv.
 *
 *   npx tsx --env-file=.env.test  scripts/supabase/facet-numeric.mts            (dry-run)
 *   npx tsx --env-file=.env.local scripts/supabase/facet-numeric.mts --apply
 * Бекап — scripts/supabase/backups/facet-numeric-*.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as charsNS from '../../lib/characteristics';
const { loadCharDictionary, normalizeChars, normCharKey } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const STRICHKY = ['hermetyzuyucha-strichka', 'malyarna-strichka', 'montazhna-strichka', 'sitky-armuvalni', 'sklopolotno', 'strichka-dlya-shviv', 'zvukoizolyatsiyna-strichka'];
const CATS = [
  'zamazky-tsementni', 'zamazky-epoksydni',
  ...STRICHKY,
  'dyubeli-ta-ankery', 'shurupy-ta-samorizy',
  'bury-ta-sverdla', 'elektrody', 'shlifuvalny', 'vidrizni-dysky', 'vymiriuvalny', 'vytratni-materialy',
];
/** Розмірні лейбли, значення яких приводимо до єдиного формату. */
const SIZE_LABELS = ['Ширина', 'Довжина', 'Товщина', 'Діаметр', 'Посадковий отвір', 'Ширина шва', 'Розмір комірки'];
/** Лейбли, які добиваємо дефолтом категорії, коли на картці їх немає. */
const FILL_DEFAULTS = ['Тип', 'Ширина', 'Призначення', 'Тип покриття', 'Посадковий отвір'];
const REPORT = ['Тип', 'Ширина шва', 'Ширина', 'Довжина', 'Діаметр', 'Товщина', 'Зернистість', 'Посадковий отвір'];
/** sku → правильна категорія (міссорти, п.5 шапки). */
const MOVES: Record<string, string> = { '2002-019': 'strichka-dlya-shviv', '2002-020': 'strichka-dlya-shviv' };

function tidySize(v: string): string {
  let s = v.trim()
    .replace(/^близько\s+/i, '')
    .replace(/\s*м\.?\s*п\.?$/i, ' м')                       // «3 м.п.» → «3 м»
    .replace(/(\d)\.(\d)/g, '$1,$2')                         // десяткова крапка → кома («1.5 мм»)
    .replace(/(\d)\s*[-—]\s*(\d)/g, '$1–$2')                 // дефіс/тире в діапазоні → «–»
    .replace(/(\d),0(\s|$)/g, '$1$2')                        // «6,0 мм» → «6 мм»
    .replace(/(\d)\s*[хx]\s*(\d)/gi, '$1×$2')                // «5х5» → «5×5»
    .replace(/^До\s+(\d)/, 'до $1')
    .replace(/\s+/g, ' ');
  if (/^\d+([,.]\d+)?$/.test(s)) s += ' мм';                 // голе число — це мм у цих родинах
  return s;
}

/**
 * Канонізація карточного «Тип» — той самий предмет мав до 10 формулювань
 * («Замазка (фуга) для швів», «Відрізний диск (абразивний круг)»…). Фільтр
 * «Тип» будується з product_type і цим не зачіпається — це чистка карток.
 */
const TYPE_RULES: Record<string, [RegExp, string][]> = {
  'zamazky-tsementni': [[/затирка|замазка|фуга/i, 'Цементна затирка']],
  'vidrizni-dysky': [[/алмазн/i, 'Алмазний відрізний диск'], [/зачисн/i, 'Зачисний диск'], [/відрізн/i, 'Відрізний диск']],
  'shlifuvalny': [[/пелюстк/i, 'Пелюстковий диск (T27)'], [/velcro|самозач/i, 'Шліфувальний диск (Velcro)'], [/зачисн/i, 'Зачисний диск']],
  'dyubeli-ta-ankery': [[/теплоізоляці/i, 'Тарілчастий дюбель для теплоізоляції']],
  'malyarna-strichka': [[/малярн|маскувальн/i, 'Малярна стрічка']],
  'zvukoizolyatsiyna-strichka': [[/звукоізоляційн/i, 'Звукоізоляційна стрічка']],
  'bury-ta-sverdla': [[/^бур/i, 'Бур']],
};

type Char = { id?: number; label: string; value: string; sort_order?: number };
type Product = { sku: string; name: string; category_slug: string; product_type: string | null };

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any, orderBy = 'id'): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).order(orderBy).range(from, from + 999); // ORDER обов'язковий: без нього сторінки гублять рядки
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

async function main() {
  const dict = await loadCharDictionary(db);
  if (dict.aliasMap.get(normCharKey('діаметр різьби')) !== 'Діаметр') throw new Error('Словник без аліаса «діаметр різьби» — спершу seed-char-dictionary.mjs');
  if (!dict.sortMap.has('Розмір комірки')) throw new Error('Словник без «Розмір комірки» — спершу seed-char-dictionary.mjs');

  const products = await fetchAll<Product>('products', 'sku, name, category_slug, product_type', q => q.in('category_slug', CATS));
  for (const p of products) if (MOVES[p.sku] && p.category_slug !== MOVES[p.sku]) {
    console.log(`  міссорт: ${p.sku} ${p.category_slug} → ${MOVES[p.sku]}`);
    p.category_slug = MOVES[p.sku]; // чистка йде вже в контексті правильної категорії
    if (APPLY) {
      const { error } = await db.from('products').update({ category_slug: p.category_slug }).eq('sku', p.sku);
      if (error) throw new Error(`${p.sku} move: ${error.message}`);
    }
  }
  const allChars = await fetchAll<Char & { product_sku: string }>('product_characteristics', 'id, product_sku, label, value, sort_order', q => q.in('product_sku', products.map(p => p.sku)));
  const charsOf = new Map<string, Char[]>();
  for (const c of allChars) { if (!charsOf.has(c.product_sku)) charsOf.set(c.product_sku, []); charsOf.get(c.product_sku)!.push(c); }
  const defRows = await fetchAll<{ category_slug: string; default_value: string | null; characteristic_definitions: { label: string } | null }>(
    'category_characteristics', 'category_slug, default_value, characteristic_definitions(label)', q => q.in('category_slug', CATS), 'category_slug');
  const defaults = new Map<string, Map<string, string>>();
  for (const r of defRows) {
    if (!r.default_value || !r.characteristic_definitions) continue;
    if (!defaults.has(r.category_slug)) defaults.set(r.category_slug, new Map());
    defaults.get(r.category_slug)!.set(r.characteristic_definitions.label, r.default_value);
  }

  console.log(`БД: ${process.env.NEXT_PUBLIC_SUPABASE_URL}${APPLY ? '' : ' (DRY-RUN)'}\nЧислові фасети: ${CATS.length} категорій, ${products.length} товарів`);
  const changed: { sku: string; before: Char[]; after: Char[] }[] = [];
  const dist = new Map<string, Map<string, number>>();
  const bump = (label: string, value: string) => {
    if (!dist.has(label)) dist.set(label, new Map());
    dist.get(label)!.set(value, (dist.get(label)!.get(value) ?? 0) + 1);
  };

  for (const p of products) {
    const before = [...(charsOf.get(p.sku) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    const catDefaults = defaults.get(p.category_slug) ?? new Map<string, string>();
    const map = new Map<string, string>();
    for (const c of before) {
      // «Довжина рулону» в родині стрічок — це просто «Довжина» (лейбл лишається у гідроізоляційних стрічок)
      const label = STRICHKY.includes(p.category_slug) && c.label === 'Довжина рулону' ? 'Довжина' : c.label;
      if (!map.has(label)) map.set(label, c.value);
    }
    const get = (l: string) => map.get(l)?.trim() || null;

    for (const label of [...map.keys()]) {
      const canon = dict.aliasMap.get(normCharKey(label)) ?? label; // формат рівняємо і для «Діаметра різьби», що стане «Діаметром»
      if (!SIZE_LABELS.includes(canon)) continue;
      let v = tidySize(map.get(label)!);
      if (canon === 'Посадковий отвір') {
        if (v === '22 мм') v = '22,23 мм'; // стандартна посадка КШМ, «22» — округлення
        if (/velcro|самозач/i.test(v)) v = 'Velcro (самозачіпна)';
      }
      map.set(label, v);
    }
    const typeRule = get('Тип') && TYPE_RULES[p.category_slug]?.find(([re]) => re.test(get('Тип')!));
    if (typeRule) map.set('Тип', typeRule[1]);

    for (const label of FILL_DEFAULTS) {
      if (!get(label) && catDefaults.get(label)) map.set(label, catDefaults.get(label)!);
    }

    const after = normalizeChars([...map].map(([label, value]) => ({ label, value })), dict, p.category_slug);
    for (const c of after) if (REPORT.includes(c.label)) bump(c.label, c.value);
    const same = after.length === before.length && after.every((n, i) => n.label === before[i].label && n.value === before[i].value && n.sort_order === before[i].sort_order);
    if (!same) changed.push({ sku: p.sku, before, after });
  }

  console.log('\nРозподіл фасетів після чистки:');
  for (const label of REPORT) {
    const m = dist.get(label);
    if (!m) continue;
    console.log(`  ${label}:`);
    for (const [v, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  ${v}`);
  }
  console.log(`\nТоварів зі зміненими характеристиками: ${changed.length} із ${products.length}`);
  if (!APPLY) { console.log('DRY-RUN: нічого не записано. Запусти з --apply.'); return; }

  const dir = path.join(process.cwd(), 'scripts', 'supabase', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `facet-numeric-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ chars: changed.map(c => ({ sku: c.sku, before: c.before })) }, null, 1));
  console.log(`бекап: ${file}`);
  for (const c of changed) {
    const { error: d } = await db.from('product_characteristics').delete().eq('product_sku', c.sku);
    if (d) throw new Error(`${c.sku} delete: ${d.message}`);
    const { error: i } = await db.from('product_characteristics').insert(c.after.map(x => ({ product_sku: c.sku, label: x.label, value: x.value, sort_order: x.sort_order })));
    if (i) throw new Error(`${c.sku} insert: ${i.message}`);
  }
  console.log(`записано: ${changed.length} товарів`);
}
main().catch(e => { console.error(e); process.exit(1); });
