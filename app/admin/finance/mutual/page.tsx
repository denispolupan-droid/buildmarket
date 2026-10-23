import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createServiceClient } from '../../../../lib/supabase';
import { requireStaffPage } from '../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { SELLER } from '../../../../lib/company';
import { isSpecialDebtor } from '../../../../lib/accounting/sale-party';
import {
  accountsFor, buildJournal, buildMutualStatement, counterpartyRefString, documentHref, groupAccounts, groupOf,
  orderHref, parseCounterpartyRef, parseGroup, specialLabel, COUNTERPARTY_GROUPS, SETTLEMENT_ACCOUNT_LABEL,
  type CounterpartyGroup, type CounterpartyRef, type LedgerEntry, type SettlementAccount,
} from '../../../../lib/accounting/mutual-settlements';
import FinanceTabs from '../FinanceTabs';
import ActClient, { type ActRow } from '../_act/ActClient';
import CounterpartyPicker from './CounterpartyPicker';
import PeriodBar from './PeriodBar';
import JournalTable, { type JournalItem } from './JournalTable';

export const dynamic = 'force-dynamic';

type Db = ReturnType<typeof createServiceClient>;

type Counterparty = {
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  group: CounterpartyGroup;
  /** Баланс кабінету дропшипера — для порівняння з рахунком `partner` */
  cabinetBalance: number | null;
};

const CUSTOMER_TYPE_LABEL: Record<string, string> = { dropship_partner: 'Дропшипер', wholesale: 'Оптовик', retail: 'Клієнт' };
const UUID = /^[0-9a-f-]{36}$/i;

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const dmy = (d: string) => d.slice(0, 10).split('-').reverse().join('.');

/** Хто кому винен — словами, бо знак у взаєморозрахунках читають по-різному. */
function balanceWords(v: number): { text: string; color: string; bg: string } {
  if (Math.abs(v) < 0.005) return { text: 'розрахунки закриті', color: 'var(--text-muted)', bg: 'var(--bg-soft)' };
  return v > 0
    ? { text: 'борг контрагента', color: '#15803D', bg: '#F0FDF4' }
    : { text: 'наш борг',         color: '#B45309', bg: '#FFF7ED' };
}

function SaldoTag({ v }: { v: number }) {
  const w = balanceWords(v);
  return (
    <span style={{ display: 'inline-block', marginLeft: '8px', padding: '1px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: w.color, background: w.bg, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
      {w.text}
    </span>
  );
}

function chunks<T>(arr: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function qs(p: Record<string, string | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
  return `/admin/finance/mutual?${u}`;
}

async function loadCounterparty(db: Db, ref: CounterpartyRef): Promise<Counterparty | null> {
  if (ref.kind === 'special') {
    return { name: specialLabel(ref.id), legalName: null, taxId: null, address: null, group: 'services', cabinetBalance: null };
  }
  if (ref.kind === 'supplier') {
    const { data } = await db.from('suppliers').select('name, legal_name, edrpou').eq('id', Number(ref.id)).maybeSingle();
    return data
      ? { name: data.name as string, legalName: data.legal_name as string | null, taxId: data.edrpou as string | null, address: null, group: 'suppliers', cabinetBalance: null }
      : null;
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
    group: groupOf(ref, data.type as string | null),
    cabinetBalance: data.type === 'dropship_partner' ? Number(data.balance ?? 0) : null,
  };
}

// ── Журнал контрагентів групи ─────────────────────────────────────────────────

// Клієнт бази — усередині компонента, НЕ пропом: у dev React серіалізує пропси
// серверних компонентів для налагодження, і екземпляр класу валить клієнт
// («Object prototype may only be an Object or null») — сторінка не відкривалась.
async function Journal({ group, dateFrom, dateTo }: { group: CounterpartyGroup; dateFrom: string; dateTo: string }) {
  const db = createServiceClient();
  const accounts = groupAccounts(group);
  const belongs = (id: string) =>
    group === 'suppliers' ? /^\d+$/.test(id)
    : group === 'services' ? isSpecialDebtor(id)
    : UUID.test(id);

  // Сальдо зараз — з кешу (інваріант I3 тримає його рівним леджеру); рухи —
  // лише від початку періоду: сальдо на кінець = зараз − рухи після періоду.
  const [balRows, entries] = await Promise.all([
    fetchAllRows<{ counterparty_id: string; balance: number }>((f, t) => db.from('counterparty_balances')
      .select('counterparty_id, balance')
      .in('account_type', accounts).eq('currency', 'UAH')
      .order('counterparty_id').order('account_type').range(f, t)),
    fetchAllRows<{ counterparty_id: string; amount: number; business_date: string }>((f, t) => db.from('money_entries')
      .select('counterparty_id, amount, business_date')
      .in('account_type', accounts)
      .gte('business_date', dateFrom)
      .order('id').range(f, t)),
  ]);
  const current = new Map<string, number>();
  for (const r of balRows) if (belongs(r.counterparty_id)) current.set(r.counterparty_id, (current.get(r.counterparty_id) ?? 0) + Number(r.balance));
  let rows = buildJournal({ current, entries: entries.filter(e => belongs(e.counterparty_id)), dateFrom, dateTo });

  const names = new Map<string, { name: string; sub: string | null }>();
  if (group === 'suppliers') {
    for (const ids of chunks(rows.map(r => Number(r.counterpartyId)))) {
      const { data } = await db.from('suppliers').select('id, name').in('id', ids).limit(ids.length);
      for (const s of data ?? []) names.set(String(s.id), { name: s.name as string, sub: null });
    }
  } else if (group === 'services') {
    for (const r of rows) names.set(r.counterpartyId, { name: specialLabel(r.counterpartyId), sub: null });
  } else {
    const wantPartner = group === 'partners';
    const keep = new Set<string>();
    for (const ids of chunks(rows.map(r => r.counterpartyId))) {
      const { data } = await db.from('customers').select('id, name, company, legal_name, phone, type').in('id', ids).limit(ids.length);
      for (const c of data ?? []) {
        if ((c.type === 'dropship_partner') !== wantPartner) continue;
        keep.add(c.id as string);
        names.set(c.id as string, {
          name: (c.company as string | null)?.trim() || (c.legal_name as string | null)?.trim() || (c.name as string),
          sub: [CUSTOMER_TYPE_LABEL[c.type as string] ?? 'Клієнт', c.phone].filter(Boolean).join(' · '),
        });
      }
    }
    rows = rows.filter(r => keep.has(r.counterpartyId));
  }

  const items: JournalItem[] = rows.map(r => ({
    href: qs({ cp: counterpartyRefString(
      group === 'suppliers' ? { kind: 'supplier', id: r.counterpartyId }
      : group === 'services' ? { kind: 'special', id: r.counterpartyId }
      : { kind: 'customer', id: r.counterpartyId }), from: dateFrom, to: dateTo }),
    name: names.get(r.counterpartyId)?.name ?? r.counterpartyId,
    sub: names.get(r.counterpartyId)?.sub ?? null,
    opening: r.opening, debit: r.debit, credit: r.credit, closing: r.closing,
  }));

  return <JournalTable items={items} emptyText="За цей період ні сальдо, ні руху" />;
}

// ── Рух по контрагенту ────────────────────────────────────────────────────────

async function Statement({ cpRef: ref, counterparty, dateFrom, dateTo, showInternal, view }: {
  cpRef: CounterpartyRef; counterparty: Counterparty; dateFrom: string; dateTo: string; showInternal: boolean; view: 'moves' | 'act';
}) {
  const db = createServiceClient();
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

  // Номери документів і замовлень — щоб кожен рядок вів на свою угоду
  const docIds = [...new Set(st.rows.map(r => r.doc_id).filter(Boolean))] as string[];
  const ordIds = [...new Set(st.rows.map(r => r.order_id).filter(Boolean))] as string[];
  const [docParts, ordParts] = await Promise.all([
    Promise.all(chunks(docIds).map(ids => db.from('acc_documents').select('id, doc_number, doc_type').in('id', ids).limit(ids.length))),
    Promise.all(chunks(ordIds).map(ids => db.from('orders').select('id, order_number').in('id', ids).limit(ids.length))),
  ]);
  const docMap = new Map(docParts.flatMap(p => p.data ?? []).map(d => [d.id as string, { number: d.doc_number as string | null, type: d.doc_type as string }]));
  const ordMap = new Map(ordParts.flatMap(p => p.data ?? []).map(o => [o.id as string, o.order_number as number]));

  // Сальдо після кожного рядка — наростаючим підсумком від сальдо на початок
  const runningAfter: number[] = [];
  for (const r of st.rows) {
    const prev = runningAfter.length ? runningAfter[runningAfter.length - 1] : st.opening;
    runningAfter.push(Math.round((prev + r.amount) * 100) / 100);
  }
  const lines = st.rows.map((r, i) => {
    const doc = r.doc_id ? docMap.get(r.doc_id) : undefined;
    const orderNumber = r.order_id ? (ordMap.get(r.order_id) ?? null) : null;
    return {
      ...r, doc, orderNumber, running: runningAfter[i],
      docHref: documentHref({ entryDocType: r.doc_type, docId: r.doc_id, accDocType: doc?.type ?? null, orderNumber }),
    };
  });

  const cpStr = counterpartyRefString(ref);
  const base = { cp: cpStr, from: dateFrom, to: dateTo, internal: showInternal ? '1' : null };
  // Рахунки без руху й сальдо не показуємо: у звичайного покупця «Баланс партнера» — вічний нуль
  const shownAccounts = st.accounts.filter(a => Math.abs(a.opening) > 0.005 || a.debit > 0.005 || a.credit > 0.005);
  const multi = shownAccounts.length > 1;
  const totalWords = balanceWords(st.closing);
  const totalDebit  = lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.amount < 0 ? -l.amount : 0), 0);

  const th: React.CSSProperties = { padding: '10px 10px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: '13px', verticalAlign: 'top', borderBottom: '1px solid var(--border-light, var(--border))' };
  const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const sumRow: React.CSSProperties = { ...td, fontWeight: 700, background: 'var(--bg-soft)' };
  const link: React.CSSProperties = { color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 };

  return (
    <>
      <div className="act-no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <Link href={qs({ group: counterparty.group, from: dateFrom, to: dateTo })}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px' }}>
          <ArrowLeft size={15} /> {COUNTERPARTY_GROUPS.find(g => g.key === counterparty.group)?.label}
        </Link>
        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>{counterparty.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {[counterparty.legalName !== counterparty.name ? counterparty.legalName : null, counterparty.taxId, counterparty.address].filter(Boolean).join(' · ') || `${dmy(dateFrom)} — ${dmy(dateTo)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Link href={qs({ ...base, view: null })} className={'fin-pill' + (view === 'moves' ? ' active' : '')}>Рух документів</Link>
          <Link href={qs({ ...base, view: 'act' })} className={'fin-pill' + (view === 'act' ? ' active' : '')}>Акт звірки</Link>
        </div>
      </div>

      {/* Підсумок як у банківській виписці: сальдо — сума без знака + хто кому винен,
          обороти — тими самими рядками, що в таблиці й акті (без схованих заліків) */}
      <div className="act-no-print fin-card mutual-sum" style={{ marginBottom: '12px', padding: '10px 18px' }}>
        <div className="fin-money-grid" style={{ marginTop: 0 }}>
          <div>
            <div className="fin-kpi-label">Сальдо на {dmy(dateFrom)}</div>
            <div className="fin-money-val">{fmt(Math.abs(st.opening))} ₴<SaldoTag v={st.opening} /></div>
          </div>
          <div>
            <div className="fin-kpi-label">Розхід за період</div>
            <div className="fin-money-val">{fmt(totalDebit)} ₴</div>
            <div className="fin-money-sub">{ref.kind === 'supplier' ? 'оплати й повернення постачальнику' : 'відвантаження, виплати, комісії'}</div>
          </div>
          <div>
            <div className="fin-kpi-label">Прихід за період</div>
            <div className="fin-money-val">{fmt(totalCredit)} ₴</div>
            <div className="fin-money-sub">{ref.kind === 'supplier' ? 'поставки товару' : 'оплати, поповнення, наложка'}</div>
          </div>
          <div>
            <div className="fin-kpi-label">Сальдо на {dmy(dateTo)}</div>
            <div className="fin-money-val" style={{ fontWeight: 900 }}>{fmt(Math.abs(st.closing))} ₴<SaldoTag v={st.closing} /></div>
          </div>
        </div>
        {/* Щільніше за стандартну fin-картку: це шапка виписки, а не дашборд */}
        <style>{`
          .mutual-sum .fin-money-val { font-size: 17px; margin-top: 2px; }
          .mutual-sum .fin-money-sub { margin-top: 1px; }
          .mutual-sum .fin-kpi-label { font-size: 10.5px; }
          .mutual-sum .fin-money-grid { gap: 14px; }
          .mutual-sum .fin-money-grid > div { padding-left: 14px; }
          .mutual-sum .fin-money-grid > div:first-child { padding-left: 0; }
          .mutual-sum .fin-table { margin-top: 8px !important; }
          .mutual-sum .fin-table td { padding: 5px 8px 5px 0; font-size: 12.5px; }
        `}</style>

        {multi && (
          <table className="fin-table" style={{ marginTop: '16px', borderTop: '1px solid var(--border)' }}>
            <tbody>
              {shownAccounts.map(a => (
                <tr key={a.account}>
                  <td className="muted">{SETTLEMENT_ACCOUNT_LABEL[a.account]}</td>
                  <td className="num muted">на {dmy(dateFrom)}: {fmt(Math.abs(a.opening))} ₴</td>
                  <td className="num">на {dmy(dateTo)}: {fmt(Math.abs(a.closing))} ₴</td>
                  <td style={{ width: '1%' }}><SaldoTag v={a.closing} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {counterparty.cabinetBalance != null && (
          <div className="fin-hint" style={{ marginTop: '12px' }}>
            Баланс у кабінеті партнера зараз — {fmt(counterparty.cabinetBalance)} ₴. Від обліку може відрізнятись на суму замовлень у дорозі:
            кабінет списує їх при оформленні, облік — при врученні.
          </div>
        )}
      </div>

      {(st.hiddenInternal > 0 || showInternal) && (
        <div className="act-no-print fin-hint" style={{ margin: '0 0 10px', fontSize: '12px' }}>
          {showInternal
            ? 'Показано внутрішні заліки між рахунками контрагента і сторновані проводки. '
            : `Сховано рядків: ${st.hiddenInternal} — внутрішні заліки авансу партнера і проводки разом з їх сторно (у сумі нуль, на сальдо не впливають). `}
          <Link href={qs({ ...base, internal: showInternal ? null : '1', view: view === 'act' ? 'act' : null })} className="fin-hint-toggle">
            {showInternal ? 'Сховати' : 'Показати'}
          </Link>
        </div>
      )}

      {view === 'act' ? (
        <ActClient
          counterpartyName={counterparty.name}
          counterpartyLegalName={counterparty.legalName}
          counterpartyTaxId={counterparty.taxId}
          counterpartyAddress={counterparty.address}
          dateFrom={dateFrom}
          dateTo={dateTo}
          opening={st.opening}
          rows={lines.map<ActRow>(l => {
            const refs = [l.doc?.number, l.orderNumber != null ? `#${l.orderNumber}` : null].filter(Boolean).join(', ');
            return {
              date: l.business_date,
              docText: `${l.label}${refs ? ` (${refs})` : ''}`,
              description: [multi ? SETTLEMENT_ACCOUNT_LABEL[l.account_type] : null, l.description].filter(Boolean).join(' — '),
              debit: l.amount > 0 ? l.amount : 0,
              credit: l.amount < 0 ? -l.amount : 0,
              docHref: l.docHref,
              orderNumber: l.orderNumber,
            };
          })}
          ourName={SELLER.name}
          ourSigner={SELLER.signatory || SELLER.name.replace(/^ФОП\s+/, '')}
          mode={ref.kind === 'supplier' ? 'supplier' : 'customer'}
        />
      ) : (
        <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
            <b>Розхід</b> — що ми віддали контрагенту (товар, гроші), <b>прихід</b> — що отримали від нього.
            Сальдо: плюс — борг контрагента, мінус — наш борг. Клік по документу чи замовленню відкриває угоду.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
              <thead>
                <tr>
                  <th style={th}>Дата</th>
                  <th style={th}>Документ</th>
                  <th style={th}>Замовлення</th>
                  <th style={th}>Зміст</th>
                  <th style={{ ...th, textAlign: 'right' }}>Розхід</th>
                  <th style={{ ...th, textAlign: 'right' }}>Прихід</th>
                  <th style={{ ...th, textAlign: 'right' }}>Сальдо</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} style={sumRow}>Сальдо на {dmy(dateFrom)}</td>
                  <td style={{ ...num, ...sumRow }}>{fmt(st.opening)}</td>
                </tr>
                {lines.length === 0 && (
                  <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '28px' }}>Руху за період немає</td></tr>
                )}
                {lines.map(l => {
                  const running = l.running;
                  const docLabel = l.doc?.number ? `${l.label} ${l.doc.number}` : l.label;
                  const oHref = orderHref(l.orderNumber);
                  return (
                    <tr key={l.id} className="mutual-row">
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{dmy(l.business_date)}</td>
                      <td style={td}>
                        {l.docHref && l.doc
                          ? <Link href={l.docHref} target="_blank" style={link}>{docLabel}</Link>
                          : <span style={{ fontWeight: 600 }}>{docLabel}</span>}
                        {multi && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{SETTLEMENT_ACCOUNT_LABEL[l.account_type]}</div>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {oHref ? <Link href={oHref} target="_blank" style={link}>#{l.orderNumber}</Link> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ ...td, color: 'var(--text-secondary)', fontSize: '12.5px' }}>{l.description ?? ''}</td>
                      <td style={num}>{l.amount > 0 ? fmt(l.amount) : ''}</td>
                      <td style={num}>{l.amount < 0 ? fmt(-l.amount) : ''}</td>
                      <td style={{ ...num, fontWeight: 600, color: running > 0.005 ? '#15803D' : running < -0.005 ? '#B45309' : 'var(--text-muted)' }}>{fmt(running)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={4} style={sumRow}>Обороти за період</td>
                  <td style={{ ...num, ...sumRow }}>{fmt(totalDebit)}</td>
                  <td style={{ ...num, ...sumRow }}>{fmt(totalCredit)}</td>
                  <td style={sumRow} />
                </tr>
                <tr>
                  <td colSpan={6} style={{ ...sumRow, borderBottom: 'none' }}>Сальдо на {dmy(dateTo)} — {totalWords.text}</td>
                  <td style={{ ...num, ...sumRow, borderBottom: 'none', color: totalWords.color }}>{fmt(st.closing)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <style>{`.mutual-row:hover td { background: var(--bg-soft); }`}</style>
        </div>
      )}
    </>
  );
}

// ── Сторінка ──────────────────────────────────────────────────────────────────

export default async function MutualSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ cp?: string; group?: string; from?: string; to?: string; internal?: string; view?: string }>;
}) {
  await requireStaffPage('admin');
  const sp = await searchParams;
  const db = createServiceClient();

  const today      = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dateFrom = isDate(sp.from) ? sp.from! : monthStart;
  const dateTo   = isDate(sp.to)   ? sp.to!   : today;

  const ref = parseCounterpartyRef(sp.cp);
  const counterparty = ref ? await loadCounterparty(db, ref) : null;
  const group: CounterpartyGroup = counterparty?.group ?? parseGroup(sp.group) ?? 'customers';

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div className="act-no-print">
        <div style={{ marginBottom: '14px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Взаєморозрахунки</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Розрахунки з покупцями, партнерами й постачальниками за період — рух документів і акт звірки
          </p>
        </div>
        <FinanceTabs />

        <div className="fin-card" style={{ margin: '16px 0 10px', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {COUNTERPARTY_GROUPS.map(g => (
              <Link key={g.key} href={qs({ group: g.key, from: dateFrom, to: dateTo })}
                className={'fin-pill' + (g.key === group ? ' active' : '')}>
                {g.label}
              </Link>
            ))}
          </div>
          <PeriodBar dateFrom={dateFrom} dateTo={dateTo} />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <CounterpartyPicker
            value={ref && counterparty ? { ref: counterpartyRefString(ref), label: counterparty.name } : null}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </div>
      </div>

      {ref && counterparty
        ? <Statement cpRef={ref} counterparty={counterparty} dateFrom={dateFrom} dateTo={dateTo}
            showInternal={sp.internal === '1'} view={sp.view === 'act' ? 'act' : 'moves'} />
        : sp.cp
          ? <div className="fin-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>Контрагента не знайдено</div>
          : <Journal group={group} dateFrom={dateFrom} dateTo={dateTo} />}
    </div>
  );
}

