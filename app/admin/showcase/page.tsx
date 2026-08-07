import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import ShowcaseClient from './ShowcaseClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Вітрина' };

export default async function ShowcasePage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) redirect('/');

  // Дані тягне сам клієнт: набір міняється рідко, а екран відкривають з наміром
  // редагувати — зайвий серверний прохід тут нічого не пришвидшує.
  return <ShowcaseClient canEdit={user.app_metadata?.role === 'admin'} />;
}
