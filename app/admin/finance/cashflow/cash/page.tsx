import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import FinanceTabs from '../../FinanceTabs';
import CashRegisterClient, { type CashEntry } from './CashRegisterClient';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function CashRegisterPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const now       = new Date();
  const from      = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today     = now.toISOString().slice(0, 10);

  // ── Записи за поточний місяць ──────────────────────────────────────────────
  const { data: rawEntries } = await db
    .from('money_entries')
    .select('id, txn_id, amount, description, business_date, doc_id, doc_type, created_at, meta')
    .eq('account_type', 'cash')
    .gte('business_date', from)
    .lte('business_date', today)
    .order('business_date', { ascending: false })
    .order('created_at',    { ascending: false });

  // ── Відкриваючий залишок (все до початку місяця) ───────────────────────────
  const { data: prevEntries } = await db
    .from('money_entries')
    .select('amount')
    .eq('account_type', 'cash')
    .lt('business_date', from);

  const openingBalance = (prevEntries ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);

  // ── Поточний залишок (всі записи за всю історію) ──────────────────────────
  const { data: allEntries } = await db
    .from('money_entries')
    .select('amount')
    .eq('account_type', 'cash');

  const currentBalance = (allEntries ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);

  // ── Номери документів ──────────────────────────────────────────────────────
  const docIds = [...new Set((rawEntries ?? []).map(e => e.doc_id).filter(Boolean))] as string[];
  const { data: docs } = docIds.length
    ? await db.from('acc_documents').select('id, doc_number, doc_type').in('id', docIds)
    : { data: [] };
  const docMap = new Map((docs ?? []).map(d => [d.id, d]));

  // ── Контрагенти через partner entries (той самий txn_id) ──────────────────
  const txnIds = [...new Set((rawEntries ?? []).map(e => e.txn_id))];
  const { data: partnerEntries } = txnIds.length
    ? await db
        .from('money_entries')
        .select('txn_id, account_type, counterparty_id')
        .in('txn_id', txnIds)
        .not('counterparty_id', 'is', null)
    : { data: [] };

  const txnPartyMap = new Map<string, { accountType: string; partyId: string }>();
  for (const pe of (partnerEntries ?? [])) {
    if (!txnPartyMap.has(pe.txn_id)) {
      txnPartyMap.set(pe.txn_id, { accountType: pe.account_type, partyId: pe.counterparty_id });
    }
  }

  const supplierIds = [...new Set(
    [...txnPartyMap.values()]
      .filter(p => p.accountType === 'supplier')
      .map(p => Number(p.partyId)).filter(n => !isNaN(n))
  )];
  const { data: suppliers } = supplierIds.length
    ? await db.from('suppliers').select('id, name').in('id', supplierIds)
    : { data: [] };
  const supplierMap = new Map((suppliers ?? []).map(s => [String(s.id), s.name as string]));

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

  // ── Складаємо записи ───────────────────────────────────────────────────────
  const entries: CashEntry[] = (rawEntries ?? []).map(e => {
    const doc   = docMap.get(e.doc_id ?? '');
    const party = txnPartyMap.get(e.txn_id);
    const meta  = (e.meta ?? {}) as Record<string, unknown>;
    let counterparty: string | null = null;
    if (party) {
      counterparty = party.accountType === 'supplier'
        ? (supplierMap.get(party.partyId) ?? null)
        : (nameMap.get(party.partyId) ?? null);
    }
    return {
      id:            e.id,
      txn_id:        e.txn_id,
      amount:        Number(e.amount),
      description:   e.description,
      business_date: e.business_date,
      doc_id:        e.doc_id ?? null,
      doc_type:      doc?.doc_type ?? e.doc_type ?? null,
      doc_number:    doc?.doc_number ?? null,
      counterparty,
      is_manual:     meta.manual === true,
    };
  });

  const monthLabel = now.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Каса
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          {monthLabel} · готівкові операції (ПКО / РКО)
        </p>
      </div>

      <FinanceTabs />

      <div style={{ height: '20px' }} />

      <CashRegisterClient
        entries={entries}
        openingBalance={openingBalance}
        currentBalance={currentBalance}
      />
    </div>
  );
}
