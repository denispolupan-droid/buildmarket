import { loadProductQueue } from '../../../../lib/seo/product-gaps';
import ProductQueueClient from './ProductQueueClient';

export const dynamic = 'force-dynamic';

export default async function SeoProductsPage() {
  const { items, total } = await loadProductQueue();
  return <ProductQueueClient items={items} total={total} />;
}
