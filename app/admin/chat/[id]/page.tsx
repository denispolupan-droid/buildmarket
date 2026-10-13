import { redirect } from 'next/navigation';

// Колишня окрема сторінка чату сайту. Листування тепер живе у правій панелі
// розділу «Чати»; старі посилання (Telegram-сповіщення «Новий чат») ведуть туди ж.
export default async function ChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/chat?chat=${encodeURIComponent(`site:${id}`)}`);
}
