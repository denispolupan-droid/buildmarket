import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import BlogAdminClient from './BlogAdminClient';

export const dynamic = 'force-dynamic';

export default async function BlogAdminPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');
  return <BlogAdminClient />;
}
