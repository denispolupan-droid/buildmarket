import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import ProcurementClient from './ProcurementClient';
import ProcurementList from './ProcurementList';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);


function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

export default async function ProcurementPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const [{ data: pos }, { data: suppliers }, { data: receipts }] = await Promise.all([
    db.from('open_purchase_orders').select('*').limit(200),
    db.from('suppliers').select('id, name').eq('is_active', true).order('name'),
    db.from('acc_documents')
      .select('id, doc_number, doc_date, status, total_cost, parent_doc_id, notes')
      .in('doc_type', ['receipt', 'stock_in'])
      .eq('status', 'confirmed')
      .not('parent_doc_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const receiptMap = new Map<string, typeof receipts>(); // parent_doc_id → receipts
  for (const r of (receipts ?? [])) {
    if (!r.parent_doc_id) continue;
    if (!receiptMap.has(r.parent_doc_id)) receiptMap.set(r.parent_doc_id, []);
    receiptMap.get(r.parent_doc_id)!.push(r);
  }

  const orders = pos ?? [];
  const totalDrafts   = orders.filter(p => p.procurement_status === 'draft').length;
  const totalPending  = orders.filter(p => !p.has_receipt && p.procurement_status !== 'draft').length;
  const totalReceived = orders.filter(p => p.has_receipt && p.procurement_status !== 'paid').length;
  const totalAmount = orders.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);

  // Розбивка суми по статусах
  const amountDrafts   = orders.filter(p => p.procurement_status === 'draft').reduce((s, p) => s + Number(p.total_cost ?? 0), 0);
  const amountPending  = orders.filter(p => !p.has_receipt && p.procurement_status !== 'draft').reduce((s, p) => s + Number(p.total_cost ?? 0), 0);
  const amountReceived = orders.filter(p => p.has_receipt && p.procurement_status !== 'paid').reduce((s, p) => s + Number(p.total_cost ?? 0), 0);

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Закупівля</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Відкриті замовлення постачальникам — від відправки до оплати
          </p>
        </div>
        <ProcurementClient suppliers={suppliers ?? []} />
      </div>

      {/* Stats — клікабельні картки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
        <a href="/admin/procurement?filter=draft" style={{ textDecoration: 'none' }}>
          <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid #94A3B8', cursor: 'pointer' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#64748B' }}>{totalDrafts}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Чернетки</div>
          </div>
        </a>
        <a href="/admin/procurement?filter=pending" style={{ textDecoration: 'none' }}>
          <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid #4880B8', cursor: 'pointer' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--brand-blue)' }}>{totalPending}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Очікуємо товар</div>
          </div>
        </a>
        <a href="/admin/procurement?filter=received" style={{ textDecoration: 'none' }}>
          <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid #D97706', cursor: 'pointer' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#D97706' }}>{totalReceived}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Отримано, не оплачено</div>
          </div>
        </a>
        <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid #7C3AED' }}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#7C3AED' }}>{fmt(totalAmount)} ₴</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', marginBottom: '8px' }}>Загальна сума</div>
          {/* Розбивка по статусах */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {amountDrafts > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#94A3B8' }}>📝 Чернетки</span>
                <span style={{ color: '#64748B', fontWeight: 600 }}>{fmt(amountDrafts)} ₴</span>
              </div>
            )}
            {amountPending > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#94A3B8' }}>⏳ Очікуємо</span>
                <span style={{ color: '#4880B8', fontWeight: 600 }}>{fmt(amountPending)} ₴</span>
              </div>
            )}
            {amountReceived > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#94A3B8' }}>📦 Отримано</span>
                <span style={{ color: '#D97706', fontWeight: 600 }}>{fmt(amountReceived)} ₴</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <ProcurementList orders={orders.map(po => ({ ...po, receipts: receiptMap.get(po.id) ?? [] }))} />
    </div>
  );
}
