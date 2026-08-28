/**
 * Переводить статичні ціни в текстах категорій (lib/category-descriptions*.ts)
 * на токени живих цін (lib/seo/guide-prices): «66 грн» → «{price:1204-007}»,
 * «66–423 грн» → «{range:1204-007,1204-010}», діапазон, що збігається з
 * мін–макс родини → «{range}», «302 за CS 15» → «{price:1005-004} за CS 15».
 *
 *   npx tsx --env-file=.env.local scripts/seo-tokenize-guide-prices.mts [slug…]          # звіт
 *   npx tsx --env-file=.env.local scripts/seo-tokenize-guide-prices.mts --apply [slug…]  # переписати файли
 *
 * Ціни в текстах уже застаріли (гайди писались за прайсом, який відтоді
 * перерахували), тому число мапиться на товар не «рівно», а в межах ±TOL від
 * поточної ціни (promo ?? retail — та сама, що на ціннику), і серед кандидатів
 * обирається той, чий бренд, фасування чи серія названі поруч. Контекст —
 * спершу клауза (частина речення між комами/«;»/сполучниками, де стоїть саме
 * це число): у «Ceresit CS 24 — 228 грн, CS 15 Express — 302 грн» ціле речення
 * згадує обидва товари, і за кількістю слів «перемагав» би не той. Число без
 * жодної зачіпки не чіпається: воно може бути похідним («контур ванни
 * 70–200 грн»), як і все, після чого стоїть «за м²/за метр/за літр». Такі місця
 * перелічуються у звіті — їх переводять у {price:SKU / K} руками, бо
 * константа K стоїть у самому реченні.
 *
 * Звіт показує кожну заміну як «було → стане», щоб побачити, де ціна змінилась.
 * У ru-файлі назви товарів (українські) не збігаються з текстом, тому те саме
 * число тієї ж категорії бере товар, обраний для uk.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const ONLY = new Set(process.argv.slice(2).filter(a => !a.startsWith('--')));

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Row = { sku: string; name: string; brand: string | null; volume: string | null; category_slug: string | null; stock: { price_retail: number | null; price_promo: number | null } | null };
const products: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('products')
    .select('sku, name, brand, volume, category_slug, stock:product_stock(price_retail, price_promo)')
    .eq('is_active', true).order('sku').range(from, from + 999);
  if (error) throw error;
  products.push(...((data ?? []) as unknown as Row[]));
  if (!data || data.length < 1000) break;
}
const { data: cats } = await db.from('categories').select('slug, parent_slug');
const categories = (cats ?? []) as { slug: string; parent_slug: string | null }[];

const gp: any = await import('../lib/seo/guide-prices');
const resolveText: (t: string, ctx: any, un: string[]) => string = gp.resolveText ?? gp.default.resolveText;
const sm: any = await import('../lib/seo/meta');
const familySlugs: (c: any[], s: string) => string[] = sm.categoryFamilySlugs ?? sm.default.categoryFamilySlugs;

const price = (p: Row) => p.stock?.price_promo ?? p.stock?.price_retail ?? null;
const bySku = new Map(products.filter(p => price(p)).map(p => [p.sku, price(p)!]));

type Priced = { sku: string; name: string; brand: string; volume: string; price: number };
function familyProducts(slug: string): Priced[] {
  const fam = new Set(familySlugs(categories, slug));
  return products
    .filter(p => p.category_slug && fam.has(p.category_slug) && price(p))
    .map(p => ({ sku: p.sku, name: p.name, brand: p.brand ?? '', volume: p.volume ?? '', price: Math.round(price(p)!) }));
}

const num = (s: string) => Number(s.replace(/\s/g, ''));
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** Допуск між ціною в тексті й поточною: прайс перерахували, але не вдвічі. */
const TOL = 0.2;
const report = { replaced: [] as string[], ambiguous: [] as string[], unmapped: [] as string[] };

/** Вибір uk-проходу для ru: ключ «slug:число[:виключений sku]». */
const chosen = new Map<string, Priced>();

const NAME_STOP = new Set(['для', 'та', 'і', 'з', 'на', 'по', 'від', 'до', 'за', 'у', 'в', 'кг', 'л', 'мл', 'г', 'шт']);
const nameTokens = (name: string) => name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2 && !NAME_STOP.has(t));
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Слова, що є в назвах понад 30 % товарів родини («герметик», «280», «санітарний»), нічого не розрізняють. */
let common = new Set<string>();
function setFamily(fam: Priced[]) {
  const df = new Map<string, number>();
  for (const p of fam) for (const t of new Set(nameTokens(p.name))) df.set(t, (df.get(t) ?? 0) + 1);
  common = new Set([...df].filter(([, n]) => n >= 3 && n / fam.length > 0.3).map(([t]) => t));
}

/** «0,28 л» у назві — це «280 мл» у тексті (і навпаки); «800 г» — «0,8 кг». */
function volumeForms(volume: string): string[] {
  const v = volume.toLowerCase().replace(/\s/g, '');
  if (!v) return [];
  const out = new Set([v]);
  const m = /^(\d+(?:[.,]\d+)?)(л|мл|кг|г)$/.exec(v);
  if (m) {
    const n = Number(m[1].replace(',', '.'));
    const [alt, unit] = m[2] === 'л' ? [n * 1000, 'мл'] : m[2] === 'мл' ? [n / 1000, 'л'] : m[2] === 'кг' ? [n * 1000, 'г'] : [n / 1000, 'кг'];
    out.add(String(Math.round(alt * 1000) / 1000).replace('.', ',') + unit);
  }
  return [...out];
}

/** Скільки зачіпок на товар у фрагменті тексту: бренд (3), фасування (2), кожне рідкісне слово назви (1). */
function score(p: Priced, text: string): number {
  const low = text.toLowerCase();
  const compact = low.replace(/\s/g, '');
  let s = 0;
  if (p.brand && compact.includes(p.brand.toLowerCase().replace(/\s/g, ''))) s += 3;
  if (volumeForms(p.volume).some(v => compact.includes(v))) s += 2;
  for (const t of new Set(nameTokens(p.name))) {
    if (common.has(t)) continue;
    // Довгі слова — за основою («Скажена липучка» ↔ «Скаженої липучки»)
    const stem = t.length >= 6 ? t.slice(0, 5) : t;
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escapeRx(stem)}${t.length >= 6 ? '' : '(?![\\p{L}\\p{N}])'}`, 'u').test(low)) s += 1;
  }
  return s;
}

/**
 * Товар за ціною з урахуванням контексту. У переліках «Ceresit CT 17 — 188 грн
 * за 2 л, 427 за 5 л, 583 за 10 л; Knauf — …» бренд стоїть у першій клаузі
 * (між комами), а фасування — у кожній, і саме «;» розділяє товари. Тому
 * рахуємо зачіпки по сегменту між «;» (бренд, серія) плюс подвійно — по
 * клаузі з самим числом (фасування, назва саме цієї позиції). Якщо й сегмент
 * порожній — ціле речення. exclude — для другого кінця діапазону.
 */
function pick(fam: Priced[], n: number, clause: string, segment: string, sentence: string, where: string, exclude?: Priced): Priced | null {
  const key = `${where.slice(3)}:${n}${exclude ? ':' + exclude.sku : ''}`;
  if (where.startsWith('ru') && chosen.has(key)) return chosen.get(key)!;
  const near = fam.filter(p => p !== exclude && Math.abs(p.price - n) / n <= TOL);
  const ctx = sentence.trim().slice(0, 100);
  if (!near.length) { report.unmapped.push(`${where}: ${n} грн — жодного товару в межах ±${TOL * 100} %: ${ctx}`); return null; }
  const rank = (f: (p: Priced) => number) => near.map(p => ({ p, s: f(p), d: Math.abs(p.price - n) })).sort((a, b) => b.s - a.s || a.d - b.d);
  // Клауза називає бренд («92 грн за 1,3 кг Polifarb Сніжинка») — товар іншого
  // бренду не підходить, навіть якщо сегмент згадує і його
  const cl = clause.toLowerCase().replace(/\s/g, '');
  const clauseBrands = new Set(fam.map(p => p.brand).filter(b => b && cl.includes(b.toLowerCase().replace(/\s/g, ''))));
  let scored = rank(p => (clauseBrands.size && !clauseBrands.has(p.brand) ? 0 : score(p, segment) + 4 * score(p, clause)));
  if (scored[0].s === 0) { report.unmapped.push(`${where}: ${n} грн — без контексту (кандидати ${near.slice(0, 3).map(p => `${p.sku} ${p.price}`).join(', ')}): ${ctx}`); return null; }
  const top = scored.filter(x => x.s === scored[0].s && x.d === scored[0].d);
  // Варіанти кольору однієї позиції за однією ціною — не неоднозначність
  const distinct = new Set(top.map(x => `${x.p.price}|${x.p.volume}|${x.p.brand}`));
  if (distinct.size > 1) {
    report.ambiguous.push(`${where}: ${n} грн → ${scored.slice(0, 3).map(x => `${x.p.sku} ${x.p.name} (${x.p.price}, ${x.s})`).join(' | ')} — взято перший; «${clause.trim().slice(0, 90)}»`);
  }
  chosen.set(key, scored[0].p);
  return scored[0].p;
}

/** Межі блоку категорії у джерелі: від «  'slug': {» до наступного ключа того ж рівня. */
function blockRange(src: string, slug: string): [number, number] | null {
  const m = new RegExp(`\\n  '?${slug.replace(/-/g, '\\-')}'?: \\{`).exec(src);
  if (!m) return null;
  const start = m.index + 1;
  const rest = src.slice(start + 1);
  const next = /\n  '?[a-z0-9-]+'?: \{|\n\};/.exec(rest);
  return [start, next ? start + 1 + next.index : src.length];
}

const NUM = '(\\d{1,3}(?: \\d{3})*|\\d+)';
/** «66 грн», «66–423 грн», «1 586 грн» — але не «586 грн» усередині «1 586 грн» */
const priceRx = new RegExp(`(?<![\\d,.])(?<!\\d )${NUM}(?:–${NUM})? грн(?![\\p{L}])`, 'gu');
/** «302 за CS 15 Express», «526–540 за 5 кг» — ціна без «грн» у переліку */
const zaRx = new RegExp(`(?<![\\d,.–{:\\-])(?<!\\d )${NUM}(?:–${NUM})? за (?=[\\p{L}\\d])`, 'gu');
/** «… грн за м²», «за метр шва», «за літр розчину» — похідна величина, не ціна товару */
const derivedRx = /^ (за|на) (м²|м2|метр|літр|кг|погон|л(?!\p{L}))/u;

function tokenizeBlock(block: string, fam: Priced[], where: string): string {
  const lo = Math.min(...fam.map(p => p.price)), hi = Math.max(...fam.map(p => p.price));
  setFamily(fam);
  const log = (old: string, tok: string, now: string) => report.replaced.push(`${where}: ${old} → ${tok} = ${now}`);

  const pass = (text: string, rx: RegExp, tail: string) =>
    text.replace(rx, (m, a: string, b: string | undefined, off: number) => {
      const end = off + m.length;
      // Речення — між крапками або межами рядка (кожен рядок джерела — окремий літерал)
      const sa = Math.max(text.lastIndexOf('. ', off), text.lastIndexOf('\n', off)) + 1;
      const e1 = text.indexOf('. ', off), e2 = text.indexOf('\n', off);
      const sb = Math.min(e1 < 0 ? text.length : e1 + 1, e2 < 0 ? text.length : e2);
      const sentence = text.slice(sa, sb);
      const rel = off - sa;
      // Сегмент — між «;» (один товар з усіма фасуваннями). Клауза — «вікно»
      // між сусідніми цінами всередині сегмента: у «Lacrysil, Pattex і Дивоцвіт
      // коштують від 60 грн за тюбик до 254 грн за SUPER FIX» до 254 належить
      // лише «за тюбик … до 254 грн за SUPER FIX», а не перелік брендів на початку.
      // Ціни, уже замінені токенами першим проходом, — теж межі.
      const segSeps = [...sentence.matchAll(/;/g)].map(x => x.index!);
      const segA = segSeps.filter(x => x < rel).pop() ?? 0;
      const segment = sentence.slice(segA, segSeps.find(x => x > rel) ?? sentence.length);
      const relSeg = rel - segA;
      const bounds = [...segment.matchAll(/\{[^}]*\}|\d[\d ]*(?:–[\d ]*\d)? (?:грн|за)/g)]
        .map(x => ({ a: x.index!, b: x.index! + x[0].length }))
        .filter(x => x.b <= relSeg || x.a >= relSeg + m.length);
      // …і ще вужче: до ціни — від останньої коми/«і»/«до», після — до першої.
      // У «254 грн за 1,2 кг акрилової і 344 грн за 3 кг бітумної до 2 887 грн»
      // до 344 належить лише «за 3 кг бітумної».
      const SEP = /, |\sі\s|\sта\s|\sи\s|\sдо\s|\sабо\s|\sили\s/gu;
      const beforeRaw = segment.slice(bounds.filter(x => x.b <= relSeg).pop()?.b ?? 0, relSeg);
      const afterRaw = segment.slice(relSeg + m.length, bounds.find(x => x.a >= relSeg + m.length)?.a ?? segment.length);
      const bSeps = [...beforeRaw.matchAll(SEP)];
      const before = bSeps.length ? beforeRaw.slice(bSeps[bSeps.length - 1].index! + bSeps[bSeps.length - 1][0].length) : beforeRaw;
      const aSep = SEP.exec(afterRaw); SEP.lastIndex = 0;
      const after = aSep ? afterRaw.slice(0, aSep.index) : afterRaw;
      const clause = before + m + after;

      if (!tail && derivedRx.test(text.slice(end, end + 14))) {
        report.unmapped.push(`${where}: «${m}» (похідна) — ${sentence.trim().slice(0, 110)}`);
        return m;
      }
      const n1 = num(a);
      if (tail && n1 < 40) return m; // «5 за раз», «10 за м²» — не ціна
      const shown = tail ? m.slice(0, -4) : m;
      if (b == null) {
        const p = pick(fam, n1, clause, segment, sentence, where);
        if (!p) return m;
        log(shown, `{price:${p.sku}}${tail}`, `${fmt(p.price)} грн${tail}`);
        return `{price:${p.sku}}${tail}${tail ? ' ' : ''}`;
      }
      const n2 = num(b);
      const p1 = pick(fam, n1, clause, segment, sentence, where);
      if (!p1) return m;
      // Обидва кінці — різні товари; якщо другий збігся з першим, беремо наступного
      let p2 = pick(fam, n2, clause, segment, sentence, where);
      if (p2 && p2.sku === p1.sku) p2 = pick(fam, n2, clause, segment, sentence, where, p1);
      if (!p2) return m;
      const [l2, h2] = [Math.min(p1.price, p2.price), Math.max(p1.price, p2.price)];
      const tok = l2 === lo && h2 === hi ? '{range}' : `{range:${p1.sku},${p2.sku}}`;
      log(shown, `${tok}${tail}`, `${fmt(l2)}–${fmt(h2)} грн${tail}`);
      return `${tok}${tail}${tail ? ' ' : ''}`;
    });

  return pass(pass(block, priceRx, ''), zaRx, ' за');
}

for (const file of ['lib/category-descriptions.ts', 'lib/category-descriptions-ru.ts']) {
  let src = readFileSync(file, 'utf8');
  const slugs = [...src.matchAll(/\n  '?([a-z0-9-]+)'?: \{/g)].map(m => m[1]);
  for (const slug of slugs) {
    if (ONLY.size && !ONLY.has(slug)) continue;
    const range = blockRange(src, slug);
    if (!range) continue;
    const block = src.slice(range[0], range[1]);
    if (!/грн|\d{2,5} за /.test(block)) continue;
    const fam = familyProducts(slug);
    if (!fam.length) { report.unmapped.push(`${file} ${slug}: у родині немає товарів із ціною`); continue; }
    const where = `${file.includes('-ru') ? 'ru' : 'uk'} ${slug}`;
    const next = tokenizeBlock(block, fam, where);
    if (next === block) continue;
    // Контроль: усі токени розв'язуються поточними цінами (нічого не випадає)
    const un: string[] = [];
    resolveText(next, { bySku, family: fam.map(p => p.price), count: fam.length }, un);
    if (un.length) throw new Error(`${where}: токени не розв'язались: ${un.join(', ')}`);
    src = src.slice(0, range[0]) + next + src.slice(range[1]);
  }
  if (APPLY) writeFileSync(file, src);
}

console.log(`замінено: ${report.replaced.length}${APPLY ? ' (записано)' : ' (dry-run)'}\n  ${report.replaced.join('\n  ')}`);
if (report.ambiguous.length) console.log(`\nнеоднозначно (${report.ambiguous.length}):\n  ${report.ambiguous.join('\n  ')}`);
if (report.unmapped.length) console.log(`\nне ціна товару, лишено як текст (${report.unmapped.length}):\n  ${report.unmapped.join('\n  ')}`);
