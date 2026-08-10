import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';
import { isMpDescriptionClean, languageSlips } from '../../../../../lib/marketplace-description';
import { generateMpUA, translateMpRU } from '../../../../../lib/marketplace-description-gen';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Скільки товарів обробляємо за один виклик — щоб не впертися в ліміт часу роута. */
const MAX_BATCH = 20;

type Result = { sku: string; ok: boolean; length?: number; error?: string };

/**
 * Перегенерувати опис для маркетплейсу і записати в products.description_mp.
 *
 * Це і є «полагодити по кнопці» для відмов модерації через текст (згадка
 * стороннього ресурсу, стоп-слова): подати заявку окремо не можна й не треба —
 * Rozetka сама заведе нову, коли прочитає змінений фід. Наша частина: чистий текст.
 *
 * Фото цією кнопкою не лікується: там потрібне інше зображення, а не інші слова.
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as { skus?: unknown };
  const skus = Array.isArray(body.skus) ? body.skus.filter((s): s is string => typeof s === 'string') : [];
  if (!skus.length) return NextResponse.json({ error: 'Не передано жодного артикулу' }, { status: 400 });
  if (skus.length > MAX_BATCH) {
    return NextResponse.json({ error: `За раз можна перегенерувати не більше ${MAX_BATCH} товарів` }, { status: 400 });
  }

  const { data: products, error } = await db
    .from('products')
    .select('sku, name, brand, category_slug, characteristics:product_characteristics(label, value, sort_order)')
    .in('sku', skus);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: cats } = await db.from('categories').select('slug, name');
  const catName = new Map((cats ?? []).map(c => [c.slug as string, c.name as string]));

  type Row = {
    sku: string; name: string; brand: string; category_slug: string | null;
    characteristics: { label: string; value: string; sort_order: number }[] | null;
  };

  const results: Result[] = await Promise.all(((products ?? []) as unknown as Row[]).map(async p => {
    const chars = [...(p.characteristics ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => ({ label: c.label, value: c.value }));
    try {
      const ua = await generateMpUA(
        { sku: p.sku, name: p.name, brand: p.brand, chars },
        catName.get(p.category_slug ?? '') ?? p.category_slug ?? '',
      );
      // Записуємо лише чистий текст: інакше замість однієї відмови модерації
      // отримаємо другу, вже за нашим підписом.
      if (!isMpDescriptionClean(ua)) return { sku: p.sku, ok: false, error: 'у тексті лишились згадки магазину' };
      const ru = await translateMpRU(ua);
      if (!isMpDescriptionClean(ru)) return { sku: p.sku, ok: false, error: 'у перекладі лишились згадки магазину' };

      const slips = [...languageSlips(ua, 'uk', p.name), ...languageSlips(ru, 'ru', p.name)];
      const { error: uerr } = await db.from('products')
        .update({ description_mp: ua, description_mp_ru: ru }).eq('sku', p.sku);
      if (uerr) throw uerr;
      return { sku: p.sku, ok: true, length: ua.length, ...(slips.length ? { error: `слова не тією мовою: ${slips.join(', ')}` } : {}) };
    } catch (e) {
      return { sku: p.sku, ok: false, error: (e as Error).message };
    }
  }));

  const missing = skus.filter(s => !results.some(r => r.sku === s));
  return NextResponse.json({
    ok: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results: [...results, ...missing.map(sku => ({ sku, ok: false, error: 'товар не знайдено' }))],
  });
}
