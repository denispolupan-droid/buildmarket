import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import ModerationClient from './ModerationClient';

export const metadata = { title: 'Модерація контенту Rozetka — Адмін' };

export default async function RozetkaModerationPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role;
  if (!user || (role !== 'admin' && role !== 'manager')) redirect('/');

  // Дані тягне клієнт: запит у кабінет Rozetka йде 8+ сторінок і займає секунди,
  // а сторінка має відкриватися одразу — зі спінером, а не з білим екраном.
  return <ModerationClient />;
}
