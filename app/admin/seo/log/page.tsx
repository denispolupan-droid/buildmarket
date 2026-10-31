import LogClient from './LogClient';
import { requireStaffPage } from '../../../../lib/auth-guard';

export const dynamic = 'force-dynamic';

export default async function SeoLogPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  return <LogClient />;
}
