import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import PeriodsClient from './PeriodsClient';

export const dynamic = 'force-dynamic';

export default async function PeriodsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '860px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <Lock size={18} color="#1E3A5F" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Закриття періодів
        </h1>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px 28px' }}>
        Закритий місяць забороняє будь-які проводки з датою в ньому — звіти за нього стають остаточними.
        Закрити можна лише місяць з OK-інваріантами; поточний місяць закрити не можна.
      </p>
      <PeriodsClient />
    </div>
  );
}
