import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import AdminSidebar from '../components/admin/AdminSidebar';
import PoDraftManagerLoader from './PoDraftManagerLoader';
import PageTransition from './PageTransition';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const STATUS_KEYS = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const;

  const [orderResults, { count: chatUnread }] = await Promise.all([
    Promise.all(
      STATUS_KEYS.map(s =>
        serviceClient.from('orders').select('*', { count: 'exact', head: true }).eq('status', s)
      )
    ),
    serviceClient.from('chat_sessions').select('*', { count: 'exact', head: true }).gt('unread_count', 0),
  ]);

  const statusCounts: Record<string, number> = {};
  STATUS_KEYS.forEach((s, i) => { statusCounts[s] = orderResults[i].count ?? 0; });

  return (
    <div className="admin-layout" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-soft)' }}>
      <AdminSidebar newOrdersCount={statusCounts.new ?? 0} statusCounts={statusCounts} chatUnreadCount={chatUnread ?? 0} />
      <PageTransition>{children}</PageTransition>
      <PoDraftManagerLoader />
    </div>
  );
}
