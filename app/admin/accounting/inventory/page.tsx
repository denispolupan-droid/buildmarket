import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import InventoryClient from './InventoryClient';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1000px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <Link href="/admin/accounting/stock" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <ClipboardCheck size={18} color="#1E3A5F" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Інвентаризація
        </h1>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px 28px' }}>
        Перерахуйте фактичні залишки: нестача спишеться за FIFO-собівартістю, надлишок
        оприбуткується новою партією; різниця ляже на рахунок «Відхилення». Створюється
        документ «Інвентаризація» з відомістю розбіжностей.
      </p>
      <InventoryClient />
    </div>
  );
}
