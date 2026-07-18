import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, PackageCheck } from 'lucide-react';
import NewReceiptButton from './NewReceiptButton';
import ReceiptsWrapper from './ReceiptsWrapper';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);


export default async function ReceiptsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: receipts } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_date, status, total_cost, notes, parent_doc_id, landed_cost_total, meta, warehouse:warehouse_id(name), supplier:supplier_id(id, name), parent_doc:parent_doc_id(meta)')
    .in('doc_type', ['receipt', 'stock_in'])
    .eq('status', 'confirmed')
    .order('doc_date', { ascending: false })
    .limit(300);

  const rows = receipts ?? [];

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Закупівля</h1>
        <NewReceiptButton />
      </div>

      {/* Sub-section tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[
          { href: '/admin/procurement',          label: 'Замовлення постачальнику', icon: ShoppingCart, active: false },
          { href: '/admin/procurement/receipts', label: 'Приходи товару',           icon: PackageCheck, active: true  },
        ].map(tab => (
          <Link key={tab.href} href={tab.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            height: '34px', padding: '0 16px', borderRadius: '8px',
            textDecoration: 'none', fontSize: '13px', fontWeight: tab.active ? 700 : 500,
            background: tab.active ? '#1E3A5F' : 'var(--bg-card)',
            color: tab.active ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${tab.active ? '#1E3A5F' : 'var(--border)'}`,
          }}>
            <tab.icon size={14} />
            {tab.label}
          </Link>
        ))}
      </div>

      <ReceiptsWrapper rows={rows as unknown as Parameters<typeof ReceiptsWrapper>[0]['rows']} />
    </div>
  );
}
