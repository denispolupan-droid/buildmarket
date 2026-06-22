import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CreditCard } from 'lucide-react';
import PayablesClient, { type SupplierBalance } from './PayablesClient';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function PayablesPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  // 1. Всі проводки по рахунку постачальника
  const { data: entries } = await db
    .from('money_entries')
    .select('counterparty_id, doc_type, amount, business_date, description, doc_id')
    .eq('account_type', 'supplier')
    .not('counterparty_id', 'is', null)
    .order('business_date', { ascending: true });

  // 2. Номери документів
  const docIds = [...new Set((entries ?? []).map(e => e.doc_id).filter(Boolean))];
  const { data: docs } = docIds.length
    ? await db.from('acc_documents').select('id, doc_number, doc_type').in('id', docIds)
    : { data: [] };
  const docMap = new Map((docs ?? []).map(d => [d.id as string, { number: d.doc_number as string | null, type: d.doc_type as string }]));

  // 3. Назви постачальників
  const supplierIds = [...new Set(
    (entries ?? []).map(e => parseInt(e.counterparty_id as string)).filter(n => !isNaN(n))
  )];
  const { data: suppliers } = supplierIds.length
    ? await db.from('suppliers').select('id, name').in('id', supplierIds)
    : { data: [] };
  const supplierNameMap = new Map((suppliers ?? []).map(s => [s.id as number, s.name as string]));

  // 4. Агрегація per постачальник
  const aggMap = new Map<number, SupplierBalance>();
  for (const e of (entries ?? [])) {
    const supplierId = parseInt(e.counterparty_id as string);
    if (isNaN(supplierId)) continue;

    if (!aggMap.has(supplierId)) {
      aggMap.set(supplierId, {
        supplier_id:    supplierId,
        supplier_name:  supplierNameMap.get(supplierId) ?? `Постачальник #${supplierId}`,
        total_receipts: 0,
        total_payments: 0,
        balance:        0,
        transactions:   [],
      });
    }

    const agg = aggMap.get(supplierId)!;
    const amt = Number(e.amount);
    agg.balance += amt;
    if (amt < 0) agg.total_receipts += Math.abs(amt);
    else          agg.total_payments += amt;

    const docInfo = e.doc_id ? docMap.get(e.doc_id as string) : null;
    agg.transactions.push({
      doc_type:      e.doc_type as string,
      amount:        amt,
      business_date: e.business_date as string,
      description:   e.description as string,
      doc_id:        (e.doc_id as string) ?? null,
      doc_number:    docInfo?.number ?? null,
      acc_doc_type:  docInfo?.type  ?? null,
    });
  }

  // Сортуємо: спочатку найбільший борг (balance найменший = ми найбільше винні)
  const balances: SupplierBalance[] = [...aggMap.values()]
    .filter(b => Math.abs(b.balance) > 0.01)
    .sort((a, b) => a.balance - b.balance);

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <CreditCard size={18} color="#1E3A5F" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Взаєморозрахунки з постачальниками
        </h1>
      </div>

      <PayablesClient balances={balances} />
    </div>
  );
}
