'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export type CashflowEntry = {
  id:           string;
  txn_id:       string;
  account_type: 'cash' | 'bank' | 'acquiring';
  amount:       number;           // + надходження, - видаток
  description:  string | null;
  business_date: string;
  doc_id:       string | null;
  doc_type:     string | null;
  doc_number:   string | null;
  counterparty: string | null;    // ім'я клієнта або постачальника
};

const ACCOUNT_LABELS: Record<string, { label: string }> = {
  cash:      { label: 'Каса' },
  bank:      { label: 'Банк' },
  acquiring: { label: 'Еквайринг' },
};

function docHref(e: CashflowEntry): string | null {
  if (!e.doc_id) return null;
  if (e.doc_type === 'purchase_order' || e.doc_type === 'supplier_payment') return `/admin/procurement/${e.doc_id}`;
  if (e.doc_type === 'receipt' || e.doc_type === 'stock_in') return `/admin/procurement/receipts/${e.doc_id}`;
  if (e.doc_type === 'sale' || e.doc_type === 'payment') return `/admin/accounting/documents/${e.doc_id}`;
  return null;
}

function fmt(n: number) {
  return Math.abs(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBalance(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt0(n: number) {
  return Math.abs(n).toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

type Props = {
  entries:          CashflowEntry[];
  openingByAccount: { cash: number; bank: number; acquiring: number };  // залишки ДО періоду по кожному рахунку
  defaultFrom:      string;
  defaultTo:        string;
};

export default function CashflowClient({ entries, openingByAccount, defaultFrom, defaultTo }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(defaultFrom);
  const [to,   setTo]   = useState(defaultTo);

  function applyDates(newFrom: string, newTo: string) {
    if (newFrom && newTo) {
      router.push(`/admin/finance/cashflow?from=${newFrom}&to=${newTo}`);
    }
  }

  // Пресети періоду — ті самі кроки, що і в решті розділу
  function preset(kind: 'cur_month' | 'prev_month' | 'd7' | 'd30') {
    const now = new Date();
    const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
    let f: Date, t: Date = now;
    if (kind === 'cur_month')      f = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (kind === 'prev_month') { f = new Date(now.getFullYear(), now.getMonth() - 1, 1); t = new Date(now.getFullYear(), now.getMonth(), 0); }
    else if (kind === 'd7')        { f = new Date(now); f.setDate(f.getDate() - 6); }
    else                           { f = new Date(now); f.setDate(f.getDate() - 29); }
    setFrom(iso(f)); setTo(iso(t));
    applyDates(iso(f), iso(t));
  }

  const [account, setAccount] = useState<'all' | 'cash' | 'bank' | 'acquiring'>('all');
  const [dir,     setDir]     = useState<'all' | 'in' | 'out'>('all');
  const [search,  setSearch]  = useState('');

  // Вхідний залишок ОБРАНОГО рахунку (або всіх). Раніше фільтр «Каса» показував
  // касові рухи від ЗАГАЛЬНОГО залишку — колонка балансу брехала.
  const openingBalance = account === 'all'
    ? openingByAccount.cash + openingByAccount.bank + openingByAccount.acquiring
    : openingByAccount[account];

  const accountEntries = useMemo(
    () => (account === 'all' ? entries : entries.filter(e => e.account_type === account)),
    [entries, account],
  );

  // Apply client-side filters (the data is already period-filtered server-side)
  const filtered = useMemo(() => {
    return accountEntries.filter(e => {
      if (dir === 'in'  && e.amount <= 0) return false;
      if (dir === 'out' && e.amount >= 0) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.description?.toLowerCase().includes(q) &&
          !e.counterparty?.toLowerCase().includes(q) &&
          !e.doc_number?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [accountEntries, dir, search]);

  // Наскрізний баланс має сенс лише для БЕЗПЕРЕРВНОГО журналу: фільтр напрямку
  // чи пошук вирізає рядки, і «баланс після операції» стає вигаданим — колонку ховаємо.
  const showBalance = dir === 'all' && !search;

  // Running balance (entries are newest-first; calculate oldest-first, then reverse display)
  const withBalance = useMemo(() => {
    const reversed = [...filtered].reverse();
    let bal = openingBalance;
    const rows = reversed.map(e => {
      bal += e.amount;
      return { ...e, balance: bal };
    });
    return rows.reverse();
  }, [filtered, openingBalance]);

  // Групи по днях (journal newest-first): заголовок дня + денний підсумок
  const dayGroups = useMemo(() => {
    const groups: { date: string; rows: typeof withBalance; dayIn: number; dayOut: number }[] = [];
    for (const row of withBalance) {
      const last = groups[groups.length - 1];
      if (!last || last.date !== row.business_date) {
        groups.push({ date: row.business_date, rows: [row], dayIn: Math.max(0, row.amount), dayOut: Math.min(0, row.amount) });
      } else {
        last.rows.push(row);
        if (row.amount > 0) last.dayIn += row.amount; else last.dayOut += row.amount;
      }
    }
    return groups;
  }, [withBalance]);

  // Summary
  const totalIn  = filtered.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalOut = filtered.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);
  // Вихідний залишок — по обраному рахунку, без урахування фільтрів напрямку/пошуку
  const closingBalance = openingBalance + accountEntries.reduce((s, e) => s + e.amount, 0);

  const inp: React.CSSProperties = {
    height: '34px', padding: '0 10px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
  };

  const gridCols = showBalance ? '90px 1fr 150px 120px 120px' : '90px 1fr 150px 120px';
  // Зі знаком: fmt0 бере модуль (для сум зі стрілками), а залишок рахунку буває від'ємним
  const fmtSigned = (n: number) => n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
  const accountsSub = (v: { cash: number; bank: number; acquiring: number }) =>
    `Каса ${fmtSigned(v.cash)} · Банк ${fmtSigned(v.bank)} · Екв. ${fmtSigned(v.acquiring)}`;
  // Розбивка вихідного залишку по рахунках (для sub-рядка картки)
  const closingByAccount = useMemo(() => {
    const c = { ...openingByAccount };
    for (const e of entries) c[e.account_type] += e.amount;
    return c;
  }, [entries, openingByAccount]);

  return (
    <div>
      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          { label: 'Залишок на початок', value: openingBalance, color: undefined as string | undefined, sign: '',
            sub: account === 'all' ? accountsSub(openingByAccount) : `рахунок: ${ACCOUNT_LABELS[account].label}` },
          { label: 'Надходження',        value: totalIn,        color: '#15803D', sign: '+',
            sub: `${filtered.filter(e => e.amount > 0).length} операцій за період` },
          { label: 'Видатки',            value: Math.abs(totalOut), color: '#DC2626', sign: '−',
            sub: `${filtered.filter(e => e.amount < 0).length} операцій за період` },
          { label: 'Залишок на кінець',  value: closingBalance, color: closingBalance < 0 ? '#DC2626' : undefined, sign: '',
            sub: account === 'all' ? accountsSub(closingByAccount) : `рахунок: ${ACCOUNT_LABELS[account].label}` },
        ].map(card => (
          <div key={card.label} className="fin-card">
            <div className="fin-kpi-label">{card.label}</div>
            <div className="fin-money-val" style={card.color ? { color: card.color } : undefined}>
              {card.sign}{fmtBalance(card.value)} ₴
            </div>
            <div className="fin-money-sub">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        {/* Period presets */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {([
            { key: 'cur_month',  label: 'Цей місяць' },
            { key: 'prev_month', label: 'Минулий' },
            { key: 'd7',  label: '7 днів' },
            { key: 'd30', label: '30 днів' },
          ] as const).map(pr => (
            <button key={pr.key} onClick={() => preset(pr.key)} className="fin-pill" style={{ cursor: 'pointer' }}>
              {pr.label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <input type="date" value={from}
          onChange={e => { setFrom(e.target.value); applyDates(e.target.value, to); }}
          style={{ ...inp, width: '138px' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
        <input type="date" value={to}
          onChange={e => { setTo(e.target.value); applyDates(from, e.target.value); }}
          style={{ ...inp, width: '138px' }} />

        {/* Account tabs */}
        <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
          {(['all', 'cash', 'bank', 'acquiring'] as const).map(a => (
            <button key={a} onClick={() => setAccount(a)}
              className={'fin-pill' + (account === a ? ' active' : '')}
              style={{ cursor: 'pointer' }}>
              {a === 'all' ? 'Всі рахунки' : ACCOUNT_LABELS[a].label}
            </button>
          ))}
        </div>

        {/* Direction tabs */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {([
            { key: 'all', label: 'Всі' },
            { key: 'in',  label: '↓ Прихід' },
            { key: 'out', label: '↑ Видаток' },
          ] as const).map(d => (
            <button key={d.key} onClick={() => setDir(d.key)}
              className={'fin-pill' + (dir === d.key ? ' active' : '')}
              style={{ cursor: 'pointer' }}>
              {d.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text" placeholder="Пошук…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inp, width: '200px', marginLeft: 'auto' }}
        />
      </div>

      {/* ── Journal grouped by day ── */}
      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          padding: '8px 16px',
          background: 'var(--bg-soft)',
          borderBottom: '1px solid var(--border)',
          fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
        }}>
          <span>Рахунок</span>
          <span>Опис</span>
          <span>Контрагент</span>
          <span style={{ textAlign: 'right' }}>Сума</span>
          {showBalance && <span style={{ textAlign: 'right' }}>Баланс</span>}
        </div>

        {withBalance.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Операцій не знайдено
          </div>
        )}

        {dayGroups.map(g => {
          const d = new Date(g.date);
          const dayLabel = `${WEEKDAYS[d.getDay()]}, ${d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}`;
          return (
            <div key={g.date}>
              {/* Роздільник дня з денним підсумком */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 16px', background: 'var(--bg-soft)',
                borderBottom: '1px solid var(--border-light)', borderTop: '1px solid var(--border-light)',
              }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>{dayLabel}</span>
                <span style={{ fontSize: '11.5px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                  {g.dayIn > 0 && <span style={{ color: '#15803D', fontWeight: 600 }}>+{fmt0(g.dayIn)} ₴</span>}
                  {g.dayIn > 0 && g.dayOut < 0 && ' · '}
                  {g.dayOut < 0 && <span style={{ color: '#DC2626', fontWeight: 600 }}>−{fmt0(g.dayOut)} ₴</span>}
                </span>
              </div>

              {g.rows.map(e => {
                const isIn = e.amount > 0;
                const href = docHref(e);
                return (
                  <div key={e.id} style={{
                    display: 'grid',
                    gridTemplateColumns: gridCols,
                    padding: '9px 16px',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border-light)',
                  }}>
                    {/* Account */}
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {ACCOUNT_LABELS[e.account_type].label}
                    </span>

                    {/* Description + doc link */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.description ?? '—'}
                      </div>
                      {href && e.doc_number && (
                        <Link href={href} style={{
                          fontSize: '11px', color: 'var(--brand-blue)', textDecoration: 'none', fontWeight: 600,
                        }}>
                          {e.doc_number}
                        </Link>
                      )}
                    </div>

                    {/* Counterparty */}
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.counterparty ?? '—'}
                    </span>

                    {/* Amount */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        {isIn
                          ? <ArrowDownLeft size={13} color="#15803D" />
                          : <ArrowUpRight  size={13} color="#DC2626" />}
                        <span style={{
                          fontSize: '14px', fontWeight: 700,
                          color: isIn ? '#15803D' : '#DC2626',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {isIn ? '+' : '−'}{fmt(e.amount)} ₴
                        </span>
                      </div>
                    </div>

                    {/* Running balance */}
                    {showBalance && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          fontSize: '13px', fontWeight: 600,
                          color: e.balance >= 0 ? 'var(--text-primary)' : '#DC2626',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {fmtBalance(e.balance)} ₴
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', gap: '12px' }}>
        <span className="fin-hint" style={{ marginTop: 0 }}>
          Залишки — сума проводок обліку по рахунках Каса/Банк/Еквайринг.
          {!showBalance && ' Колонка «Баланс» прихована: при фільтрі напрямку чи пошуку наскрізний залишок не має сенсу.'}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
          {filtered.length} операцій
        </span>
      </div>
    </div>
  );
}
