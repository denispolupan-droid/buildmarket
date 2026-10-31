import { redirect } from 'next/navigation';
import { requireStaffPage } from '../../../lib/auth-guard';

// Розділ обʼєднано з чатом сайту: /admin/chat, вкладка «Маркетплейси».
export default async function MarketplaceChatsPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — для admin і manager (аудит 31.10.2026)
  await requireStaffPage('admin', 'manager');
  redirect('/admin/chat?tab=mp');
}
