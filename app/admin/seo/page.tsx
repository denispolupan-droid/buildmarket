import QueriesClient from './QueriesClient';
import { requireStaffPage } from '../../../lib/auth-guard';

export const dynamic = 'force-dynamic';

// Стартовий екран розділу — запити з Search Console і дожим під них.
// Дані вантажаться на клієнті: повний звіт GSC займає секунди, і краще
// показати сторінку з індикатором, ніж тримати рендер.
export default async function SeoQueriesPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  return <QueriesClient />;
}
