import GuideClient from './GuideClient';
import { requireStaffPage } from '../../../../lib/auth-guard';

// Статична сторінка — жодних звернень ні до GSC, ні до БД: увесь вміст
// зібраний із тих самих констант, що й довідка на екранах.
export default async function SeoGuidePage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  return <GuideClient />;
}
