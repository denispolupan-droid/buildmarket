import type { Metadata } from 'next';
import NotFoundBody from './components/NotFoundBody';
import { getCategoriesCached, getProductsLightCached } from '../lib/supabase';
import { categoriesWithProducts } from '../lib/seo/meta';

export const metadata: Metadata = {
  title: 'Сторінку не знайдено',
  // robots не задаємо: Next сам додає <meta name="robots" content="noindex"/>
  // для not-found — власний тег давав дубль
  // У 404 немає канонічної адреси. Кореневий layout canonical більше не задає,
  // але явний null лишаємо — щоб тег не з'явився знову, якщо хтось поверне.
  alternates: { canonical: null },
};

// 404 із виходами: кореневі категорії з товаром і блог, обома мовами (мову
// визначає клієнт за адресою). Дані кешовані, тому сторінка лишається дешевою;
// якщо база недоступна — показуємо 404 без списку, а не 500.
export default async function NotFound() {
  let categories: { slug: string; name: string }[] = [];
  try {
    const [cats, products] = await Promise.all([getCategoriesCached(), getProductsLightCached()]);
    const live = categoriesWithProducts(cats, products);
    categories = cats.filter(c => !c.parent_slug && live.has(c.slug)).map(c => ({ slug: c.slug, name: c.name }));
  } catch { /* 404 без списку категорій */ }
  return <NotFoundBody categories={categories} />;
}
