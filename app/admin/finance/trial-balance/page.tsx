import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { redirect } from 'next/navigation';
import FinanceTabs from '../FinanceTabs';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Оборотно-сальдова відомість: по кожному рахунку (і контрагенту для
// customer/supplier) — вхідне сальдо, обороти Дт/Кт за період, вихідне сальдо.
// Джерело — виключно money_entries (леджер подвійного запису).

const ACCOUNT_LABELS: Record<string, string> = {
  customer: 'Покупці (дебіторка)', supplier: 'Постачальники (кредиторка)',
  partner: 'Партнери', cash: 'Каса', bank: 'Банк', acquiring: 'Еквайринг',
  advance: 'Аванси', inventory_asset: 'Товарні запаси', revenue: 'Виручка',
  cogs: 'Собівартість', variance: 'Відхилення', rounding: 'Округлення',
  correction: 'Коригування', marketplace_balance: 'Баланс маркетплейсів',
  marketplace_fee: 'Комісії маркетплейсів', logistics: 'Логістика',
  loading: 'Навантаження', customs: 'Митниця', packaging: 'Пакування',
  acquiring_fee: 'Комісія еквайрингу', rent: 'Оренда', salary: 'Зарплата',
  marketing: 'Маркетинг', opex: 'Опер. витрати',
};

const SPECIAL_CP: Record<string, string> = {
  'np:cod': 'Нова Пошта (наложені платежі)',
  'mp:prom': 'Prom.ua (виплати)',
  'mp:rozetka': 'Rozetka (виплати)',
  'guest': 'Гостьові замовлення',
  'prom': 'Prom.ua', 'rozetka': 'Rozetka',
};

function fmt(n: number) {
  return Math.abs(n) < 0.005 ? '—' : n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function TrialBalancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const sp = await searchParams;
  const now = new Date();
  const defFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? '') ? sp.from! : defFrom;
  const to   = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? '')   ? sp.to!   : now.toISOString().slice(0, 10);

  type Entry = { account_type: string; counterparty_id: string | null; amount: number; business_date: string };
  const entries = await fetchAllRows<Entry>((f, t) => db
    .from('money_entries')
    .select('account_type, counterparty_id, amount, business_date')
    .lte('business_date', to)
    .order('id', { ascending: true })
    .range(f, t));

  // Агрегація: opening (до from), обороти в періоді
  type Agg = { opening: number; debit: number; credit: number };
  const byKey = new Map<string, Agg>(); // key = account|counterparty
  for (const e of entries) {
    const key = `${e.account_type}|${e.counterparty_id ?? ''}`;
    const a = byKey.get(key) ?? { opening: 0, debit: 0, credit: 0 };
    const amt = Number(e.amount);
    if (e.business_date < from) a.opening += amt;
    else if (amt >= 0) a.debit += amt;
    else a.credit += -amt;
    byKey.set(key, a);
  }

  // Імена контрагентів
  const cpIds = [...new Set([...byKey.keys()].map(k => k.split('|')[1]).filter(Boolean))];
  const supplierIds = cpIds.map(x => parseInt(x)).filter(n => !isNaN(n));
  const customerIds = cpIds.filter(x => /^[0-9a-f]{8}-/.test(x));
  const [{ data: sups }, { data: custs }] = await Promise.all([
    supplierIds.length ? db.from('suppliers').select('id, name').in('id', supplierIds) : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    customerIds.length ? db.from('customers').select('id, name, company').in('id', customerIds) : Promise.resolve({ data: [] as { id: string; name: string | null; company: string | null }[] }),
  ]);
  const supName = new Map((sups ?? []).map(s => [String(s.id), s.name]));
  const custName = new Map((custs ?? []).map(c => [c.id, c.company || c.name || c.id.slice(0, 8)]));

  function cpLabel(account: string, cp: string): string {
    if (!cp) return '';
    if (SPECIAL_CP[cp]) return SPECIAL_CP[cp];
    if (account === 'supplier') return supName.get(cp) ?? `Постачальник #${cp}`;
    return custName.get(cp) ?? cp.slice(0, 8);
  }

  // Групування по рахунку
  type Row = { cp: string; label: string; opening: number; debit: number; credit: number; closing: number };
  const accounts = new Map<string, Row[]>();
  for (const [key, a] of byKey) {
    const [account, cp] = key.split('|');
    const closing = a.opening + a.debit - a.credit;
    if (Math.abs(a.opening) < 0.005 && Math.abs(a.debit) < 0.005 && Math.abs(a.credit) < 0.005) continue;
    if (!accounts.has(account)) accounts.set(account, []);
    accounts.get(account)!.push({ cp, label: cpLabel(account, cp), opening: a.opening, debit: a.debit, credit: a.credit, closing });
  }

  const accountOrder = Object.keys(ACCOUNT_LABELS);
  const sortedAccounts = [...accounts.entries()].sort((a, b) =>
    (accountOrder.indexOf(a[0]) + 100 * Number(accountOrder.indexOf(a[0]) < 0)) -
    (accountOrder.indexOf(b[0]) + 100 * Number(accountOrder.indexOf(b[0]) < 0)));

  const grand = { opening: 0, debit: 0, credit: 0, closing: 0 };
  for (const [, rows] of sortedAccounts) {
    for (const r of rows) { grand.opening += r.opening; grand.debit += r.debit; grand.credit += r.credit; grand.closing += r.closing; }
  }

  const th: React.CSSProperties = { padding: '8px 14px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 14px', fontSize: '13px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1400px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Оборотно-сальдова відомість
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Вхідне сальдо, обороти Дт/Кт і вихідне сальдо за леджером подвійного запису
        </p>
      </div>

      <FinanceTabs />

      {/* Період */}
      <form method="GET" className="fin-card" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', margin: '20px 0', padding: '14px 18px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>З</label>
          <input type="date" name="from" defaultValue={from} style={{ height: '34px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg-soft)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>По</label>
          <input type="date" name="to" defaultValue={to} style={{ height: '34px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg-soft)', color: 'var(--text-primary)' }} />
        </div>
        <button type="submit" style={{ height: '34px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          Сформувати
        </button>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Сальдо: + дебетове · − кредитове
        </span>
      </form>

      <div className="fin-card" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-soft)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ ...th, textAlign: 'left' }}>Рахунок / Контрагент</th>
              <th style={th}>Сальдо на {from}</th>
              <th style={th}>Оборот Дт</th>
              <th style={th}>Оборот Кт</th>
              <th style={th}>Сальдо на {to}</th>
            </tr>
          </thead>
          <tbody>
            {sortedAccounts.map(([account, rows]) => {
              const sub = rows.reduce((s, r) => ({ opening: s.opening + r.opening, debit: s.debit + r.debit, credit: s.credit + r.credit, closing: s.closing + r.closing }), { opening: 0, debit: 0, credit: 0, closing: 0 });
              const showDetail = rows.length > 1 || rows[0]?.cp;
              return [
                <tr key={account} style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {ACCOUNT_LABELS[account] ?? account}
                  </td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(sub.opening)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(sub.debit)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(sub.credit)}</td>
                  <td style={{ ...td, fontWeight: 800, color: sub.closing >= 0 ? 'var(--text-primary)' : '#DC2626' }}>{fmt(sub.closing)}</td>
                </tr>,
                ...(showDetail ? rows.sort((a, b) => a.closing - b.closing).map(r => (
                  <tr key={`${account}|${r.cp}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ ...td, textAlign: 'left', paddingLeft: '32px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                      {r.label || '(без контрагента)'}
                    </td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{fmt(r.opening)}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{fmt(r.debit)}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{fmt(r.credit)}</td>
                    <td style={{ ...td, color: r.closing >= 0 ? 'var(--text-secondary)' : '#DC2626' }}>{fmt(r.closing)}</td>
                  </tr>
                )) : []),
              ];
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-soft)' }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>Разом (контроль: має бути 0)</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmt(grand.opening)}</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmt(grand.debit)}</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmt(grand.credit)}</td>
              <td style={{ ...td, fontWeight: 800, color: Math.abs(grand.closing) < 0.01 ? '#15803D' : '#DC2626' }}>{fmt(grand.closing)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
