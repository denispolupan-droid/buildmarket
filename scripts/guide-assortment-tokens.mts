/**
 * Разово (07.11.2026): перелік брендів у гайдах → токен {brands}, плюс речення
 * «Зараз у наявності: {top:3}.» у розділі «Де купити…». Так гайд сам іде за
 * асортиментом: зник бренд з каталогу — зник і з тексту; з'явився — потрапив
 * (lib/seo/guide-prices).
 *
 *   npx tsx scripts/guide-assortment-tokens.mts            — звіт
 *   npx tsx scripts/guide-assortment-tokens.mts --apply    — записати
 *
 * Чіпаємо лише розділ «Де купити / Где купить» і лише речення з «FIXLINE» —
 * це шаблонне «У FIXLINE <категорія> <бренди> коштують від …». Переліки в
 * поясненнях («професійні Ceresit і Pattex») навмисно лишаються: там це
 * твердження про конкретні бренди, а не перелік асортименту.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import fs from 'node:fs';

const apply = process.argv.includes('--apply');
const reportPath = process.argv.find(a => a.startsWith('--report='))?.slice(9) ?? 'guide-assortment-tokens.md';
const { createServiceClient } = await import('../lib/supabase-service');
const db = createServiceClient();

const brands = new Set<string>();
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from('products').select('brand').eq('is_active', true).order('sku').range(f, f + 999);
  if (error) throw error;
  for (const r of data as { brand: string | null }[]) if (r.brand?.trim()) brands.add(r.brand.trim());
  if (!data || data.length < 1000) break;
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = [...brands].sort((a, b) => b.length - a.length).map(esc).join('|');
// ≥2 брендів: «A, B і C» / «A і B» / «A, B та C» / «A, B и C»
const LIST = new RegExp(`(?<![\\p{L}\\p{N}])(?:${B})(?:\\s*,\\s*(?:${B}))*\\s+(?:і|та|и|й)\\s+(?:${B})(?![\\p{L}\\p{N}])`, 'giu');
const WHERE = /^(Де купити|Где купить)/i;

type Row = { slug: string; lang: 'uk' | 'ru'; guide: { title: string; sections: { h: string; p: string[] }[] } | null };
const { data: rows, error } = await db.from('category_content').select('slug, lang, guide').limit(1000);
if (error) throw error;

const report: string[] = ['# Асортимент у гайдах — {brands} і {top:3}', ''];
const updates: { slug: string; lang: string; guide: Row['guide'] }[] = [];
let nBrands = 0, nTop = 0, noWhere = 0;
for (const r of (rows as Row[]).sort((a, b) => a.slug.localeCompare(b.slug) || a.lang.localeCompare(b.lang))) {
  if (!r.guide) continue;
  const idx = r.guide.sections.findIndex(s => WHERE.test(s.h));
  if (idx < 0) { noWhere++; continue; }
  const sec = r.guide.sections[idx];
  const lines: string[] = [];
  const p = sec.p.map(para => para.split(/(?<=[.!?…])\s+/).map(sent => {
    if (!/FIXLINE/.test(sent) || sent.includes('{brands}')) return sent;
    const out = sent.replace(LIST, () => '{brands}');
    if (out !== sent) { nBrands++; lines.push(`- было: ${sent}`, `  стало: ${out}`); }
    return out;
  }).join(' '));
  if (!p.join(' ').includes('{top')) {
    const add = r.lang === 'ru' ? ' Сейчас в наличии: {top:3}.' : ' Зараз у наявності: {top:3}.';
    p[0] = p[0].trimEnd() + add;
    nTop++;
    lines.push(`- добавлено в конец 1-го абзаца:${add}`);
  }
  if (!lines.length) continue;
  report.push(`## ${r.slug} (${r.lang}) — «${sec.h}»`, '', ...lines, '');
  const sections = r.guide.sections.map((s, i) => (i === idx ? { ...s, p } : s));
  updates.push({ slug: r.slug, lang: r.lang, guide: { ...r.guide, sections } });
}
report.splice(1, 0, `Переліків брендів → {brands}: ${nBrands}. Рядків «у наявності» → {top:3}: ${nTop}. Гайдів без розділу «Де купити»: ${noWhere}.`, '');
fs.writeFileSync(reportPath, report.join('\n'), 'utf8');
console.log(`{brands}: ${nBrands}, {top:3}: ${nTop}, гайдів: ${updates.length}, без «Де купити»: ${noWhere}. Звіт: ${reportPath}`);

if (apply) {
  for (const u of updates) {
    const { error: e } = await db.from('category_content').update({ guide: u.guide, updated_at: new Date().toISOString() })
      .eq('slug', u.slug).eq('lang', u.lang);
    if (e) console.error(u.slug, u.lang, e.message);
  }
  console.log('Записано.');
} else {
  console.log('Пробний прогін — нічого не записано (додайте --apply).');
}
