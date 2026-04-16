import { getProducts, getCategories } from '../../lib/supabase';
import CatalogClient from './CatalogClient';

export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;

  const [products, categories] = await Promise.all([
    getProducts(),
    getCategories(),
  ]);

  return (
    <CatalogClient
      products={products}
      categories={categories}
      initialSearch={q ?? ''}
      initialCategory={category ?? ''}
    />
  );
}
