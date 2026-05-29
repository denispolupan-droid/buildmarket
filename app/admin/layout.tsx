import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import AdminSidebar from '../components/admin/AdminSidebar';
import PoDraftManagerLoader from './PoDraftManagerLoader';
import ReceiptDraftManagerLoader from './ReceiptDraftManagerLoader';
import OrderDraftManagerLoader from './OrderDraftManagerLoader';
import PageTransition from './PageTransition';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role ?? '';
  if (!user || !['admin', 'manager'].includes(role)) redirect('/');

  const [{ count: newOrdersCount }, { count: chatUnread }] = await Promise.all([
    serviceClient.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    serviceClient.from('chat_sessions').select('*', { count: 'exact', head: true }).gt('unread_count', 0),
  ]);

  // ── User label for sidebar ──────────────────────────────────────────────────
  const rawName   = user.user_metadata?.name ?? user.user_metadata?.full_name ?? '';
  const firstName = rawName.trim().split(/\s+/)[0] || user.email?.split('@')[0] || '';
  const userLabel = role === 'admin'
    ? 'Адміністратор'
    : firstName ? `Менеджер ${firstName}` : 'Менеджер';

  return (
    <div className="admin-layout" style={{ display: 'flex', minHeight: '100vh', background: '#EEF2F7' }}>
      <AdminSidebar newOrdersCount={newOrdersCount ?? 0} chatUnreadCount={chatUnread ?? 0} userLabel={userLabel} />
      <PageTransition>{children}</PageTransition>
      <PoDraftManagerLoader />
      <ReceiptDraftManagerLoader />
      <OrderDraftManagerLoader />
    </div>
  );
}
