import { redirect } from 'next/navigation';
import { requireStaffPage } from '../../../../lib/auth-guard';

// Колишня окрема сторінка чату сайту. Листування тепер живе у правій панелі
// розділу «Чати»; старі посилання (Telegram-сповіщення «Новий чат») ведуть туди ж.
export default async function ChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  const { id } = await params;
  redirect(`/admin/chat?chat=${encodeURIComponent(`site:${id}`)}`);
}
