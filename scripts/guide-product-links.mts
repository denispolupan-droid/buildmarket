/**
 * Разово (07.11.2026): згадування товарів у гайдах категорій «Як вибрати» →
 * посилання на товар [Ceresit CS 25](/product/1005-025). Адресу за артикулом на
 * рендері замінює канонічна (lib/seo/guide-links); знятий товар стає текстом.
 *
 *   npx tsx scripts/guide-product-links.mts            — звіт (нічого не пише)
 *   npx tsx scripts/guide-product-links.mts --apply    — записати в category_content
 *
 * Як шукаємо: «Бренд + до 5 слів» поза наявними посиланнями й токенами {…};
 * найдовша фраза, яка дослівно (без лапок і регістру) є в назві товару цього
 * бренду. Варіантів (кольори, фасовки) буває кілька — беремо базовий: найкоротша
 * назва, далі менший артикул. У розділі — лише перше згадування товару і не
 * більше 3 посилань на товари. Звіт: <scratchpad>/guide-product-links.md
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import fs from 'node:fs';

const apply = process.argv.includes('--apply');
const reportPath = process.argv.find(a => a.startsWith('--report='))?.slice(9) ?? 'guide-product-links.md';
const { createServiceClient } = await import('../lib/supabase-service');
const db = createServiceClient();

type P = { sku: string; name: string; brand: string; category_slug: string | null };
const products: P[] = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from('products').select('sku, name, brand, category_slug').eq('is_active', true).order('sku').range(f, f + 999);
  if (error) throw error;
  products.push(...(data as P[]));
  if (!data || data.length < 1000) break;
}
// Родина категорії (вона + нащадки) — товар шукаємо спершу в ній: «Lacrysil санітарний»
// у гайді силіконових — це силіконовий, а не акриловий санітарний (найкоротша назва).
const { data: cats, error: catErr } = await db.from('categories').select('slug, parent_slug').limit(1000);
if (catErr) throw catErr;
const childrenOf = new Map<string, string[]>();
const parentOf = new Map<string, string | null>();
for (const c of cats as { slug: string; parent_slug: string | null }[]) {
  parentOf.set(c.slug, c.parent_slug);
  if (c.parent_slug) childrenOf.set(c.parent_slug, [...(childrenOf.get(c.parent_slug) ?? []), c.slug]);
}
function family(slug: string): Set<string> {
  const out = new Set<string>([slug]);
  const stack = [slug];
  while (stack.length) for (const ch of childrenOf.get(stack.pop()!) ?? []) if (!out.has(ch)) { out.add(ch); stack.push(ch); }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[«»"“”„']/g, '').replace(/[’ʼ`]/g, "'").replace(/\s+/g, ' ').trim();
const UNIT_END = /\s(кг|г|л|мл|м|м²|шт|см|мм)$/;
const SKIP = new Set(['сталь']);
const STOP_END = new Set(['і', 'й', 'та', 'або', 'для', 'в', 'у', 'на', 'з', 'із', 'зі', 'до', 'по', 'и', 'или', 'с', 'со', 'от', 'під', 'над', '—', '–', '-']);
const byBrand = new Map<string, P[]>();
for (const p of products) {
  const b = p.brand.trim();
  if (!b || SKIP.has(b.toLowerCase())) continue;
  byBrand.set(b, [...(byBrand.get(b) ?? []), p]);
}
const brands = [...byBrand.keys()].sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (hay: string, needle: string) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(needle)}(?![\\p{L}\\p{N}])`, 'u').test(hay);

/** Діапазони тексту, які не чіпаємо: наявні посилання й токени цін. */
function protectedRanges(t: string): [number, number][] {
  return [...t.matchAll(/\[[^\]]+\]\([^)\s]+\)|\{[^}]*\}/g)].map(m => [m.index!, m.index! + m[0].length]);
}

type Hit = { start: number; end: number; text: string; sku: string; name: string; variants: number };

function findHits(para: string, guideSlug: string): Hit[] {
  const own = family(guideSlug);
  const parent = parentOf.get(guideSlug);
  const near = parent ? family(parent) : own;
  const prot = protectedRanges(para);
  const inProt = (i: number) => prot.some(([a, b]) => i >= a && i < b);
  const hits: Hit[] = [];
  for (const brand of brands) {
    // Кома/двокрапка/крапка між цифрами — частина назви («TN 3,5х25», «1:9»), а не кінець
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(brand)}((?:\\s+(?:[^\\s,;:()—–.!?]|[,:.](?=\\d))+){0,5})`, 'giu');
    for (const m of para.matchAll(re)) {
      const start = m.index!;
      if (inProt(start)) continue;
      const brandText = para.slice(start, start + brand.length);
      const tokens = (m[1] ?? '').trim().split(/\s+/).filter(Boolean);
      for (let k = tokens.length; k >= 1; k--) {
        const tail = tokens.slice(0, k);
        if (STOP_END.has(tail[k - 1].toLowerCase().replace(/[«»"“”„]/g, ''))) continue;
        // «Lacrysil на основі …» — обрізок опису, а не назва моделі
        if (['на', 'з', 'із', 'по', 'від', 'на основі'].includes(tail[0].toLowerCase())) continue;
        const phrase = `${brandText} ${tail.join(' ')}`;
        // Лапки мають бути парними: «Lacrysil «для» — уламок назви, а не назва
        if ((phrase.match(/«/g) ?? []).length !== (phrase.match(/»/g) ?? []).length) continue;
        if ((phrase.match(/["“”„]/g) ?? []).length % 2) continue;
        const n = norm(phrase);
        // A: «Бренд модель» дослівно в назві. B: бренд і модель окремо — «Lacrysil
        // «60 секунд»» проти «Піна-клей Lacrysil побутова '60 секунд'». Для B модель
        // має бути відмітною: з літерами й (цифрою або в лапках), і не «25 кг».
        const tailRaw = tail.join(' ');
        const tailN = norm(tailRaw);
        const distinctive = /\p{L}/u.test(tailN) && (/\d/.test(tailN) || /[«"“']/.test(tailRaw)) && tailN.length >= 3 && !UNIT_END.test(` ${tailN}`);
        const brandN = norm(brand);
        // Лише цілими словами: інакше «Knauf TN 3» знаходив шуруп «XTN 3,9»
        const cands = byBrand.get(brand)!.filter(p => {
          const nm = norm(p.name);
          return hasWord(nm, n) || (distinctive && hasWord(nm, brandN) && hasWord(nm, tailN));
        });
        if (!cands.length) continue;
        // Кінець фрази в тексті: знаходимо її дослівно від start (пробіли могли бути подвійні)
        const rest = para.slice(start);
        const exact = new RegExp(`^${tail.reduce((acc, t) => `${acc}\\s+${esc(t)}`, esc(brandText))}`, 'u').exec(rest);
        if (!exact) continue;
        const end = start + exact[0].length;
        if (prot.some(([a, b]) => start < b && end > a)) continue;
        // Спершу з категорії гайда, далі з сусідніх (той самий батько), далі будь-які
        const inOwn = cands.filter(p => p.category_slug && own.has(p.category_slug));
        const inNear = cands.filter(p => p.category_slug && near.has(p.category_slug));
        const pool = inOwn.length ? inOwn : inNear.length ? inNear : cands;
        const pick = [...pool].sort((a, b) => a.name.length - b.name.length || a.sku.localeCompare(b.sku))[0];
        hits.push({ start, end, text: exact[0], sku: pick.sku, name: pick.name, variants: pool.length });
        break;
      }
    }
  }
  // Перекриття (довший бренд уже покрив) — лишаємо раніший/довший
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Hit[] = [];
  for (const h of hits) if (!out.some(o => h.start < o.end && h.end > o.start)) out.push(h);
  return out;
}

type Row = { slug: string; lang: 'uk' | 'ru'; guide: { title: string; sections: { h: string; p: string[] }[] } | null };
const { data: rows, error } = await db.from('category_content').select('slug, lang, guide').limit(1000);
if (error) throw error;

const report: string[] = ['# Посилання на товари в гайдах — що буде додано', ''];
let total = 0;
const updates: { slug: string; lang: string; guide: Row['guide'] }[] = [];
for (const r of (rows as Row[]).sort((a, b) => a.slug.localeCompare(b.slug) || a.lang.localeCompare(b.lang))) {
  if (!r.guide) continue;
  const lines: string[] = [];
  const sections = r.guide.sections.map(sec => {
    // Повторний запуск не має лінкувати друге згадування: наявні посилання на товари
    // розділу вже рахуються («перше» вже зайняте) і входять у ліміт 3
    const existing = [...sec.p.join('\n').matchAll(/\]\(\/product\/([^)\s]+)\)/g)].map(m => decodeURIComponent(m[1]));
    const seen = new Set<string>(existing);
    let count = existing.length;
    const p = sec.p.map(para => {
      const hits = findHits(para, r.slug).filter(h => {
        if (seen.has(h.sku) || count >= 3) return false;
        seen.add(h.sku); count++; return true;
      });
      let outPara = para;
      for (const h of [...hits].sort((a, b) => b.start - a.start)) {
        outPara = outPara.slice(0, h.start) + `[${h.text}](/product/${h.sku})` + outPara.slice(h.end);
        lines.push(`| ${sec.h} | ${h.text} | ${h.sku} | ${h.name}${h.variants > 1 ? ` _(+${h.variants - 1} варіант.)_` : ''} |`);
      }
      return outPara;
    });
    return { ...sec, p };
  });
  if (!lines.length) continue;
  total += lines.length;
  report.push(`## ${r.slug} (${r.lang}) — ${lines.length}`, '', '| Розділ | Текст | Артикул | Товар |', '|---|---|---|---|', ...lines, '');
  updates.push({ slug: r.slug, lang: r.lang, guide: { ...r.guide, sections } });
}
report.splice(1, 0, `Усього посилань: ${total} у ${updates.length} гайдах.`, '');
fs.writeFileSync(reportPath, report.join('\n'), 'utf8');
console.log(`Знайдено ${total} посилань у ${updates.length} гайдах. Звіт: ${reportPath}`);

if (apply) {
  for (const u of updates) {
    const { error: e } = await db.from('category_content').update({ guide: u.guide, updated_at: new Date().toISOString() })
      .eq('slug', u.slug).eq('lang', u.lang);
    if (e) console.error(u.slug, u.lang, e.message);
  }
  console.log('Записано. Кеш контенту оновиться протягом години або після /api/revalidate з тегом category-content.');
} else {
  console.log('Пробний прогін — нічого не записано (додайте --apply).');
}
