import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { fetchAllRows } from '../../../../lib/db-paginate';
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
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  // 1. Всі проводки по рахунку постачальника (пагінація: money_entries росте безмежно,
  //    без range() PostgREST мовчки обрізав би на 1000 → неправильні баланси постачальників)
  const entries = await fetchAllRows((f, t) => db
    .from('money_entries')
    .select('counterparty_id, doc_type, amount, business_date, description, doc_id')
    .eq('account_type', 'supplier')
    .not('counterparty_id', 'is', null)
    .order('business_date', { ascending: true })
    .range(f, t));

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

  // AP-aging: старіння непогашеного боргу. Оплати (дебети) погашають борги
  // (кредити) за FIFO від найстарішого; залишки бакетуються за віком.
  function computeAging(txns: { amount: number; business_date: string }[]) {
    const debts: { date: string; left: number }[] = [];
    let payPool = 0;
    for (const t of txns) {           // транзакції вже відсортовані за датою asc
      if (t.amount < 0) debts.push({ date: t.business_date, left: -t.amount });
      else payPool += t.amount;
    }
    for (const d of debts) {
      if (payPool <= 0) break;
      const use = Math.min(d.left, payPool);
      d.left -= use; payPool -= use;
    }
    const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
    let oldest: string | null = null;
    const nowMs = Date.now();
    for (const d of debts) {
      if (d.left <= 0.005) continue;
      if (!oldest) oldest = d.date;
      const age = Math.floor((nowMs - new Date(d.date).getTime()) / 86400000);
      if (age <= 30) buckets.d0_30 += d.left;
      else if (age <= 60) buckets.d31_60 += d.left;
      else if (age <= 90) buckets.d61_90 += d.left;
      else buckets.d90p += d.left;
    }
    return { ...buckets, oldest_date: oldest };
  }

  for (const agg of aggMap.values()) {
    if (agg.balance < -0.005) agg.aging = computeAging(agg.transactions);
  }

  // Сортуємо: спочатку найбільший борг (balance найменший = ми найбільше винні)
  // Не фільтруємо по балансу тут — клієнт сам вирішує що показати (при фільтрі по даті може бути 0)
  const balances: SupplierBalance[] = [...aggMap.values()]
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
