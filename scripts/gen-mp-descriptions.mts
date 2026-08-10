/**
 * Генерація описів для маркетплейсів (products.description_mp / _mp_ru).
 *
 * Навіщо окремий текст — див. міграцію 093 і lib/marketplace-description.ts:
 * фіди більше не віддають той самий опис, що й сайт.
 *
 * За замовчуванням НІЧОГО не пише — лише друкує тексти на перегляд.
 * Запис вмикається прапорцем --write.
 *
 *   npx tsx --env-file=.env.local scripts/gen-mp-descriptions.mts --limit=10
 *   npx tsx --env-file=.env.local scripts/gen-mp-descriptions.mts --sku=1603-012,1802-002
 *   npx tsx --env-file=.env.local scripts/gen-mp-descriptions.mts --limit=999 --write
 */

import { createClient } from '@supabase/supabase-js';
// lib/*.ts для tsx — це CJS, і зі скрипта .mts модуль приходить загорнутим у
// default. Розгортаємо один раз тут, щоб решта коду не знала про цю різницю.
import * as pureNs from '../lib/marketplace-description';
import * as genNs from '../lib/marketplace-description-gen';
type PureModule = typeof import('../lib/marketplace-description');
type GenModule = typeof import('../lib/marketplace-description-gen');
const pure = ((pureNs as unknown as { default?: PureModule }).default ?? (pureNs as unknown as PureModule));
const gen = ((genNs as unknown as { default?: GenModule }).default ?? (genNs as unknown as GenModule));
const { isMpDescriptionClean, languageSlips, MP_MIN_CHARS, MP_MAX_CHARS } = pure;
const { generateMpUA, translateMpRU } = gen;

const args = process.argv.slice(2);
const arg = (n: string) => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const limit = Number(arg('limit') ?? 10);
const write = args.includes('--write');
const skuList = arg('sku')?.split(',').map(s => s.trim()).filter(Boolean);
const concurrency = Number(arg('concurrency') ?? 4);
/** --regen: переписати навіть тим, у кого MP-опис уже є */
const regen = args.includes('--regen');

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Row = {
  sku: string; name: string; brand: string; category_slug: string | null;
  characteristics: { label: string; value: string; sort_order: number }[] | null;
};

const { data: cats } = await db.from('categories').select('slug, name');
const catName = new Map((cats ?? []).map((c: { slug: string; name: string }) => [c.slug, c.name]));

let q = db.from('products')
  .select('sku, name, brand, category_slug, characteristics:product_characteristics(label, value, sort_order)')
  .eq('is_active', true);
if (skuList) {
  q = q.in('sku', skuList);
} else {
  // Усі активні товари, а не лише on_rozetka/on_prom: фіди навмисно віддають і
  // вимкнені позиції (available="false"), інакше маркетплейс лишає оголошення в
  // останньому стані. Тобто опис у фід поїде і в них — з тим самим дублем.
  q = q.order('sku').limit(limit);
  if (!regen) q = q.is('description_mp', null);
}

const { data, error } = await q;
if (error) throw error;
const rows = (data ?? []) as unknown as Row[];
console.log(`товарів у прогоні: ${rows.length}${write ? ' (ЗАПИС У БД)' : ' (без запису)'}\n`);

const stats = { ok: 0, fail: 0, dirty: 0, slips: 0, retried: 0, lens: [] as number[] };

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; stats.retried++; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
}

async function one(p: Row, idx: number) {
  const chars = [...(p.characteristics ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(c => ({ label: c.label, value: c.value }));
  try {
    // Модель зрідка повертає обрубок замість тексту (бачили опис на 8 знаків) —
    // друга спроба вирішує; без неї на 750 товарів це десятки порожніх карток.
    const ua = await withRetry(() => generateMpUA(
      { sku: p.sku, name: p.name, brand: p.brand, chars },
      catName.get(p.category_slug ?? '') ?? p.category_slug ?? '',
    ));
    const ru = await translateMpRU(ua);
    // Стоп-слова модерації перевіряємо ДО запису: текст зі згадкою магазину
    // Rozetka заблокує так само, як блокує зараз повні описи.
    const clean = isMpDescriptionClean(ua) && isMpDescriptionClean(ru);
    if (!clean) stats.dirty++;
    stats.ok++; stats.lens.push(ua.length);

    const slipsUa = languageSlips(ua, 'uk', p.name);
    const slipsRu = languageSlips(ru, 'ru', p.name);
    if (slipsUa.length || slipsRu.length) stats.slips++;

    console.log(`\n${'='.repeat(78)}\n[${idx + 1}] ${p.sku} — ${p.brand} ${p.name}`);
    console.log(`UA (${ua.length} знаків${clean ? '' : ', ⚠ СТОП-СЛОВА'}${slipsUa.length ? `, ⚠ не та мова: ${slipsUa.join(', ')}` : ''}):\n${ua}`);
    console.log(`\nRU (${ru.length}${slipsRu.length ? `, ⚠ не та мова: ${slipsRu.join(', ')}` : ''}):\n${ru}`);

    if (write && clean) {
      const { error: uerr } = await db.from('products')
        .update({ description_mp: ua, description_mp_ru: ru }).eq('sku', p.sku);
      if (uerr) throw uerr;
    }
  } catch (e) {
    stats.fail++;
    console.log(`\n[${idx + 1}] ${p.sku} — ПОМИЛКА: ${(e as Error).message}`);
  }
}

for (let i = 0; i < rows.length; i += concurrency) {
  await Promise.all(rows.slice(i, i + concurrency).map((p, j) => one(p, i + j)));
}

const avg = stats.lens.length ? Math.round(stats.lens.reduce((a, b) => a + b, 0) / stats.lens.length) : 0;
console.log(`\n${'='.repeat(78)}\nготово: ${stats.ok} ок, ${stats.fail} помилок, ${stats.dirty} зі стоп-словами (не записані), ${stats.slips} з мовними огріхами`);
if (stats.lens.length) {
  console.log(`довжина UA: середня ${avg}, від ${Math.min(...stats.lens)} до ${Math.max(...stats.lens)} (межі ${MP_MIN_CHARS}-${MP_MAX_CHARS})`);
}
