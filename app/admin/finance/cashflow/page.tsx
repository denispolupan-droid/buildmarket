import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, Banknote } from 'lucide-react';
import CashflowClient, { type CashflowEntry } from './CashflowClient';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const params = await searchParams;
  const now    = new Date();
  const from   = params.from ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to     = params.to   ?? now.toISOString().slice(0, 10);

  // ── 1. Fetch cash/bank/acquiring entries for the period ──────────────────────
  const { data: rawEntries } = await db
    .from('money_entries')
    .select('id, txn_id, account_type, amount, description, business_date, doc_id, doc_type, created_at')
    .in('account_type', ['cash', 'bank', 'acquiring'])
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: false })
    .order('created_at',    { ascending: false });

  // ── 2. Opening balance = sum of all entries BEFORE period start ───────────────
  const { data: prevEntries } = await db
    .from('money_entries')
    .select('amount')
    .in('account_type', ['cash', 'bank', 'acquiring'])
    .lt('business_date', from);

  const openingBalance = (prevEntries ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);

  // ── 3. Doc numbers ─────────────────────────────────────────────────────────
  const docIds = [...new Set((rawEntries ?? []).map(e => e.doc_id).filter(Boolean))] as string[];
  const { data: docs } = docIds.length
    ? await db.from('acc_documents').select('id, doc_number, doc_type').in('id', docIds)
    : { data: [] };
  const docMap = new Map((docs ?? []).map(d => [d.id, d]));

  // ── 4. Counterparty names via partner entries ────────────────────────────────
  const txnIds = [...new Set((rawEntries ?? []).map(e => e.txn_id))];

  const { data: partnerEntries } = txnIds.length
    ? await db
        .from('money_entries')
        .select('txn_id, account_type, counterparty_id')
        .in('txn_id', txnIds)
        .not('counterparty_id', 'is', null)
    : { data: [] };

  // Build txn → counterparty map (take first non-null per txn)
  const txnPartyMap = new Map<string, { accountType: string; partyId: string }>();
  for (const pe of (partnerEntries ?? [])) {
    if (!txnPartyMap.has(pe.txn_id)) {
      txnPartyMap.set(pe.txn_id, { accountType: pe.account_type, partyId: pe.counterparty_id });
    }
  }

  // Supplier ids (numeric strings)
  const supplierIds = [...new Set(
    [...txnPartyMap.values()]
      .filter(p => p.accountType === 'supplier')
      .map(p => Number(p.partyId))
      .filter(n => !isNaN(n))
  )];
  const { data: suppliers } = supplierIds.length
    ? await db.from('suppliers').select('id, name').in('id', supplierIds)
    : { data: [] };
  const supplierMap = new Map((suppliers ?? []).map(s => [String(s.id), s.name as string]));

  // Customer ids (UUID strings) — look up both profiles (website users) and customers (admin CRM)
  const customerIds = [...new Set(
    [...txnPartyMap.values()]
      .filter(p => ['customer', 'advance', 'partner'].includes(p.accountType))
      .map(p => p.partyId)
  )];
  const { data: profiles } = customerIds.length
    ? await db.from('profiles').select('id, full_name, company_name').in('id', customerIds)
    : { data: [] };
  const { data: crmCustomers } = customerIds.length
    ? await db.from('customers').select('id, name, company').in('id', customerIds)
    : { data: [] };

  const nameMap = new Map<string, string>();
  for (const p of (profiles ?? [])) {
    nameMap.set(p.id, (p.company_name || p.full_name || 'Клієнт') as string);
  }
  for (const c of (crmCustomers ?? [])) {
    if (!nameMap.has(c.id)) nameMap.set(c.id, (c.company || c.name || 'Клієнт') as string);
  }

  // ── 5. Assemble entries ───────────────────────────────────────────────────────
  const entries: CashflowEntry[] = (rawEntries ?? []).map(e => {
    const doc    = docMap.get(e.doc_id ?? '');
    const party  = txnPartyMap.get(e.txn_id);
    let counterparty: string | null = null;
    if (party) {
      if (party.accountType === 'supplier') {
        counterparty = supplierMap.get(party.partyId) ?? null;
      } else {
        counterparty = nameMap.get(party.partyId) ?? null;
      }
    }

    return {
      id:            e.id,
      txn_id:        e.txn_id,
      account_type:  e.account_type as CashflowEntry['account_type'],
      amount:        Number(e.amount),
      description:   e.description,
      business_date: e.business_date,
      doc_id:        e.doc_id ?? null,
      doc_type:      doc?.doc_type ?? e.doc_type ?? null,
      doc_number:    doc?.doc_number ?? null,
      counterparty,
    };
  });

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <TrendingUp size={18} color="#1D4ED8" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Рух коштів
        </h1>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>каса · банк · еквайринг</span>
      </div>

      {/* Quick link to cash register */}
      <div style={{ marginBottom: '20px' }}>
        <Link href="/admin/finance/cashflow/cash" style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          height: '36px', padding: '0 16px', borderRadius: '8px', textDecoration: 'none',
          background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D',
          fontSize: '13px', fontWeight: 600,
        }}>
          <Banknote size={14} /> Відкрити касову книгу →
        </Link>
      </div>

      <CashflowClient
        entries={entries}
        openingBalance={openingBalance}
        defaultFrom={from}
        defaultTo={to}
      />
    </div>
  );
}
