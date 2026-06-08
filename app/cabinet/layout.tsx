import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../lib/supabase-server';
import { getRole } from '../../lib/user-role';
import CabinetSidebar from './CabinetSidebar';

export const metadata: Metadata = {
  title: 'Кабінет | FIXLINE',
  robots: { index: false, follow: false },
};

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/cabinet');

  const role = getRole(user);
  if (role !== 'dropship') redirect('/account');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)', flexDirection: 'row', flexWrap: 'wrap' }}>
      <CabinetSidebar />
      <main className="cabinet-layout-main" style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
