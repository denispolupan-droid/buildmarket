import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { THIN_DESCRIPTION_CHARS } from '../../../lib/catalog-enricher';
import { CATEGORY_META } from '../../../lib/category-descriptions';
import { CATEGORY_META_RU } from '../../../lib/category-descriptions-ru';
import { auditCategories } from '../../../lib/seo/category-audit';
import SeoQueueClient, { type QueueItem } from './SeoQueueClient';
import CategoryAudit from './CategoryAudit';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export default async function SeoQueuePage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  // Supabase обрізає вибірки до 1000 рядків — службові таблиці тягнемо посторінково
  async function fetchAll<T>(table: string, columns: string): Promise<{ rows: T[]; ok: boolean }> {
    const rows: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await serviceClient.from(table).select(columns).range(from, from + 999);
      if (error) return { rows, ok: false }; // напр., product_faq до міграції 048
      rows.push(...(data ?? []) as T[]);
      if (!data || data.length < 1000) return { rows, ok: true };
    }
  }

  const [{ data: products }, charsRes, faqRes, dictRes, catCharsRes, catsRes] = await Promise.all([
    serviceClient
      .from('products')
      .select('sku, slug, name, brand, category_slug, description_full, description_full_ru, name_ru, description_ru, keywords, image')
      .eq('is_active', true)
      .order('category_slug')
      .order('sku'),
    fetchAll<{ product_sku: string; label: string }>('product_characteristics', 'product_sku, label'),
    fetchAll<{ product_sku: string; question_ru: string | null }>('product_faq', 'product_sku, question_ru'),
    fetchAll<{ label: string; aliases: string[] }>('characteristic_definitions', 'label, aliases'),
    fetchAll<{ category_slug: string; required: boolean; characteristic_definitions: { label: string } | null }>(
      'category_characteristics', 'category_slug, required, characteristic_definitions(label)'),
    fetchAll<{ slug: string; name: string; parent_slug: string | null }>('categories', 'slug, name, parent_slug'),
  ]);

  // Опубліковані статті — щоб зловити blogSlug, який веде в 404
  const { data: blogRows } = await serviceClient
    .from('blog_posts')
    .select('slug')
    .eq('is_published', true);

  // Словник: normKey(аліас|канон) → канонічний лейбл; обов'язкові набори по категоріях
  const normKey = (s: string) => s.replace(/['`´ʼ']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const aliasMap = new Map<string, string>();
  for (const d of dictRes.rows) {
    aliasMap.set(normKey(d.label), d.label);
    for (const a of d.aliases ?? []) aliasMap.set(normKey(a), d.label);
  }
  const requiredByCat = new Map<string, string[]>();
  for (const r of catCharsRes.rows) {
    if (!r.required || !r.characteristic_definitions) continue;
    if (!requiredByCat.has(r.category_slug)) requiredByCat.set(r.category_slug, []);
    requiredByCat.get(r.category_slug)!.push(r.characteristic_definitions.label);
  }

  // По кожному товару: канонічні лейбли + лейбли поза словником
  const charsBySku = new Map<string, { canon: Set<string>; dirty: boolean }>();
  for (const c of charsRes.rows) {
    if (!charsBySku.has(c.product_sku)) charsBySku.set(c.product_sku, { canon: new Set(), dirty: false });
    const entry = charsBySku.get(c.product_sku)!;
    const canon = aliasMap.get(normKey(c.label));
    if (canon) {
      entry.canon.add(canon);
      if (canon !== c.label) entry.dirty = true; // синонім/апостроф — треба нормалізувати
    } else if (normKey(c.label) === 'сфера застосування') {
      // legacy-лейбл, канонізується за значенням — покриває обидві цілі
      entry.canon.add('Тип використання');
      entry.canon.add('Область застосування');
      entry.dirty = true;
    }
    // інші лейбли поза словником — легальні додаткові, dirty не ставимо
  }

  const faqRows = faqRes.ok ? faqRes.rows : [];
  const hasFaq = new Set(faqRows.map(r => r.product_sku));
  const hasUntranslatedFaq = new Set(faqRows.filter(r => !r.question_ru).map(r => r.product_sku));

  const items: QueueItem[] = (products ?? []).map(p => {
    const chars = charsBySku.get(p.sku);
    const required = requiredByCat.get(p.category_slug ?? '') ?? [];
    const missingLabels = chars ? required.filter(l => !chars.canon.has(l)) : required;
    return {
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      category: p.category_slug ?? '',
      missingLabels: chars ? missingLabels : [],
      gaps: {
        thinDesc: (p.description_full ?? '').length < THIN_DESCRIPTION_CHARS,
        noFaq: !hasFaq.has(p.sku),
        ruDesc: (p.description_full_ru ?? '').length < (p.description_full ?? '').length * 0.75 || hasUntranslatedFaq.has(p.sku),
        noRu: !p.name_ru || !p.description_ru,
        noKeywords: !p.keywords,
        noChars: !chars,
        missingRequired: !!chars && missingLabels.length > 0,
        dirtyChars: !!chars?.dirty,
        noImage: !p.image,
      },
    };
  });

  // Категорійний зріз: чи не розійшовся текст категорії з фактичним асортиментом
  const categoryRows = auditCategories({
    categories: catsRes.rows,
    products: (products ?? []).map(p => ({ category_slug: p.category_slug, brand: p.brand })),
    metaUa: CATEGORY_META,
    metaRu: CATEGORY_META_RU,
    brands: [...new Set((products ?? []).map(p => p.brand).filter(Boolean))] as string[],
    blogSlugs: (blogRows ?? []).map(b => b.slug),
  });

  return (
    <>
      <CategoryAudit rows={categoryRows} />
      <SeoQueueClient items={items} faqTableReady={faqRes.ok} />
    </>
  );
}
