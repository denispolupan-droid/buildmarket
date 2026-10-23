import Link from 'next/link';
import { createServiceClient } from '../../../../lib/supabase';
import { requireStaffPage } from '../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { SELLER } from '../../../../lib/company';
import {
  accountsFor, buildMutualStatement, counterpartyRefString, parseCounterpartyRef, specialLabel,
  SETTLEMENT_ACCOUNT_LABEL, type CounterpartyRef, type LedgerEntry, type SettlementAccount,
} from '../../../../lib/accounting/mutual-settlements';
import FinanceTabs from '../FinanceTabs';
import ActClient, { type ActRow } from '../_act/ActClient';
import CounterpartyPicker from './CounterpartyPicker';

export const dynamic = 'force-dynamic';

type Counterparty = {
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  /** Баланс кабінету дропшипера — для порівняння з рахунком `partner` */
  cabinetBalance: number | null;
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Хто кому винен — словами, бо знак у взаєморозрахунках читають по-різному. */
function balanceWords(v: number): { text: string; color: string } {
  if (Math.abs(v) < 0.005) return { text: 'розрахунки закриті', color: 'var(--text-muted)' };
  return v > 0
    ? { text: 'винні нам', color: '#15803D' }
    : { text: 'винні ми', color: '#B45309' };
}

function chunks<T>(arr: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadCounterparty(db: ReturnType<typeof createServiceClient>, ref: CounterpartyRef): Promise<Counterparty | null> {
  if (ref.kind === 'special') {
    return { name: specialLabel(ref.id), legalName: null, taxId: null, address: null, cabinetBalance: null };
  }
  if (ref.kind === 'supplier') {
    const { data } = await db.from('suppliers').select('name, legal_name, edrpou').eq('id', Number(ref.id)).maybeSingle();
    return data ? { name: data.name as string, legalName: data.legal_name as string | null, taxId: data.edrpou as string | null, address: null, cabinetBalance: null } : null;
  }
  const { data } = await db.from('customers')
    .select('name, company, legal_name, tax_number, city, address, type, balance')
    .eq('id', ref.id).maybeSingle();
  if (!data) return null;
  return {
    name: (data.company as string | null)?.trim() || (data.legal_name as string | null)?.trim() || (data.name as string),
    legalName: data.legal_name as string | null,
    taxId: data.tax_number as string | null,
    address: [data.city, data.address].filter(Boolean).join(', ') || null,
    cabinetBalance: data.type === 'dropship_partner' ? Number(data.balance ?? 0) : null,
  };
}

export default async function MutualSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ cp?: string; from?: string; to?: string; internal?: string }>;
}) {
  await requireStaffPage('admin');
  const sp = await searchParams;
  const db = createServiceClient();

  const today      = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dateFrom = isDate(sp.from) ? sp.from! : monthStart;
  const dateTo   = isDate(sp.to)   ? sp.to!   : today;
  const showInternal = sp.internal === '1';

  const ref = parseCounterpartyRef(sp.cp);
  const counterparty = ref ? await loadCounterparty(db, ref) : null;

  let body: React.ReactNode = (
    <div className="fin-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
      {sp.cp && !counterparty ? 'Контрагента не знайдено' : 'Оберіть контрагента — клієнта, партнера, постачальника чи службового дебітора'}
    </div>
  );

  if (ref && counterparty) {
    const accounts = accountsFor(ref);
    // Усе з пагінацією й ORDER BY id: PostgREST мовчки обрізає на 1000 рядків,
    // і сальдо на початок тихо «пливе» (інциденти 30.08 і 29.09).
    const [openingRows, entries] = await Promise.all([
      fetchAllRows<{ account_type: SettlementAccount; amount: number }>((f, t) => db.from('money_entries')
        .select('account_type, amount')
        .in('account_type', accounts)
        .eq('counterparty_id', ref.id)
        .lt('business_date', dateFrom)
        .order('id').range(f, t)),
      fetchAllRows<LedgerEntry>((f, t) => db.from('money_entries')
        .select('id, txn_id, account_type, amount, doc_type, business_date, created_at, description, doc_id, order_id, reversal_of:meta->>reversal_of')
        .in('account_type', accounts)
        .eq('counterparty_id', ref.id)
        .gte('business_date', dateFrom)
        .lte('business_date', dateTo)
        .order('id').range(f, t)),
    ]);

    const opening: Partial<Record<SettlementAccount, number>> = {};
    for (const r of openingRows) opening[r.account_type] = (opening[r.account_type] ?? 0) + Number(r.amount);

    const st = buildMutualStatement({ accounts, opening, entries, showInternal });

    // Номери документів і замовлень — щоб рядок акта знаходився з обох боків
    const docIds = [...new Set(st.rows.map(r => r.doc_id).filter(Boolean))] as string[];
    const ordIds = [...new Set(st.rows.map(r => r.order_id).filter(Boolean))] as string[];
    const [docParts, ordParts] = await Promise.all([
      Promise.all(chunks(docIds).map(ids => db.from('acc_documents').select('id, doc_number, doc_type').in('id', ids).limit(ids.length))),
      Promise.all(chunks(ordIds).map(ids => db.from('orders').select('id, order_number').in('id', ids).limit(ids.length))),
    ]);
    const docMap = new Map(docParts.flatMap(p => p.data ?? []).map(d => [d.id as string, { number: d.doc_number as string | null, type: d.doc_type as string }]));
    const ordMap = new Map(ordParts.flatMap(p => p.data ?? []).map(o => [o.id as string, o.order_number as number]));

    const rows: ActRow[] = st.rows.map(r => {
      const doc = r.doc_id ? docMap.get(r.doc_id) : undefined;
      const orderNumber = r.order_id ? (ordMap.get(r.order_id) ?? null) : null;
      const refs = [doc?.number, orderNumber != null ? `#${orderNumber}` : null].filter(Boolean).join(', ');
      let docHref: string | null = null;
      if (r.doc_type === 'debt_adjustment' && r.doc_id) docHref = `/admin/finance/adjustments?id=${r.doc_id}`;
      else if (doc?.type === 'receipt' || doc?.type === 'stock_in') docHref = `/admin/procurement/receipts/${r.doc_id}`;
      else if (doc?.type === 'purchase_order') docHref = `/admin/procurement/${r.doc_id}`;
      else if (doc) docHref = `/admin/accounting/documents/${r.doc_id}`;
      return {
        date:        r.business_date,
        docText:     `${r.label}${refs ? ` (${refs})` : ''}`,
        description: [accounts.length > 1 ? SETTLEMENT_ACCOUNT_LABEL[r.account_type] : null, r.description].filter(Boolean).join(' — '),
        // Дебет — на нашу користь (відвантаження, наша оплата постачальнику), кредит — навпаки
        debit:       r.amount > 0 ? r.amount : 0,
        credit:      r.amount < 0 ? -r.amount : 0,
        docHref,
        orderNumber,
      };
    });

    // Рахунки без руху й без сальдо не показуємо: у клієнта, що не дропшипер,
    // картка «Баланс партнера» була б вічним нулем
    const shownAccounts = st.accounts.filter(a => Math.abs(a.opening) > 0.005 || a.debit > 0.005 || a.credit > 0.005);
    const totalWords = balanceWords(st.closing);
    const qsBase = new URLSearchParams({ cp: counterpartyRefString(ref), from: dateFrom, to: dateTo });
    const toggleInternal = new URLSearchParams(qsBase);
    if (!showInternal) toggleInternal.set('internal', '1');

    body = (
      <>
        <div className="act-no-print fin-kpi-row" style={{ gridTemplateColumns: `repeat(${shownAccounts.length + 1}, minmax(0, 1fr))`, marginBottom: '12px' }}>
          {shownAccounts.map(a => {
            const w = balanceWords(a.closing);
            return (
              <div key={a.account} className="fin-card fin-kpi">
                <div className="fin-kpi-label">{SETTLEMENT_ACCOUNT_LABEL[a.account]}</div>
                <div className="fin-money-val" style={{ color: w.color }}>{fmt(Math.abs(a.closing))} ₴</div>
                <div className="fin-money-sub">{w.text} на {dateTo.split('-').reverse().join('.')}</div>
                <div className="fin-hint">
                  початок {fmt(a.opening)} · дебет {fmt(a.debit)} · кредит {fmt(a.credit)}
                </div>
                {a.account === 'partner' && counterparty.cabinetBalance != null && (
                  <div className="fin-hint">
                    У кабінеті партнера: {fmt(counterparty.cabinetBalance)} ₴. Сьогоднішні цифри розходяться на суму замовлень у дорозі:
                    кабінет списує їх при оформленні, облік — при врученні.
                  </div>
                )}
              </div>
            );
          })}
          <div className="fin-card fin-kpi" style={{ borderColor: '#1E3A5F' }}>
            <div className="fin-kpi-label">Сальдо взаєморозрахунків</div>
            <div className="fin-money-val" style={{ color: totalWords.color }}>{fmt(Math.abs(st.closing))} ₴</div>
            <div className="fin-money-sub">{totalWords.text} на {dateTo.split('-').reverse().join('.')}</div>
            <div className="fin-hint">на початок періоду: {fmt(st.opening)} ₴ (плюс — на нашу користь)</div>
          </div>
        </div>

        {(st.hiddenInternal > 0 || showInternal) && (
          <div className="act-no-print fin-hint" style={{ margin: '0 0 4px', fontSize: '12px' }}>
            {showInternal
              ? 'Показано внутрішні заліки між рахунками контрагента і сторновані проводки. '
              : `Сховано рядків: ${st.hiddenInternal} — внутрішні заліки авансу партнера і проводки разом з їх сторно (у сумі нуль, на сальдо не впливають). `}
            <Link href={`/admin/finance/mutual?${toggleInternal}`} className="fin-hint-toggle">
              {showInternal ? 'Сховати' : 'Показати'}
            </Link>
          </div>
        )}

        <ActClient
          counterpartyName={counterparty.name}
          counterpartyLegalName={counterparty.legalName}
          counterpartyTaxId={counterparty.taxId}
          counterpartyAddress={counterparty.address}
          dateFrom={dateFrom}
          dateTo={dateTo}
          opening={st.opening}
          rows={rows}
          ourName={SELLER.name}
          ourSigner={SELLER.signatory || SELLER.name.replace(/^ФОП\s+/, '')}
          mode={ref.kind === 'supplier' ? 'supplier' : 'customer'}
        />
      </>
    );
  }

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div className="act-no-print">
        <div style={{ marginBottom: '14px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Взаєморозрахунки</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Усі розрахунки з контрагентом за період в одній виписці — і акт звірки на друк
          </p>
        </div>
        <FinanceTabs />
        <div style={{ margin: '20px 0 16px' }}>
          <CounterpartyPicker
            value={ref && counterparty ? { ref: counterpartyRefString(ref), label: counterparty.name } : null}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </div>
      </div>
      {body}
    </div>
  );
}
