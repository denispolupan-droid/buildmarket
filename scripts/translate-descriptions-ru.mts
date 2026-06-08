/**
 * Перевод description_full (укр → рус) через Google Translate без API-ключа.
 * Заполняет description_full_ru и description_ru для товаров где их нет.
 *
 * Использование: npx tsx --env-file=.env.local scripts/translate-descriptions-ru.mts [limit]
 */

import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const limit = Number(process.argv[2] ?? 999);

async function googleTranslate(text: string, from = 'uk', to = 'ru'): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as unknown[][];
  const parts = (data[0] as unknown[][]).map((chunk) => (chunk as string[])[0]).filter(Boolean);
  return parts.join('');
}

// Пауза чтобы не попасть под rate limit
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const { data: products, error } = await db
  .from('products')
  .select('sku, name, name_ru, brand, description, description_full, description_ru, description_full_ru')
  .or('description_full_ru.is.null,description_full_ru.eq.,description_ru.is.null,description_ru.eq.')
  .eq('is_active', true)
  .order('sort_order')
  .limit(limit);

if (error) { console.error('DB error:', error); process.exit(1); }
if (!products?.length) { console.log('✅ Нечего переводить.'); process.exit(0); }

console.log(`\n🌐 Переводчик описаний (Google Translate укр→рус)`);
console.log(`   Найдено ${products.length} товаров\n`);

let done = 0, errors = 0;

for (const p of products) {
  const nameRu = (p as { name_ru?: string | null }).name_ru ?? p.name;
  const needShort = !(p as { description_ru?: string | null }).description_ru;
  const needFull  = !(p as { description_full_ru?: string | null }).description_full_ru;

  const flags = [needShort && 'short', needFull && 'full'].filter(Boolean).join('+');
  process.stdout.write(`[${done + errors + 1}/${products.length}] ${p.sku} — ${nameRu.slice(0, 50)} [${flags}]\n`);

  try {
    const update: Record<string, string> = {};

    if (needShort && p.description) {
      const translated = await googleTranslate(p.description);
      update.description_ru = translated;
      await sleep(300);
    }

    if (needFull && (p as { description_full?: string | null }).description_full) {
      const src = (p as { description_full?: string | null }).description_full!;
      // Длинные тексты разбиваем на части по 1000 символов
      const chunks: string[] = [];
      for (let i = 0; i < src.length; i += 1000) chunks.push(src.slice(i, i + 1000));
      const translated = (await Promise.all(chunks.map(c => googleTranslate(c)))).join('');
      update.description_full_ru = translated;
      await sleep(400);
    }

    if (Object.keys(update).length) {
      const { error: dbErr } = await db.from('products').update(update).eq('sku', p.sku);
      if (dbErr) throw dbErr;
      console.log(`  ✓ ${(update.description_full_ru ?? update.description_ru ?? '').slice(0, 90)}...\n`);
    }

    done++;
  } catch (err) {
    console.log(`  ✗ ${err}\n`);
    errors++;
    await sleep(2000); // При ошибке ждём дольше
  }
}

console.log(`\n✅ Готово: ${done} переведено, ${errors} ошибок`);
