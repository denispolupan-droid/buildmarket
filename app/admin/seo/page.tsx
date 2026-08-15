import QueriesClient from './QueriesClient';

export const dynamic = 'force-dynamic';

// Стартовий екран розділу — запити з Search Console і дожим під них.
// Дані вантажаться на клієнті: повний звіт GSC займає секунди, і краще
// показати сторінку з індикатором, ніж тримати рендер.
export default function SeoQueriesPage() {
  return <QueriesClient />;
}
