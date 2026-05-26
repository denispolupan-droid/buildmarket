import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CreditCard } from 'lucide-react';
import PayablesClient, { type PayablePO, type SupplierGroup } from './PayablesClient';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function PayablesPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const today = new Date().toISOString().slice(0, 10);

  // ── 1. Непоплачені підтверджені PO ─────────────────────────────────────────
  const UNPAID_STATUSES = ['sent', 'confirmed_by_supplier', 'partially_received', 'received', 'invoiced'];

  const { data: pos } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_date, supplier_id, procurement_status, total_cost, meta')
    .eq('doc_type', 'purchase_order')
    .eq('status', 'confirmed')
    .in('procurement_status', UNPAID_STATUSES)
    .order('doc_date', { ascending: true });

  if (!pos?.length) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            <ArrowLeft size={16} />
          </Link>
          <CreditCard size={18} color="#1E3A5F" />
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Кредиторка</h1>
        </div>
        <PayablesClient groups={[]} />
      </div>
    );
  }

  // ── 2. Фактично оплачені суми з money_entries (по doc_id PO) ──────────────
  const poIds = pos.map(p => p.id);
  const { data: paymentEntries } = await db
    .from('money_entries')
    .select('doc_id, amount')
    .in('doc_id', poIds)
    .eq('account_type', 'supplier')
    .gt('amount', 0); // дебет supplier = оплата (зменшення боргу)

  // Сума оплат по кожному PO
  const paidMap = new Map<string, number>();
  for (const e of (paymentEntries ?? [])) {
    paidMap.set(e.doc_id, (paidMap.get(e.doc_id) ?? 0) + Number(e.amount));
  }

  // ── 3. Назви постачальників ────────────────────────────────────────────────
  const supplierIds = [...new Set(pos.map(p => p.supplier_id).filter(Boolean))] as number[];
  const { data: suppliers } = supplierIds.length
    ? await db.from('suppliers').select('id, name').in('id', supplierIds)
    : { data: [] };
  const supplierMap = new Map((suppliers ?? []).map(s => [s.id, s.name as string]));

  // ── 4. Складаємо рядки PO ──────────────────────────────────────────────────
  const poRows: PayablePO[] = pos.map(p => {
    const meta         = (p.meta ?? {}) as Record<string, unknown>;
    const deferDate    = (meta.payment_defer_date as string | null) ?? null;
    const paidAmount   = paidMap.get(p.id) ?? 0;
    const totalCost    = Number(p.total_cost ?? 0);
    const outstanding  = Math.max(0, totalCost - paidAmount);

    let daysOverdue = 0;
    if (deferDate) {
      const diff = new Date(today).getTime() - new Date(deferDate).getTime();
      daysOverdue = Math.round(diff / 86400000);
    }

    return {
      id:                 p.id,
      doc_number:         p.doc_number,
      doc_date:           p.doc_date,
      supplier_id:        p.supplier_id,
      supplier_name:      supplierMap.get(p.supplier_id) ?? `Постачальник #${p.supplier_id}`,
      procurement_status: p.procurement_status,
      total_cost:         totalCost,
      paid_amount:        paidAmount,
      outstanding,
      payment_defer_date: deferDate,
      days_overdue:       daysOverdue,
    };
  }).filter(p => p.outstanding > 0.01); // пропускаємо повністю оплачені

  // ── 5. Групуємо по постачальнику ──────────────────────────────────────────
  const groupMap = new Map<number, SupplierGroup>();
  for (const po of poRows) {
    if (!groupMap.has(po.supplier_id)) {
      groupMap.set(po.supplier_id, {
        supplier_id:       po.supplier_id,
        supplier_name:     po.supplier_name,
        total_outstanding: 0,
        overdue:           0,
        pos:               [],
      });
    }
    const g = groupMap.get(po.supplier_id)!;
    g.total_outstanding += po.outstanding;
    if (po.days_overdue > 0) g.overdue += po.outstanding;
    g.pos.push(po);
  }

  // Сортуємо: спочатку з простроченнями, потім за сумою
  const groups: SupplierGroup[] = [...groupMap.values()]
    .sort((a, b) => (b.overdue - a.overdue) || (b.total_outstanding - a.total_outstanding));

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <CreditCard size={18} color="#1E3A5F" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Кредиторка
        </h1>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          розрахунки з постачальниками
        </span>
      </div>

      <PayablesClient groups={groups} />
    </div>
  );
}
