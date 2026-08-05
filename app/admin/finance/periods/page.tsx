import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import FinanceTabs from '../FinanceTabs';
import PeriodsClient from './PeriodsClient';

export const dynamic = 'force-dynamic';

export default async function PeriodsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1100px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Облікові періоди
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Закритий місяць забороняє будь-які проводки з датою в ньому — звіти за нього стають остаточними.
          Закрити можна лише місяць з OK-інваріантами; поточний місяць закрити не можна.
        </p>
      </div>

      <FinanceTabs />

      <div style={{ marginTop: '20px' }}>
        <PeriodsClient />
      </div>
    </div>
  );
}
