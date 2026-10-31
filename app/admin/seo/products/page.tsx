import { loadProductQueue } from '../../../../lib/seo/product-gaps';
import ProductQueueClient from './ProductQueueClient';
import { requireStaffPage } from '../../../../lib/auth-guard';

export const dynamic = 'force-dynamic';

export default async function SeoProductsPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  const { items, total } = await loadProductQueue();
  return <ProductQueueClient items={items} total={total} />;
}
