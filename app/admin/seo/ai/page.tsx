import AiClient from './AiClient';
import { requireStaffPage } from '../../../../lib/auth-guard';

export const dynamic = 'force-dynamic';

export default async function SeoAiPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  return <AiClient />;
}
