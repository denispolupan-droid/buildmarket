import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { THIN_DESCRIPTION_CHARS } from '../../../lib/catalog-enricher';
import SeoQueueClient, { type QueueItem } from './SeoQueueClient';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export default async function SeoQueuePage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const [{ data: products }, { data: charRows }, faqRes] = await Promise.all([
    serviceClient
      .from('products')
      .select('sku, name, brand, category_slug, description_full, description_full_ru, name_ru, description_ru, keywords, image')
      .eq('is_active', true)
      .order('category_slug')
      .order('sku'),
    serviceClient.from('product_characteristics').select('product_sku'),
    // Таблиця product_faq може ще не існувати (до міграції 048) — не валимо сторінку
    serviceClient.from('product_faq').select('product_sku, question_ru'),
  ]);

  const hasChars = new Set((charRows ?? []).map(r => r.product_sku));
  const faqRows = faqRes.error ? [] : faqRes.data ?? [];
  const hasFaq = new Set(faqRows.map(r => r.product_sku));
  const hasUntranslatedFaq = new Set(faqRows.filter(r => !r.question_ru).map(r => r.product_sku));

  const items: QueueItem[] = (products ?? []).map(p => ({
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    category: p.category_slug ?? '',
    gaps: {
      thinDesc: (p.description_full ?? '').length < THIN_DESCRIPTION_CHARS,
      noFaq: !hasFaq.has(p.sku),
      ruDesc: (p.description_full_ru ?? '').length < THIN_DESCRIPTION_CHARS || hasUntranslatedFaq.has(p.sku),
      noRu: !p.name_ru || !p.description_ru,
      noKeywords: !p.keywords,
      noChars: !hasChars.has(p.sku),
      noImage: !p.image,
    },
  }));

  return <SeoQueueClient items={items} faqTableReady={!faqRes.error} />;
}
