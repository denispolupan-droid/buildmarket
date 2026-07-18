import { getCategoriesCached, getTopBrandsCached } from '../../lib/supabase';
import FooterView from './FooterView';

// Тонкий серверний загрузчик: тягне кешовані категорії/бренди й віддає їх у клієнтський
// FooterView. Раніше Footer сам викликав await headers() (для визначення мови) — це робило
// кожну сторінку з ним динамічною і ламало ISR. Тепер мову визначає FooterView на клієнті.
export default async function Footer() {
  const [categories, topBrands] = await Promise.all([
    getCategoriesCached(),
    getTopBrandsCached(),
  ]);
  return <FooterView categories={categories} topBrands={topBrands} />;
}
